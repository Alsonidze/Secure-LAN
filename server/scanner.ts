import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import { dbAll, dbGet, dbRun, saveDb, SqlJsDatabase } from './db.js';
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

// Memory state for demo simulation
class DemoNetworkScanner implements NetworkScanner {
  private simulatedDevices: DetectedDevice[] = [
    {
      ip: '192.168.1.10',
      mac: '02:00:5E:7A:11:01',
      hostname: 'sec-admin-workstation.lan',
      deviceType: 'Desktop',
      manufacturer: 'Lenovo Group Ltd.',
      isOnline: true
    },
    {
      ip: '192.168.1.14',
      mac: '02:00:5E:7A:11:02',
      hostname: 'corp-tp-mb.lan',
      deviceType: 'Laptop',
      manufacturer: 'Lenovo / Apple Inc.',
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
    // Return copies of current active demo devices
    return this.simulatedDevices.map(d => ({ ...d }));
  }

  addUnknownDevice(): DetectedDevice {
    // Generate realistic unknown device
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
    const types = ['IoT', 'Laptop', 'Smartphone', 'Unknown Device'];

    // Pick one that isn't already simulated
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
      hostname: 'unknown-host-' + selectedMac.slice(-5).replace(':', '').toLowerCase(),
      deviceType: selectedType,
      manufacturer: selectedVendor,
      isOnline: true
    };

    // If already exists in demo pool, update to online; otherwise push
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
        manufacturer: 'Lenovo Group Ltd.',
        isOnline: true
      },
      {
        ip: '192.168.1.14',
        mac: '02:00:5E:7A:11:02',
        hostname: 'corp-tp-mb.lan',
        deviceType: 'Laptop',
        manufacturer: 'Lenovo / Apple Inc.',
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

// Live scanner using OS network capabilities
class LiveNetworkScanner implements NetworkScanner {
  async scan(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = [];

    try {
      // 1. Inspect local network interfaces
      const ifaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            devices.push({
              ip: addr.address,
              mac: (addr.mac || '02:00:00:00:00:01').toUpperCase(),
              hostname: os.hostname() || 'local-host',
              deviceType: 'Desktop',
              manufacturer: 'Local Host System',
              isOnline: true
            });
          }
        }
      }

      // 2. Read Linux /proc/net/arp if available
      if (fs.existsSync('/proc/net/arp')) {
        const arpData = fs.readFileSync('/proc/net/arp', 'utf-8');
        const lines = arpData.split('\n').slice(1); // skip header
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
                  manufacturer: 'Сетевой адаптер (ARP)',
                  isOnline: true
                });
              }
            }
          }
        }
      } else {
        // Fallback to arp -a
        try {
          const { stdout } = await execPromise('arp -a');
          const arpLines = stdout.split('\n');
          for (const line of arpLines) {
            const match = line.match(/\(([\d.]+)\)\s+at\s+([0-9a-fA-F:]+)/);
            if (match) {
              const ip = match[1];
              const mac = match[2].toUpperCase();
              if (mac !== '00:00:00:00:00:00' && !devices.some(d => d.mac === mac)) {
                devices.push({
                  ip,
                  mac,
                  hostname: null,
                  deviceType: 'Unknown Device',
                  manufacturer: 'Сетевой узел (ARP)',
                  isOnline: true
                });
              }
            }
          }
        } catch {
          // ARP command might fail in restricted container, graceful handling
        }
      }
    } catch (err) {
      console.warn('Live scanner notice: limited OS permissions for full ARP scan', err);
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
  const expiredAuths = dbAll(db, `
    SELECT a.id, a.device_id, a.expires_at, d.name, d.ip_address, d.mac_address, d.fingerprint
    FROM authorizations a
    JOIN devices d ON a.device_id = d.id
    WHERE a.active = 1 AND a.authorization_type = 'TEMPORARY' AND a.expires_at <= ? AND d.deleted_at IS NULL;
  `, [nowIso]);

  for (const auth of expiredAuths) {
    // 1. Deactivate authorization
    dbRun(db, `UPDATE authorizations SET active = 0 WHERE id = ?;`, [auth.id]);

    // 2. Return device status to UNKNOWN if it wasn't made TRUSTED
    dbRun(db, `UPDATE devices SET trust_status = 'UNKNOWN', updated_at = ? WHERE id = ?;`, [nowIso, auth.device_id]);

    // 3. Create Event
    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TEMPORARY_ACCESS_EXPIRED', 'WARNING', ?, ?, ?);
    `, [
      'evt-exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      auth.device_id,
      `Срок временной авторизации для устройства ${auth.name} (${auth.ip_address}) истёк`,
      JSON.stringify({ expiresAt: auth.expires_at, fingerprint: auth.fingerprint }),
      nowIso
    ]);

    // 4. Create Audit record
    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Система (Автоматически)', 'TEMPORARY_ACCESS_EXPIRED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      auth.device_id,
      `Временный доступ для устройства ${auth.name} (${auth.mac_address}) автоматически завершён. Статус возвращён в UNKNOWN.`,
      nowIso
    ]);

    // 5. Open new incident if none open for this device
    const openInc = dbGet(db, `
      SELECT id FROM incidents WHERE device_id = ? AND status != 'RESOLVED';
    `, [auth.device_id]);

    if (!openInc) {
      const inc = generateUnknownDeviceIncident({
        id: auth.device_id,
        name: auth.name,
        ip: auth.ip_address,
        mac: auth.mac_address,
        fingerprint: auth.fingerprint,
        firstSeen: nowIso
      }, 'MEDIUM');

      dbRun(db, `
        INSERT INTO incidents (
          id, incident_code, device_id, type, severity, status, summary, explanation, evidence, created_at
        ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?);
      `, [
        'inc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        inc.incidentCode,
        inc.deviceId,
        inc.type,
        inc.severity,
        `Истёк временный доступ: ${auth.name}`,
        `Устройство завершило срок временной авторизации. Узел по-прежнему наблюдается в сети, требуется повторная авторизация либо отключение.`,
        JSON.stringify(inc.evidence),
        nowIso
      ]);
    }
  }

  return expiredAuths.length;
}

/**
 * Executes a full scan cycle and correlates results with database.
 */
export async function runNetworkScan(db: SqlJsDatabase) {
  const startTime = new Date();
  const startIso = startTime.toISOString();

  // 1. Process expired temporary authorizations first
  checkTemporaryAuthorizations(db);

  // 2. Select scanner according to current mode
  const modeSetting = dbGet(db, "SELECT value FROM settings WHERE key = 'network_mode';");
  const mode = modeSetting?.value === 'live' ? 'live' : 'demo';
  const scanner: NetworkScanner = mode === 'live' ? liveScannerInstance : demoScannerInstance;

  // Log scan started event
  dbRun(db, `
    INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
    VALUES (?, NULL, 'SCAN_STARTED', 'INFO', ?, ?, ?);
  `, [
    'evt-scan-start-' + Date.now(),
    `Запущено сканирование локальной сети (Режим: ${mode === 'live' ? 'Реальная сеть' : 'Демо-окружение'})`,
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
      'evt-scan-err-' + Date.now(),
      `Ошибка при выполнении сканирования сети: ${err?.message || 'Неизвестный сбой'}`,
      JSON.stringify({ error: String(err) }),
      new Date().toISOString()
    ]);
    return { success: false, error: err?.message, devicesFound: 0 };
  }

  const nowIso = new Date().toISOString();
  let newDevicesCount = 0;
  let updatedDevicesCount = 0;

  // Get incident creation setting
  const autoIncSetting = dbGet(db, "SELECT value FROM settings WHERE key = 'create_incident_on_unknown';");
  const createIncident = autoIncSetting ? autoIncSetting.value === 'true' : true;
  const sevSetting = dbGet(db, "SELECT value FROM settings WHERE key = 'incident_severity_default';");
  const defaultSeverity = (sevSetting?.value || 'MEDIUM') as 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';

  for (const d of detectedDevices) {
    const existing = dbGet(db, `
      SELECT * FROM devices WHERE mac_address = ? AND deleted_at IS NULL;
    `, [d.mac.toUpperCase()]);

    if (existing) {
      // Existing device: Check IP change or online transition
      updatedDevicesCount++;
      const ipChanged = existing.ip_address !== d.ip;
      const wasOffline = existing.is_online === 0;

      dbRun(db, `
        UPDATE devices
        SET ip_address = ?, hostname = COALESCE(?, hostname), last_seen = ?, is_online = ?, updated_at = ?
        WHERE id = ?;
      `, [d.ip, d.hostname || null, nowIso, d.isOnline ? 1 : 0, nowIso, existing.id]);

      if (ipChanged) {
        dbRun(db, `
          INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
          VALUES (?, ?, 'IP_CHANGED', 'INFO', ?, ?, ?);
        `, [
          'evt-ip-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          existing.id,
          `Устройство ${existing.name} сменило IP-адрес: ${existing.ip_address} → ${d.ip}`,
          JSON.stringify({ oldIp: existing.ip_address, newIp: d.ip }),
          nowIso
        ]);
      }

      if (wasOffline && d.isOnline) {
        dbRun(db, `
          INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
          VALUES (?, ?, 'DEVICE_ONLINE', 'INFO', ?, ?, ?);
        `, [
          'evt-on-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          existing.id,
          `Устройство ${existing.name} вновь обнаружено в сети`,
          JSON.stringify({ ip: d.ip }),
          nowIso
        ]);
      }
    } else {
      // New device discovery!
      newDevicesCount++;
      const fpResult = generateDeviceFingerprint({
        macAddress: d.mac,
        hostname: d.hostname,
        manufacturer: d.manufacturer,
        deviceType: d.deviceType
      });

      const newId = 'dev-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const devName = d.hostname || `Неизвестное устройство (${d.ip.split('.').slice(-2).join('.')})`;

      dbRun(db, `
        INSERT INTO devices (
          id, name, ip_address, mac_address, hostname, device_type, manufacturer,
          fingerprint, confidence, trust_status, first_seen, last_seen, is_online,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNKNOWN', ?, ?, 1, ?, ?, NULL);
      `, [
        newId, devName, d.ip, d.mac.toUpperCase(), d.hostname || null,
        d.deviceType || 'Unknown Device', d.manufacturer || 'Неизвестен',
        fpResult.fingerprint, fpResult.confidence, nowIso, nowIso, nowIso, nowIso
      ]);

      // Discovery Event
      dbRun(db, `
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'DEVICE_DISCOVERED', 'INFO', ?, ?, ?);
      `, [
        'evt-disc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        newId,
        `В подсети впервые обнаружено новое физическое устройство (${d.ip})`,
        JSON.stringify({ ip: d.ip, mac: d.mac, hostname: d.hostname }),
        nowIso
      ]);

      // Fingerprint Created Event
      dbRun(db, `
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'FINGERPRINT_CREATED', 'INFO', ?, ?, ?);
      `, [
        'evt-fp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        newId,
        `Сформирован цифровой отпечаток: ${fpResult.fingerprint} (Достоверность: ${fpResult.confidence})`,
        JSON.stringify(fpResult),
        nowIso
      ]);

      // Unknown device event
      dbRun(db, `
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'UNKNOWN_DEVICE_DETECTED', 'WARNING', ?, ?, ?);
      `, [
        'evt-unk-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        newId,
        `Устройство ${d.ip} не зарегистрировано в белом списке доверенных узлов`,
        JSON.stringify({ fingerprint: fpResult.fingerprint, mac: d.mac }),
        nowIso
      ]);

      // Automatically create incident if enabled
      if (createIncident) {
        const inc = generateUnknownDeviceIncident({
          id: newId,
          name: devName,
          ip: d.ip,
          mac: d.mac,
          fingerprint: fpResult.fingerprint,
          hostname: d.hostname,
          firstSeen: nowIso
        }, defaultSeverity);

        const incId = 'inc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        dbRun(db, `
          INSERT INTO incidents (
            id, incident_code, device_id, type, severity, status, summary, explanation, evidence, created_at
          ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?);
        `, [
          incId, inc.incidentCode, inc.deviceId, inc.type, inc.severity,
          inc.summary, inc.explanation, JSON.stringify(inc.evidence), nowIso
        ]);

        dbRun(db, `
          INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
          VALUES (?, ?, 'INCIDENT_CREATED', 'WARNING', ?, ?, ?);
        `, [
          'evt-inc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          newId,
          `Зарегистрирован инцидент информационной безопасности ${inc.incidentCode}`,
          JSON.stringify({ incidentCode: inc.incidentCode, severity: inc.severity }),
          nowIso
        ]);
      }
    }
  }

  // Scan Completed Event
  const completedIso = new Date().toISOString();
  dbRun(db, `
    INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
    VALUES (?, NULL, 'SCAN_COMPLETED', 'INFO', ?, ?, ?);
  `, [
    'evt-scan-comp-' + Date.now(),
    `Сканирование сети завершено. Найдено узлов: ${detectedDevices.length} (Новых: ${newDevicesCount})`,
    JSON.stringify({ total: detectedDevices.length, newCount: newDevicesCount, updatedCount: updatedDevicesCount }),
    completedIso
  ]);

  saveDb();
  return {
    success: true,
    totalFound: detectedDevices.length,
    newDevices: newDevicesCount,
    updatedDevices: updatedDevicesCount,
    timestamp: completedIso
  };
}
