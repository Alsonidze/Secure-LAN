import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import crypto from 'crypto';
import {
  dbAll, dbGet, dbRun, runTransaction, saveDbAtomic,
  SqlJsDatabase, insertAuditRecord, getNextIncidentSequence
} from './db.js';
import { generateDeviceFingerprint } from './fingerprint.js';
import { generateUnknownDeviceIncident } from './incident.js';

const execPromise = util.promisify(exec);

export interface DetectedDevice {
  ip: string;
  mac: string;
  hostname?: string | null;
  deviceType: string;
  manufacturer: string;
  isOnline: boolean;
}

export interface NetworkScanner {
  scan(): Promise<DetectedDevice[]>;
}

let isScanInProgress = false;

// Memory state for demo simulation
class DemoNetworkScanner implements NetworkScanner {
  private simulatedDevices: DetectedDevice[] = [
    {
      ip: '192.168.1.10',
      mac: '02:00:5E:7A:11:01',
      hostname: 'sec-admin-workstation.lan',
      deviceType: 'Desktop',
      manufacturer: 'Lenovo',
      isOnline: true
    },
    {
      ip: '192.168.1.14',
      mac: '02:00:5E:7A:11:02',
      hostname: 'corp-tp-mb.lan',
      deviceType: 'Laptop',
      manufacturer: 'Apple Inc.',
      isOnline: true
    },
    {
      ip: '192.168.1.20',
      mac: '02:00:5E:7A:11:03',
      hostname: 'hp-laserjet-office.lan',
      deviceType: 'Printer',
      manufacturer: 'HP Inc.',
      isOnline: true
    },
    {
      ip: '192.168.1.31',
      mac: '02:00:5E:7A:11:04',
      hostname: 'samsung-conf-display.lan',
      deviceType: 'Smart TV',
      manufacturer: 'Samsung Electronics',
      isOnline: true
    },
    {
      ip: '192.168.1.35',
      mac: '02:00:5E:7A:11:05',
      hostname: 'pixel8-mobile.lan',
      deviceType: 'Smartphone',
      manufacturer: 'Google LLC',
      isOnline: true
    }
  ];

  async scan(): Promise<DetectedDevice[]> {
    return this.simulatedDevices.map(d => ({ ...d }));
  }

  addUnknownDevice(): DetectedDevice {
    const unknownIps = ['192.168.1.47', '192.168.1.52', '192.168.1.68', '192.168.1.89'];
    const unknownMacs = [
      '8C:7A:15:42:91:B3',
      'A4:C3:F0:81:22:9E',
      '70:85:C2:59:B1:0D',
      '00:1E:67:D4:58:3B'
    ];
    const vendors = [
      'Raspberry Pi Foundation',
      'Xiaomi Communications',
      'ASUSTeK Computer Inc.',
      'Intel Corporate'
    ];
    const types = ['IoT', 'Laptop', 'Smartphone', 'Workstation'];

    let selectedIp = unknownIps[0];
    let selectedMac = unknownMacs[0];
    let selectedVendor = vendors[0];
    let selectedType = types[0];

    for (let i = 0; i < unknownIps.length; i++) {
      if (!this.simulatedDevices.some(d => d.mac === unknownMacs[i])) {
        selectedIp = unknownIps[i];
        selectedMac = unknownMacs[i];
        selectedVendor = vendors[i];
        selectedType = types[i];
        break;
      }
    }

    const newDev: DetectedDevice = {
      ip: selectedIp,
      mac: selectedMac,
      hostname: 'guest-host-' + selectedMac.slice(-5).replace(':', '').toLowerCase(),
      deviceType: selectedType,
      manufacturer: selectedVendor,
      isOnline: true
    };

    const existingIndex = this.simulatedDevices.findIndex(d => d.mac === newDev.mac);
    if (existingIndex >= 0) {
      this.simulatedDevices[existingIndex].isOnline = true;
    } else {
      this.simulatedDevices.push(newDev);
    }

    return newDev;
  }

  toggleDeviceOnline(mac: string, isOnline: boolean) {
    const dev = this.simulatedDevices.find(d => d.mac.toUpperCase() === mac.toUpperCase());
    if (dev) {
      dev.isOnline = isOnline;
    }
  }

  reset() {
    this.simulatedDevices = [
      {
        ip: '192.168.1.10',
        mac: '02:00:5E:7A:11:01',
        hostname: 'sec-admin-workstation.lan',
        deviceType: 'Desktop',
        manufacturer: 'Lenovo',
        isOnline: true
      },
      {
        ip: '192.168.1.14',
        mac: '02:00:5E:7A:11:02',
        hostname: 'corp-tp-mb.lan',
        deviceType: 'Laptop',
        manufacturer: 'Apple Inc.',
        isOnline: true
      },
      {
        ip: '192.168.1.20',
        mac: '02:00:5E:7A:11:03',
        hostname: 'hp-laserjet-office.lan',
        deviceType: 'Printer',
        manufacturer: 'HP Inc.',
        isOnline: true
      },
      {
        ip: '192.168.1.31',
        mac: '02:00:5E:7A:11:04',
        hostname: 'samsung-conf-display.lan',
        deviceType: 'Smart TV',
        manufacturer: 'Samsung Electronics',
        isOnline: true
      },
      {
        ip: '192.168.1.35',
        mac: '02:00:5E:7A:11:05',
        hostname: 'pixel8-mobile.lan',
        deviceType: 'Smartphone',
        manufacturer: 'Google LLC',
        isOnline: true
      }
    ];
  }
}

// Live scanner using local OS passive ARP/neighbor detection
class LiveNetworkScanner implements NetworkScanner {
  async scan(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = [];
    const platform = os.platform();

    try {
      // 1. Inspect local machine network interfaces
      const ifaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            devices.push({
              ip: addr.address,
              mac: (addr.mac || '02:00:00:00:00:01').toUpperCase(),
              hostname: os.hostname() || 'local-host',
              deviceType: 'Workstation',
              manufacturer: 'Локальная система',
              isOnline: true
            });
          }
        }
      }

      // 2. Linux ARP / neighbor table
      if (platform === 'linux') {
        if (fs.existsSync('/proc/net/arp')) {
          const arpData = fs.readFileSync('/proc/net/arp', 'utf-8');
          const lines = arpData.split('\n').slice(1);
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              const ip = parts[0];
              const flags = parts[2];
              const mac = parts[3].toUpperCase();
              if (mac !== '00:00:00:00:00:00' && flags !== '0x0') {
                if (!devices.some(d => d.mac === mac)) {
                  devices.push({
                    ip,
                    mac,
                    hostname: null,
                    deviceType: 'Unknown Device',
                    manufacturer: 'Не определён',
                    isOnline: true
                  });
                }
              }
            }
          }
        }

        try {
          const { stdout } = await execPromise('ip neigh');
          const lines = stdout.split('\n');
          for (const line of lines) {
            const match = line.match(/^([\d.]+)\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:]+)/);
            if (match) {
              const ip = match[1];
              const mac = match[2].toUpperCase();
              if (mac !== '00:00:00:00:00:00' && !devices.some(d => d.mac === mac)) {
                devices.push({
                  ip,
                  mac,
                  hostname: null,
                  deviceType: 'Unknown Device',
                  manufacturer: 'Не определён',
                  isOnline: true
                });
              }
            }
          }
        } catch {
          // ignore ip neigh fallback
        }
      } else {
        // Windows / macOS: arp -a
        try {
          const { stdout } = await execPromise('arp -a');
          const arpLines = stdout.split('\n');
          for (const line of arpLines) {
            const match = line.match(/\(([\d.]+)\)\s+at\s+([0-9a-fA-F:]+)/) ||
                          line.match(/([\d.]+)\s+([0-9a-fA-F-]+)\s+dynamic/i);
            if (match) {
              const ip = match[1];
              const mac = match[2].replace(/-/g, ':').toUpperCase();
              if (mac !== '00:00:00:00:00:00' && !devices.some(d => d.mac === mac)) {
                devices.push({
                  ip,
                  mac,
                  hostname: null,
                  deviceType: 'Unknown Device',
                  manufacturer: 'Не определён',
                  isOnline: true
                });
              }
            }
          }
        } catch {
          // command failure graceful handling
        }
      }
    } catch (err) {
      console.warn('Локальное сканирование ARP завершено с ограничениями ОС');
    }

    return devices;
  }
}

export const demoScannerInstance = new DemoNetworkScanner();
export const liveScannerInstance = new LiveNetworkScanner();

/**
 * Checks and expires temporary authorizations that have passed their expires_at timestamp.
 */
export function checkTemporaryAuthorizations(db: SqlJsDatabase): number {
  const nowIso = new Date().toISOString();
  const expiredAuths = dbAll<{
    id: string;
    device_id: string;
    expires_at: string;
    name: string;
    ip_address: string;
    mac_address: string;
    fingerprint: string;
    is_online: number;
  }>(db, `
    SELECT a.id, a.device_id, a.expires_at, d.name, d.ip_address, d.mac_address, d.fingerprint, d.is_online
    FROM authorizations a
    JOIN devices d ON a.device_id = d.id
    WHERE a.active = 1 AND a.authorization_type = 'TEMPORARY' AND a.expires_at <= ? AND d.deleted_at IS NULL;
  `, [nowIso]);

  if (expiredAuths.length === 0) return 0;

  runTransaction(db, () => {
    for (const auth of expiredAuths) {
      // 1. Deactivate authorization
      db.run("UPDATE authorizations SET active = 0 WHERE id = ?;", [auth.id]);

      // 2. Return device status to UNKNOWN if not permanently trusted
      db.run("UPDATE devices SET trust_status = 'UNKNOWN', updated_at = ? WHERE id = ? AND trust_status = 'TEMPORARY';", [nowIso, auth.device_id]);

      // 3. Accurate event message depending on whether device is online or offline
      const isOnline = auth.is_online === 1;
      const eventMsg = isOnline
        ? `Срок временной авторизации для устройства ${auth.name} (${auth.ip_address}) истёк. Узел наблюдается в сети, требуется проверка.`
        : `Срок временной авторизации для устройства ${auth.name} (${auth.ip_address}) истёк. Узел в данный момент не в сети.`;

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'TEMPORARY_ACCESS_EXPIRED', 'WARNING', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        auth.device_id,
        eventMsg,
        JSON.stringify({ expiresAt: auth.expires_at, fingerprint: auth.fingerprint, isOnline }),
        nowIso
      ]);

      // 4. Create Audit record
      insertAuditRecord(db, {
        actor: 'Система (Автоматически)',
        action: 'TEMPORARY_ACCESS_EXPIRED',
        targetType: 'DEVICE',
        targetId: auth.device_id,
        details: `Срок временного доступа для устройства ${auth.name} (${auth.mac_address}) истёк. Статус возвращён в UNKNOWN.`,
        createdAt: nowIso
      });

      // 5. Open new incident if device is online and no unresolved incident exists
      if (isOnline) {
        const openInc = dbGet(db, "SELECT id FROM incidents WHERE device_id = ? AND status != 'RESOLVED';", [auth.device_id]);
        if (!openInc) {
          const seq = getNextIncidentSequence(db);
          const inc = generateUnknownDeviceIncident({
            id: auth.device_id,
            name: auth.name,
            ip: auth.ip_address,
            mac: auth.mac_address,
            fingerprint: auth.fingerprint,
            firstSeen: nowIso
          }, seq, 'MEDIUM');

          db.run(`
            INSERT INTO incidents (
              id, incident_code, device_id, type, severity, status, summary, explanation, evidence, created_at
            ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?);
          `, [
            inc.incidentId,
            inc.incidentCode,
            inc.deviceId,
            inc.type,
            inc.severity,
            `Истёк временный доступ: ${auth.name}`,
            `Устройство завершило период временной авторизации. Узел остаётся активным в сети, требуется повторная авторизация либо отключение.`,
            JSON.stringify(inc.evidence),
            nowIso
          ]);

          db.run(`
            INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
            VALUES (?, ?, 'INCIDENT_CREATED', 'WARNING', ?, ?, ?);
          `, [
            crypto.randomUUID(),
            auth.device_id,
            `Зарегистрирован инцидент ${inc.incidentCode} (истёк временный доступ)`,
            JSON.stringify({ incidentCode: inc.incidentCode }),
            nowIso
          ]);
        }
      }
    }
  });

  return expiredAuths.length;
}

/**
 * Executes a full scan cycle and correlates results with database.
 * Protected by a scan mutex lock.
 */
export async function runNetworkScan(db: SqlJsDatabase) {
  if (isScanInProgress) {
    const error: any = new Error('Сканирование сети уже выполняется');
    error.code = 'SCAN_IN_PROGRESS';
    throw error;
  }

  isScanInProgress = true;
  const startTime = new Date();
  const startIso = startTime.toISOString();

  try {
    // 1. Process expired temporary authorizations
    checkTemporaryAuthorizations(db);

    // 2. Select scanner by mode
    const modeSetting = dbGet<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'network_mode';");
    const mode = modeSetting?.value === 'live' ? 'live' : 'demo';
    const scanner: NetworkScanner = mode === 'live' ? liveScannerInstance : demoScannerInstance;

    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, NULL, 'SCAN_STARTED', 'INFO', ?, ?, ?);
    `, [
      crypto.randomUUID(),
      `Запущено сканирование сети (Режим: ${mode === 'live' ? 'Реальная сеть' : 'Демо-окружение'})`,
      JSON.stringify({ mode }),
      startIso
    ]);

    let detectedDevices: DetectedDevice[] = [];
    try {
      detectedDevices = await scanner.scan();
    } catch (err: any) {
      dbRun(db, `
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, NULL, 'SCAN_FAILED', 'WARNING', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        `Ошибка при выполнении сканирования: ${err?.message || 'Сбой опроса интерфейса'}`,
        JSON.stringify({ error: String(err) }),
        new Date().toISOString()
      ]);
      return { success: false, error: err?.message, devicesFound: 0 };
    }

    const nowIso = new Date().toISOString();
    let newDevicesCount = 0;
    let updatedDevicesCount = 0;
    let restoredDevicesCount = 0;

    const autoIncSetting = dbGet<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'create_incident_on_unknown';");
    const createIncident = autoIncSetting ? autoIncSetting.value === 'true' : true;
    const sevSetting = dbGet<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'incident_severity_default';");
    const defaultSeverity = (sevSetting?.value || 'MEDIUM') as 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';

    runTransaction(db, () => {
      const detectedMacs = new Set<string>();

      for (const d of detectedDevices) {
        const normMac = d.mac.toUpperCase();
        detectedMacs.add(normMac);

        // Check if device exists in DB (including soft-deleted)
        const existing = dbGet<{
          id: string;
          name: string;
          ip_address: string;
          mac_address: string;
          hostname: string | null;
          is_online: number;
          deleted_at: string | null;
          trust_status: string;
        }>(db, "SELECT * FROM devices WHERE mac_address = ?;", [normMac]);

        if (existing) {
          // If device was soft-deleted, RESTORE it!
          if (existing.deleted_at !== null) {
            restoredDevicesCount++;
            db.run(`
              UPDATE devices
              SET deleted_at = NULL, is_online = 1, missed_scans = 0, ip_address = ?, hostname = COALESCE(?, hostname), last_seen = ?, updated_at = ?
              WHERE id = ?;
            `, [d.ip, d.hostname || null, nowIso, nowIso, existing.id]);

            db.run(`
              INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
              VALUES (?, ?, 'DEVICE_RESTORED', 'INFO', ?, ?, ?);
            `, [
              crypto.randomUUID(),
              existing.id,
              `Устройство ${existing.name} вновь обнаружено в сети и восстановлено из архива`,
              JSON.stringify({ ip: d.ip, mac: normMac }),
              nowIso
            ]);

            insertAuditRecord(db, {
              actor: 'Система',
              action: 'DEVICE_RESTORED',
              targetType: 'DEVICE',
              targetId: existing.id,
              details: `Устройство ${existing.name} (${normMac}) автоматически восстановлено после повторного появления в сети`,
              createdAt: nowIso
            });
          } else {
            // Existing active device
            updatedDevicesCount++;
            const ipChanged = existing.ip_address !== d.ip;
            const wasOffline = existing.is_online === 0;

            db.run(`
              UPDATE devices
              SET ip_address = ?, hostname = COALESCE(?, hostname), last_seen = ?, is_online = ?, missed_scans = 0, updated_at = ?
              WHERE id = ?;
            `, [d.ip, d.hostname || null, nowIso, d.isOnline ? 1 : 0, nowIso, existing.id]);

            if (ipChanged) {
              db.run(`
                INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
                VALUES (?, ?, 'IP_CHANGED', 'INFO', ?, ?, ?);
              `, [
                crypto.randomUUID(),
                existing.id,
                `Устройство ${existing.name} сменило IP-адрес: ${existing.ip_address} → ${d.ip}`,
                JSON.stringify({ oldIp: existing.ip_address, newIp: d.ip }),
                nowIso
              ]);
            }

            if (wasOffline && d.isOnline) {
              db.run(`
                INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
                VALUES (?, ?, 'DEVICE_ONLINE', 'INFO', ?, ?, ?);
              `, [
                crypto.randomUUID(),
                existing.id,
                `Устройство ${existing.name} подключилось к сети (Online)`,
                JSON.stringify({ ip: d.ip }),
                nowIso
              ]);
            }
          }
        } else {
          // Brand new device discovery!
          newDevicesCount++;
          const fpResult = generateDeviceFingerprint({
            macAddress: normMac,
            hostname: d.hostname,
            manufacturer: d.manufacturer,
            deviceType: d.deviceType
          });

          const newId = crypto.randomUUID();
          const devName = d.hostname || `Устройство ${d.ip.split('.').slice(-2).join('.')}`;

          db.run(`
            INSERT INTO devices (
              id, name, ip_address, mac_address, hostname, device_type, manufacturer,
              fingerprint, confidence, trust_status, first_seen, last_seen, is_online, missed_scans,
              created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNKNOWN', ?, ?, 1, 0, ?, ?, NULL);
          `, [
            newId, devName, d.ip, normMac, d.hostname || null,
            d.deviceType || 'Unknown Device', d.manufacturer || 'Не определён',
            fpResult.fingerprint, fpResult.confidence, nowIso, nowIso, nowIso, nowIso
          ]);

          // Save fingerprint snapshot into device_fingerprints
          db.run(`
            INSERT INTO device_fingerprints (
              id, device_id, algorithm_version, full_hash, display_fingerprint, attributes_json, confidence, created_at, is_current
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);
          `, [
            crypto.randomUUID(),
            newId,
            fpResult.algorithmVersion,
            fpResult.fullHash,
            fpResult.fingerprint,
            JSON.stringify(fpResult.attributesUsed),
            fpResult.confidence,
            nowIso
          ]);

          db.run(`
            INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
            VALUES (?, ?, 'DEVICE_DISCOVERED', 'INFO', ?, ?, ?);
          `, [
            crypto.randomUUID(),
            newId,
            `В подсети обнаружено новое физическое устройство (${d.ip})`,
            JSON.stringify({ ip: d.ip, mac: normMac, hostname: d.hostname }),
            nowIso
          ]);

          db.run(`
            INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
            VALUES (?, ?, 'FINGERPRINT_CREATED', 'INFO', ?, ?, ?);
          `, [
            crypto.randomUUID(),
            newId,
            `Сформирован цифровой отпечаток: ${fpResult.fingerprint} (Достоверность: ${fpResult.confidence})`,
            JSON.stringify(fpResult),
            nowIso
          ]);

          db.run(`
            INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
            VALUES (?, ?, 'UNKNOWN_DEVICE_DETECTED', 'WARNING', ?, ?, ?);
          `, [
            crypto.randomUUID(),
            newId,
            `Устройство ${d.ip} (${normMac}) классифицировано как UNKNOWN`,
            JSON.stringify({ fingerprint: fpResult.fingerprint, mac: normMac }),
            nowIso
          ]);

          if (createIncident) {
            const seq = getNextIncidentSequence(db);
            const inc = generateUnknownDeviceIncident({
              id: newId,
              name: devName,
              ip: d.ip,
              mac: normMac,
              fingerprint: fpResult.fingerprint,
              hostname: d.hostname,
              firstSeen: nowIso
            }, seq, defaultSeverity);

            db.run(`
              INSERT INTO incidents (
                id, incident_code, device_id, type, severity, status, summary, explanation, evidence, created_at
              ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?);
            `, [
              inc.incidentId, inc.incidentCode, inc.deviceId, inc.type, inc.severity,
              inc.summary, inc.explanation, JSON.stringify(inc.evidence), nowIso
            ]);

            db.run(`
              INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
              VALUES (?, ?, 'INCIDENT_CREATED', 'WARNING', ?, ?, ?);
            `, [
              crypto.randomUUID(),
              newId,
              `Зарегистрирован инцидент ${inc.incidentCode}`,
              JSON.stringify({ incidentCode: inc.incidentCode, severity: inc.severity }),
              nowIso
            ]);
          }
        }
      }

      // Offline detection for devices missing in current scan
      const activeDbDevices = dbAll<{ id: string; name: string; ip_address: string; mac_address: string; missed_scans: number }>(
        db,
        "SELECT id, name, ip_address, mac_address, missed_scans FROM devices WHERE deleted_at IS NULL AND is_online = 1;"
      );

      for (const dev of activeDbDevices) {
        if (!detectedMacs.has(dev.mac_address.toUpperCase())) {
          const newMissed = dev.missed_scans + 1;
          if (newMissed >= 2) {
            // Transition to OFFLINE after 2 consecutive missed scans
            db.run("UPDATE devices SET is_online = 0, missed_scans = ?, updated_at = ? WHERE id = ?;", [newMissed, nowIso, dev.id]);

            db.run(`
              INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
              VALUES (?, ?, 'DEVICE_OFFLINE', 'INFO', ?, ?, ?);
            `, [
              crypto.randomUUID(),
              dev.id,
              `Устройство ${dev.name} (${dev.ip_address}) отключилось от сети (Offline)`,
              JSON.stringify({ missedScans: newMissed }),
              nowIso
            ]);
          } else {
            db.run("UPDATE devices SET missed_scans = ? WHERE id = ?;", [newMissed, dev.id]);
          }
        }
      }
    });

    const completedIso = new Date().toISOString();
    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, NULL, 'SCAN_COMPLETED', 'INFO', ?, ?, ?);
    `, [
      crypto.randomUUID(),
      `Сканирование сети завершено. Обнаружено: ${detectedDevices.length} (Новых: ${newDevicesCount}, Восстановлено: ${restoredDevicesCount})`,
      JSON.stringify({ total: detectedDevices.length, newCount: newDevicesCount, restoredCount: restoredDevicesCount }),
      completedIso
    ]);

    return {
      success: true,
      totalFound: detectedDevices.length,
      newDevices: newDevicesCount,
      restoredDevices: restoredDevicesCount,
      updatedDevices: updatedDevicesCount,
      timestamp: completedIso
    };
  } finally {
    isScanInProgress = false;
  }
}
