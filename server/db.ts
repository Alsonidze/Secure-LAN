import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateDeviceFingerprint } from './fingerprint.js';

export type { SqlJsDatabase };

let dbInstance: SqlJsDatabase | null = null;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'secure_lan.sqlite');
const DB_TMP_PATH = path.join(DATA_DIR, 'secure_lan.sqlite.tmp');
const DB_BAK_PATH = path.join(DATA_DIR, 'secure_lan.sqlite.bak');

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('Ошибка загрузки базы данных из файла. Попытка восстановления из резервной копии:', err);
      if (fs.existsSync(DB_BAK_PATH)) {
        const bakBuffer = fs.readFileSync(DB_BAK_PATH);
        dbInstance = new SQL.Database(bakBuffer);
      } else {
        throw new Error('Файл базы данных повреждён и резервная копия отсутствует.');
      }
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDbAtomic();

  return dbInstance;
}

/**
 * Saves database state to disk atomically using temporary file and safe rename.
 */
export function saveDbAtomic(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);

    // 1. Write to temporary file first
    fs.writeFileSync(DB_TMP_PATH, buffer);

    // 2. Make backup of current valid file if exists
    if (fs.existsSync(DB_PATH)) {
      try {
        fs.copyFileSync(DB_PATH, DB_BAK_PATH);
      } catch (e) {
        // quiet warning on backup failure
      }
    }

    // 3. Atomically replace main file with temporary file
    fs.renameSync(DB_TMP_PATH, DB_PATH);
  } catch (err) {
    console.error('Критический сбой атомарного сохранения SQLite:', err);
  }
}

export function saveDb(): void {
  saveDbAtomic();
}

/**
 * Runs a transactional block: BEGIN -> callback -> COMMIT -> saveDbAtomic.
 * If error occurs: ROLLBACK and do not persist.
 */
export function runTransaction<T>(db: SqlJsDatabase, callback: () => T): T {
  db.run('BEGIN TRANSACTION;');
  try {
    const result = callback();
    db.run('COMMIT;');
    saveDbAtomic();
    return result;
  } catch (error) {
    try {
      db.run('ROLLBACK;');
    } catch (_) {}
    throw error;
  }
}

function initSchema(db: SqlJsDatabase) {
  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      mac_address TEXT NOT NULL UNIQUE,
      hostname TEXT,
      device_type TEXT NOT NULL,
      manufacturer TEXT,
      fingerprint TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'Medium',
      trust_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- UNKNOWN, TEMPORARY, TRUSTED, REVOKED
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      is_online INTEGER NOT NULL DEFAULT 1,
      missed_scans INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS device_fingerprints (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      full_hash TEXT NOT NULL,
      display_fingerprint TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      confidence TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS authorizations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      authorization_type TEXT NOT NULL, -- PERMANENT, TEMPORARY
      starts_at TEXT NOT NULL,
      expires_at TEXT,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      incident_code TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL, -- UNKNOWN_DEVICE, IP_CONFLICT, SUSPICIOUS_STATE
      severity TEXT NOT NULL DEFAULT 'MEDIUM', -- INFO, LOW, MEDIUM, HIGH
      status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED
      summary TEXT NOT NULL,
      explanation TEXT NOT NULL,
      evidence TEXT NOT NULL, -- JSON array
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      FOREIGN KEY(device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      device_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      message TEXT NOT NULL,
      metadata TEXT, -- JSON
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL DEFAULT 'Локальный администратор',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Record schema version 2
  db.run("INSERT OR REPLACE INTO schema_meta (version) VALUES (2);");

  // Check if devices exist; if empty, seed demo data
  const check = db.exec("SELECT COUNT(*) as count FROM devices WHERE deleted_at IS NULL;");
  const count = check[0]?.values[0]?.[0] as number;

  if (count === 0) {
    seedBaselineData(db);
  }
}

/**
 * Calculates cryptographic SHA-256 hash for an audit log entry.
 */
export function calculateAuditEntryHash(
  previousHash: string,
  id: string,
  createdAt: string,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): string {
  const payload = [
    previousHash,
    id,
    createdAt,
    actor.trim(),
    action.trim(),
    targetType.trim(),
    targetId.trim(),
    details.trim()
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').toUpperCase();
}

/**
 * Appends a tamper-evident audit entry to the audit_log table.
 */
export function insertAuditRecord(
  db: SqlJsDatabase,
  data: {
    id?: string;
    actor?: string;
    action: string;
    targetType: string;
    targetId: string;
    details: string;
    createdAt?: string;
  }
): string {
  const id = data.id || crypto.randomUUID();
  const createdAt = data.createdAt || new Date().toISOString();
  const actor = data.actor || 'Локальный администратор';

  // Find previous hash (latest entry in audit_log)
  const lastEntry = dbGet<{ entry_hash: string }>(
    db,
    "SELECT entry_hash FROM audit_log ORDER BY rowid DESC LIMIT 1;"
  );
  const previousHash = lastEntry ? lastEntry.entry_hash : 'GENESIS';

  const entryHash = calculateAuditEntryHash(
    previousHash,
    id,
    createdAt,
    actor,
    data.action,
    data.targetType,
    data.targetId,
    data.details
  );

  db.run(`
    INSERT INTO audit_log (
      id, actor, action, target_type, target_id, details, created_at, previous_hash, entry_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [
    id,
    actor,
    data.action,
    data.targetType,
    data.targetId,
    data.details,
    createdAt,
    previousHash,
    entryHash
  ]);

  return id;
}

/**
 * Verifies the integrity of the audit hash chain from the GENESIS block to the latest entry.
 */
export function verifyAuditIntegrity(db: SqlJsDatabase): {
  valid: boolean;
  checkedRecords: number;
  brokenAt: string | null;
  verifiedAt: string;
} {
  const records = dbAll<{
    id: string;
    actor: string;
    action: string;
    target_type: string;
    target_id: string;
    details: string;
    created_at: string;
    previous_hash: string;
    entry_hash: string;
  }>(db, "SELECT * FROM audit_log ORDER BY rowid ASC;");

  let expectedPrevious = 'GENESIS';

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    if (r.previous_hash !== expectedPrevious) {
      return {
        valid: false,
        checkedRecords: i,
        brokenAt: r.id,
        verifiedAt: new Date().toISOString()
      };
    }

    const computed = calculateAuditEntryHash(
      r.previous_hash,
      r.id,
      r.created_at,
      r.actor,
      r.action,
      r.target_type,
      r.target_id,
      r.details
    );

    if (computed !== r.entry_hash) {
      return {
        valid: false,
        checkedRecords: i,
        brokenAt: r.id,
        verifiedAt: new Date().toISOString()
      };
    }

    expectedPrevious = r.entry_hash;
  }

  return {
    valid: true,
    checkedRecords: records.length,
    brokenAt: null,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Gets the next sequential incident sequence number.
 */
export function getNextIncidentSequence(db: SqlJsDatabase): number {
  const row = dbGet<{ count: number }>(db, "SELECT COUNT(*) as count FROM incidents;");
  return (row?.count || 0) + 1;
}

export function seedBaselineData(db: SqlJsDatabase) {
  const now = new Date();
  const formatIso = (date: Date) => date.toISOString();

  // Whitelisted baseline system settings
  const defaultSettings = [
    ['network_mode', 'demo'],
    ['auto_scan_enabled', 'true'],
    ['auto_scan_interval', '60'],
    ['incident_severity_default', 'MEDIUM'],
    ['create_incident_on_unknown', 'true']
  ];

  for (const [k, v] of defaultSettings) {
    db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);",
      [k, v, formatIso(now)]
    );
  }

  // 5 Baseline trusted devices with locally administered MAC addresses
  const initialDevices = [
    {
      id: 'dev-admin-pc',
      name: 'АРМ администратора',
      ip: '192.168.1.10',
      mac: '02:00:5E:7A:11:01',
      hostname: 'sec-admin-workstation.lan',
      type: 'Desktop',
      manufacturer: 'Lenovo',
      offsetMinutes: 120
    },
    {
      id: 'dev-office-laptop',
      name: 'Рабочий ноутбук',
      ip: '192.168.1.14',
      mac: '02:00:5E:7A:11:02',
      hostname: 'corp-tp-mb.lan',
      type: 'Laptop',
      manufacturer: 'Apple Inc.',
      offsetMinutes: 95
    },
    {
      id: 'dev-printer',
      name: 'Сетевой принтер',
      ip: '192.168.1.20',
      mac: '02:00:5E:7A:11:03',
      hostname: 'hp-laserjet-office.lan',
      type: 'Printer',
      manufacturer: 'HP Inc.',
      offsetMinutes: 180
    },
    {
      id: 'dev-smart-tv',
      name: 'Конференц-дисплей Smart TV',
      ip: '192.168.1.31',
      mac: '02:00:5E:7A:11:04',
      hostname: 'samsung-conf-display.lan',
      type: 'Smart TV',
      manufacturer: 'Samsung Electronics',
      offsetMinutes: 60
    },
    {
      id: 'dev-smartphone',
      name: 'Рабочий смартфон',
      ip: '192.168.1.35',
      mac: '02:00:5E:7A:11:05',
      hostname: 'pixel8-mobile.lan',
      type: 'Smartphone',
      manufacturer: 'Google LLC',
      offsetMinutes: 45
    }
  ];

  for (const d of initialDevices) {
    const firstSeen = new Date(now.getTime() - d.offsetMinutes * 60 * 1000).toISOString();
    const lastSeen = new Date(now.getTime() - Math.floor(Math.random() * 5 + 1) * 60 * 1000).toISOString();

    // Generate fingerprint through unified fingerprint service
    const fpResult = generateDeviceFingerprint({
      macAddress: d.mac,
      hostname: d.hostname,
      manufacturer: d.manufacturer,
      deviceType: d.type
    });

    db.run(`
      INSERT INTO devices (
        id, name, ip_address, mac_address, hostname, device_type, manufacturer,
        fingerprint, confidence, trust_status, first_seen, last_seen, is_online, missed_scans,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRUSTED', ?, ?, 1, 0, ?, ?, NULL);
    `, [
      d.id, d.name, d.ip, d.mac, d.hostname, d.type, d.manufacturer,
      fpResult.fingerprint, fpResult.confidence, firstSeen, lastSeen,
      firstSeen, lastSeen
    ]);

    // Save into device_fingerprints table
    db.run(`
      INSERT INTO device_fingerprints (
        id, device_id, algorithm_version, full_hash, display_fingerprint, attributes_json, confidence, created_at, is_current
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);
    `, [
      crypto.randomUUID(),
      d.id,
      fpResult.algorithmVersion,
      fpResult.fullHash,
      fpResult.fingerprint,
      JSON.stringify(fpResult.attributesUsed),
      fpResult.confidence,
      firstSeen
    ]);

    // Permanent authorization record
    db.run(`
      INSERT INTO authorizations (
        id, device_id, authorization_type, starts_at, expires_at, note, active, created_at
      ) VALUES (?, ?, 'PERMANENT', ?, NULL, 'Постоянно доверенное устройство инфраструктуры', 1, ?);
    `, [crypto.randomUUID(), d.id, firstSeen, firstSeen]);

    // Initial events
    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'DEVICE_DISCOVERED', 'INFO', ?, ?, ?);
    `, [
      crypto.randomUUID(),
      d.id,
      `Устройство ${d.name} обнаружено в подсети 192.168.1.0/24`,
      JSON.stringify({ ip: d.ip, mac: d.mac }),
      firstSeen
    ]);

    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'FINGERPRINT_CREATED', 'INFO', ?, ?, ?);
    `, [
      crypto.randomUUID(),
      d.id,
      `Сформирован цифровой отпечаток: ${fpResult.fingerprint}`,
      JSON.stringify(fpResult),
      firstSeen
    ]);

    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TRUST_GRANTED', 'INFO', ?, ?, ?);
    `, [
      crypto.randomUUID(),
      d.id,
      `Устройство ${d.name} включено в реестр доверенных узлов`,
      JSON.stringify({ fingerprint: fpResult.fingerprint }),
      firstSeen
    ]);

    // Audit record using hash chain
    insertAuditRecord(db, {
      actor: 'Локальный администратор',
      action: 'TRUST_GRANTED',
      targetType: 'DEVICE',
      targetId: d.id,
      details: `Устройство ${d.name} (${d.ip}, ${d.mac}) зарегистрировано как доверенное`,
      createdAt: firstSeen
    });
  }

  // System started event
  db.run(`
    INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
    VALUES (?, NULL, 'SYSTEM_STARTED', 'INFO', 'Система мониторинга Secure LAN успешно инициализирована', '{}', ?);
  `, [crypto.randomUUID(), formatIso(now)]);

  insertAuditRecord(db, {
    actor: 'Система',
    action: 'SYSTEM_INITIALIZED',
    targetType: 'SYSTEM',
    targetId: 'core',
    details: 'Инициализирована демонстрационная среда с 5 доверенными узлами',
    createdAt: formatIso(now)
  });
}

// Database helper utilities for clean typed queries
export function dbAll<T = any>(db: SqlJsDatabase, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function dbGet<T = any>(db: SqlJsDatabase, sql: string, params: any[] = []): T | null {
  const rows = dbAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function dbRun(db: SqlJsDatabase, sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDbAtomic();
}
