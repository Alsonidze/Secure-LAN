import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

export type { SqlJsDatabase };

let dbInstance: SqlJsDatabase | null = null;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'secure_lan.sqlite');

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Initialize schema if not present
  initSchema(dbInstance);
  saveDb();

  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist database to disk:', err);
  }
}

function initSchema(db: SqlJsDatabase) {
  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      mac_address TEXT NOT NULL,
      hostname TEXT,
      device_type TEXT NOT NULL,
      manufacturer TEXT,
      fingerprint TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'Medium',
      trust_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- UNKNOWN, TEMPORARY, TRUSTED, REVOKED
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      is_online INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
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
      evidence TEXT NOT NULL, -- JSON string array
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
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Check if devices exist; if empty, seed demo data
  const check = db.exec("SELECT COUNT(*) as count FROM devices WHERE deleted_at IS NULL;");
  const count = check[0]?.values[0]?.[0] as number;

  if (count === 0) {
    seedBaselineData(db);
  }
}

function seedBaselineData(db: SqlJsDatabase) {
  const now = new Date();
  const formatIso = (date: Date) => date.toISOString();

  // Create default settings
  const defaultSettings = [
    ['network_mode', 'demo'],
    ['auto_scan_enabled', 'true'],
    ['auto_scan_interval', '60'],
    ['incident_severity_default', 'MEDIUM'],
    ['create_incident_on_unknown', 'true'],
    ['language', 'ru'],
    ['app_name', 'Secure LAN'],
    ['theme', 'dark']
  ];

  for (const [k, v] of defaultSettings) {
    db.run(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);",
      [k, v, formatIso(now)]
    );
  }

  // Baseline 5 trusted devices
  const initialDevices = [
    {
      id: 'dev-admin-pc',
      name: 'Administrator PC (АРМ-01)',
      ip: '192.168.1.10',
      mac: '02:00:5E:7A:11:01',
      hostname: 'sec-admin-workstation.lan',
      type: 'Desktop',
      manufacturer: 'Lenovo Group Ltd.',
      fingerprint: 'FP-8A91-4D2E-1001',
      confidence: 'High',
      trust_status: 'TRUSTED',
      offsetMinutes: 120
    },
    {
      id: 'dev-office-laptop',
      name: 'Office Laptop (ThinkPad X1)',
      ip: '192.168.1.14',
      mac: '02:00:5E:7A:11:02',
      hostname: 'corp-tp-mb.lan',
      type: 'Laptop',
      manufacturer: 'Lenovo / Apple Inc.',
      fingerprint: 'FP-3F17-B9C4-1002',
      confidence: 'High',
      trust_status: 'TRUSTED',
      offsetMinutes: 95
    },
    {
      id: 'dev-printer',
      name: 'Network Printer (HP LaserJet Pro)',
      ip: '192.168.1.20',
      mac: '02:00:5E:7A:11:03',
      hostname: 'hp-laserjet-office.lan',
      type: 'Printer',
      manufacturer: 'HP Inc.',
      fingerprint: 'FP-62E8-1A90-1003',
      confidence: 'High',
      trust_status: 'TRUSTED',
      offsetMinutes: 180
    },
    {
      id: 'dev-smart-tv',
      name: 'Smart TV (Конференц-зал)',
      ip: '192.168.1.31',
      mac: '02:00:5E:7A:11:04',
      hostname: 'samsung-conf-display.lan',
      type: 'Smart TV',
      manufacturer: 'Samsung Electronics',
      fingerprint: 'FP-91BD-820F-1004',
      confidence: 'High',
      trust_status: 'TRUSTED',
      offsetMinutes: 60
    },
    {
      id: 'dev-smartphone',
      name: 'Personal Smartphone (Pixel 8)',
      ip: '192.168.1.35',
      mac: '02:00:5E:7A:11:05',
      hostname: 'pixel8-mobile.lan',
      type: 'Smartphone',
      manufacturer: 'Google LLC',
      fingerprint: 'FP-D4C2-75E3-1005',
      confidence: 'High',
      trust_status: 'TRUSTED',
      offsetMinutes: 45
    }
  ];

  for (const d of initialDevices) {
    const firstSeen = new Date(now.getTime() - d.offsetMinutes * 60 * 1000).toISOString();
    const lastSeen = new Date(now.getTime() - Math.floor(Math.random() * 5 + 1) * 60 * 1000).toISOString();

    db.run(`
      INSERT INTO devices (
        id, name, ip_address, mac_address, hostname, device_type, manufacturer,
        fingerprint, confidence, trust_status, first_seen, last_seen, is_online,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL);
    `, [
      d.id, d.name, d.ip, d.mac, d.hostname, d.type, d.manufacturer,
      d.fingerprint, d.confidence, d.trust_status, firstSeen, lastSeen,
      firstSeen, lastSeen
    ]);

    // Add authorization record
    db.run(`
      INSERT INTO authorizations (
        id, device_id, authorization_type, starts_at, expires_at, note, active, created_at
      ) VALUES (?, ?, 'PERMANENT', ?, NULL, 'Постоянно доверенное устройство инфраструктуры', 1, ?);
    `, ['auth-' + d.id, d.id, firstSeen, firstSeen]);

    // Initial events
    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'DEVICE_DISCOVERED', 'INFO', ?, ?, ?);
    `, [
      'evt-disc-' + d.id,
      d.id,
      `Устройство ${d.name} обнаружено в подсети 192.168.1.0/24`,
      JSON.stringify({ ip: d.ip, mac: d.mac }),
      firstSeen
    ]);

    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TRUST_GRANTED', 'INFO', ?, ?, ?);
    `, [
      'evt-trust-' + d.id,
      d.id,
      `Устройство ${d.name} добавлено в реестр доверенных устройств`,
      JSON.stringify({ fingerprint: d.fingerprint }),
      firstSeen
    ]);

    // Audit record
    db.run(`
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'TRUST_GRANTED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-init-' + d.id,
      d.id,
      `Устройство ${d.name} (${d.ip}, ${d.mac}) зарегистрировано как доверенное`,
      firstSeen
    ]);
  }

  // System started event
  db.run(`
    INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
    VALUES (?, NULL, 'SYSTEM_STARTED', 'INFO', 'Система мониторинга Secure LAN успешно инициализирована', '{}', ?);
  `, ['evt-sys-init', formatIso(now)]);

  db.run(`
    INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
    VALUES (?, 'Система', 'SYSTEM_INITIALIZED', 'SYSTEM', 'core', 'Инициализирована демонстрационная среда с 5 доверенными узлами', ?);
  `, ['aud-sys-init', formatIso(now)]);
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
  saveDb();
}
