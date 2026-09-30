import { Router, Request, Response } from 'express';
import { getDb, dbAll, dbGet, dbRun, saveDb } from './db.js';
import { runNetworkScan, checkTemporaryAuthorizations, demoScannerInstance } from './scanner.js';
import { generateDeviceFingerprint } from './fingerprint.js';

export const apiRouter = Router();

// Middleware: ensure expired temporary authorizations are processed on incoming requests
apiRouter.use(async (req, res, next) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);
  } catch (e) {
    // Continue even if check fails
  }
  next();
});

// ==========================================
// 1. DASHBOARD OVERVIEW
// ==========================================
apiRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);

    const devices = dbAll(db, "SELECT * FROM devices WHERE deleted_at IS NULL;");
    const totalDevices = devices.length;
    const activeDevices = devices.filter(d => d.is_online === 1).length;
    const trustedDevices = devices.filter(d => d.trust_status === 'TRUSTED').length;
    const temporaryDevices = devices.filter(d => d.trust_status === 'TEMPORARY').length;
    const unknownDevices = devices.filter(d => d.trust_status === 'UNKNOWN').length;

    const incidents = dbAll(db, "SELECT * FROM incidents;");
    const openIncidents = incidents.filter(i => i.status === 'OPEN').length;
    const acknowledgedIncidents = incidents.filter(i => i.status === 'ACKNOWLEDGED').length;
    const highOpenIncidents = incidents.filter(i => i.status === 'OPEN' && i.severity === 'HIGH').length;

    // Network Status Logic:
    // NORMAL: No unknown devices and no open incidents
    // ATTENTION REQUIRED: Unknown devices > 0 OR open incidents > 0 OR temporary authorizations present
    // ALERT: Multiple unknown devices (>=2) OR active HIGH severity incident
    let networkStatus: 'NORMAL' | 'ATTENTION REQUIRED' | 'ALERT' = 'NORMAL';
    let statusDescription = 'Все узлы сети авторизованы. Угрозы и открытые инциденты отсутствуют.';

    if (unknownDevices >= 2 || highOpenIncidents > 0) {
      networkStatus = 'ALERT';
      statusDescription = `Критическое внимание: обнаружено ${unknownDevices} неавторизованных устройств или открыт инцидент высокой важности.`;
    } else if (unknownDevices > 0 || openIncidents > 0 || temporaryDevices > 0) {
      networkStatus = 'ATTENTION REQUIRED';
      statusDescription = unknownDevices > 0
        ? `Внимание: обнаружено ${unknownDevices} неавторизованное устройство. Требуется верификация.`
        : `Внимание: имеются открытые инциденты или устройства с временным доступом (${temporaryDevices}).`;
    }

    // Recent events (latest 8)
    const recentEvents = dbAll(db, `
      SELECT e.*, d.name as device_name, d.ip_address as device_ip
      FROM events e
      LEFT JOIN devices d ON e.device_id = d.id
      ORDER BY e.created_at DESC
      LIMIT 8;
    `);

    // Distribution data for charts
    const distribution = [
      { name: 'Доверенные', count: trustedDevices, color: '#10B981' },
      { name: 'Временные', count: temporaryDevices, color: '#F59E0B' },
      { name: 'Неизвестные', count: unknownDevices, color: '#EF4444' },
      { name: 'Не в сети', count: totalDevices - activeDevices, color: '#64748B' }
    ];

    // Last scan info
    const lastScanEvent = dbGet(db, `
      SELECT * FROM events WHERE event_type = 'SCAN_COMPLETED' ORDER BY created_at DESC LIMIT 1;
    `);

    const modeSetting = dbGet(db, "SELECT value FROM settings WHERE key = 'network_mode';");

    res.json({
      success: true,
      stats: {
        totalDevices,
        activeDevices,
        trustedDevices,
        temporaryDevices,
        unknownDevices,
        openIncidents,
        acknowledgedIncidents,
        resolvedIncidents: incidents.filter(i => i.status === 'RESOLVED').length
      },
      networkStatus,
      statusDescription,
      distribution,
      recentEvents: recentEvents.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : null
      })),
      lastScan: lastScanEvent ? lastScanEvent.created_at : null,
      mode: modeSetting?.value || 'demo'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. DEVICES
// ==========================================
apiRouter.get('/devices', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);

    const { status, search } = req.query;
    let query = "SELECT * FROM devices WHERE deleted_at IS NULL";
    const params: any[] = [];

    if (status && status !== 'all') {
      if (status === 'offline') {
        query += " AND is_online = 0";
      } else if (status === 'trusted') {
        query += " AND trust_status = 'TRUSTED'";
      } else if (status === 'temporary') {
        query += " AND trust_status = 'TEMPORARY'";
      } else if (status === 'unknown') {
        query += " AND trust_status = 'UNKNOWN'";
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += " AND (LOWER(name) LIKE ? OR LOWER(ip_address) LIKE ? OR LOWER(mac_address) LIKE ? OR LOWER(hostname) LIKE ?)";
      params.push(term, term, term, term);
    }

    query += " ORDER BY is_online DESC, trust_status = 'UNKNOWN' DESC, last_seen DESC";

    const devices = dbAll(db, query, params);

    // Attach active temporary authorization info if any
    const enriched = devices.map(d => {
      const activeAuth = dbGet(db, `
        SELECT * FROM authorizations
        WHERE device_id = ? AND active = 1 AND authorization_type = 'TEMPORARY'
        ORDER BY created_at DESC LIMIT 1;
      `, [d.id]);

      let remainingSeconds = 0;
      if (activeAuth && activeAuth.expires_at) {
        const diff = Math.max(0, Math.floor((new Date(activeAuth.expires_at).getTime() - Date.now()) / 1000));
        remainingSeconds = diff;
      }

      return {
        ...d,
        activeAuthorization: activeAuth ? {
          ...activeAuth,
          remainingSeconds
        } : null
      };
    });

    res.json({ success: true, devices: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/devices/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    // Active authorization
    const activeAuth = dbGet(db, `
      SELECT * FROM authorizations
      WHERE device_id = ? AND active = 1
      ORDER BY created_at DESC LIMIT 1;
    `, [id]);

    let remainingSeconds = 0;
    if (activeAuth && activeAuth.expires_at) {
      remainingSeconds = Math.max(0, Math.floor((new Date(activeAuth.expires_at).getTime() - Date.now()) / 1000));
    }

    // Incidents for this device
    const incidents = dbAll(db, "SELECT * FROM incidents WHERE device_id = ? ORDER BY created_at DESC;", [id]);

    // Fingerprint breakdown
    const fpBreakdown = generateDeviceFingerprint({
      macAddress: device.mac_address,
      hostname: device.hostname,
      manufacturer: device.manufacturer,
      deviceType: device.device_type
    });

    // Recent events for this device
    const events = dbAll(db, "SELECT * FROM events WHERE device_id = ? ORDER BY created_at DESC LIMIT 15;", [id]);

    res.json({
      success: true,
      device: {
        ...device,
        activeAuthorization: activeAuth ? { ...activeAuth, remainingSeconds } : null,
        incidents: incidents.map(i => ({ ...i, evidence: JSON.parse(i.evidence || '[]') })),
        fingerprintDetails: fpBreakdown,
        events: events.map(e => ({ ...e, metadata: e.metadata ? JSON.parse(e.metadata) : null }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trust Permanently
apiRouter.post('/devices/:id/trust', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { name, deviceType, note } = req.body;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    const nowIso = new Date().toISOString();
    const updatedName = (name && name.trim()) ? name.trim() : device.name;
    const updatedType = (deviceType && deviceType.trim()) ? deviceType.trim() : device.device_type;

    // 1. Update device record
    dbRun(db, `
      UPDATE devices
      SET trust_status = 'TRUSTED', name = ?, device_type = ?, updated_at = ?
      WHERE id = ?;
    `, [updatedName, updatedType, nowIso, id]);

    // 2. Deactivate previous authorizations & add permanent record
    dbRun(db, "UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);
    const authId = 'auth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    dbRun(db, `
      INSERT INTO authorizations (
        id, device_id, authorization_type, starts_at, expires_at, note, active, created_at
      ) VALUES (?, ?, 'PERMANENT', ?, NULL, ?, 1, ?);
    `, [authId, id, nowIso, note || 'Постоянное доверие подтверждено администратором', nowIso]);

    // 3. Create Event
    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TRUST_GRANTED', 'INFO', ?, ?, ?);
    `, [
      'evt-trust-' + Date.now(),
      id,
      `Устройство ${updatedName} (${device.ip_address}) переведено в реестр доверенных узлов`,
      JSON.stringify({ note: note || '', fingerprint: device.fingerprint }),
      nowIso
    ]);

    // 4. Create Audit Log
    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'TRUST_GRANTED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-' + Date.now(),
      id,
      `Устройство ${updatedName} (${device.mac_address}) получило постоянное доверие. Примечание: ${note || 'Без примечания'}`,
      nowIso
    ]);

    // 5. Automatically resolve open incidents for this device
    const openIncidents = dbAll(db, "SELECT id, incident_code FROM incidents WHERE device_id = ? AND status != 'RESOLVED';", [id]);
    for (const inc of openIncidents) {
      dbRun(db, `
        UPDATE incidents
        SET status = 'RESOLVED', resolved_at = ?, resolution_note = ?
        WHERE id = ?;
      `, [nowIso, 'Устройство успешно верифицировано и наделено постоянным доверием администратора', inc.id]);

      dbRun(db, `
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'INCIDENT_RESOLVED', 'INFO', ?, ?, ?);
      `, [
        'evt-inc-res-' + Date.now() + '-' + inc.id,
        id,
        `Инцидент ${inc.incident_code} автоматически закрыт в связи с авторизацией устройства`,
        JSON.stringify({ incidentCode: inc.incidentCode }),
        nowIso
      ]);
    }

    saveDb();
    res.json({ success: true, message: 'Устройство успешно авторизовано как доверенное' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Grant Temporary Access
apiRouter.post('/devices/:id/temporary-access', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { durationMinutes, note } = req.body;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    const minutes = parseInt(durationMinutes, 10) || 60;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
    const nowIso = now.toISOString();
    const expiresIso = expiresAt.toISOString();

    // 1. Update device status
    dbRun(db, "UPDATE devices SET trust_status = 'TEMPORARY', updated_at = ? WHERE id = ?;", [nowIso, id]);

    // 2. Deactivate previous authorizations & insert new temporary
    dbRun(db, "UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);
    const authId = 'auth-tmp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    dbRun(db, `
      INSERT INTO authorizations (
        id, device_id, authorization_type, starts_at, expires_at, note, active, created_at
      ) VALUES (?, ?, 'TEMPORARY', ?, ?, ?, 1, ?);
    `, [authId, id, nowIso, expiresIso, note || 'Временная гостевая авторизация', nowIso]);

    // 3. Create Event
    const durationLabel = minutes >= 60 ? `${(minutes / 60).toFixed(1).replace('.0', '')} ч.` : `${minutes} мин.`;
    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TEMPORARY_ACCESS_GRANTED', 'INFO', ?, ?, ?);
    `, [
      'evt-tmp-' + Date.now(),
      id,
      `Устройству ${device.name} предоставлен временный доступ на ${durationLabel} (до ${expiresAt.toLocaleTimeString('ru-RU')})`,
      JSON.stringify({ durationMinutes: minutes, expiresAt: expiresIso, note }),
      nowIso
    ]);

    // 4. Create Audit Log
    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'TEMPORARY_ACCESS_GRANTED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-tmp-' + Date.now(),
      id,
      `Предоставлен временный доступ для ${device.name} (${device.ip_address}) на ${durationLabel}. Срок истечения: ${expiresIso}. Примечание: ${note || 'Отсутствует'}`,
      nowIso
    ]);

    // 5. Update open incidents to ACKNOWLEDGED
    dbRun(db, `
      UPDATE incidents
      SET status = 'ACKNOWLEDGED', acknowledged_at = ?
      WHERE device_id = ? AND status = 'OPEN';
    `, [nowIso, id]);

    saveDb();
    res.json({
      success: true,
      message: `Временный доступ предоставлен до ${expiresAt.toLocaleTimeString('ru-RU')}`,
      expiresAt: expiresIso
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Revoke Trust
apiRouter.post('/devices/:id/revoke', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { reason } = req.body;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    const nowIso = new Date().toISOString();

    dbRun(db, "UPDATE devices SET trust_status = 'REVOKED', updated_at = ? WHERE id = ?;", [nowIso, id]);
    dbRun(db, "UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);

    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'TRUST_REVOKED', 'WARNING', ?, ?, ?);
    `, [
      'evt-rev-' + Date.now(),
      id,
      `Доверие к устройству ${device.name} (${device.ip_address}) отозвано администратором`,
      JSON.stringify({ reason: reason || 'Отозвано вручную' }),
      nowIso
    ]);

    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'TRUST_REVOKED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-rev-' + Date.now(),
      id,
      `Отозван доверенный статус для ${device.name} (${device.mac_address}). Причина: ${reason || 'Без указания причины'}`,
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: 'Доверие к устройству успешно отозвано' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Soft Delete Device
apiRouter.delete('/devices/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    const nowIso = new Date().toISOString();

    // Soft delete: sets deleted_at, keeps historical records intact
    dbRun(db, "UPDATE devices SET deleted_at = ?, is_online = 0 WHERE id = ?;", [nowIso, id]);
    dbRun(db, "UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);

    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'DEVICE_DELETED', 'DEVICE', ?, ?, ?);
    `, [
      'aud-del-' + Date.now(),
      id,
      `Устройство ${device.name} (${device.mac_address}) удалено из активного мониторинга (исторические записи сохранены)`,
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: 'Устройство удалено из активного списка. Исторические логи сохранены.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Device Investigation Timeline
apiRouter.get('/devices/:id/timeline', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    // Combine events, incidents, authorizations, audit actions for this device
    const events = dbAll(db, `
      SELECT id, event_type as type, severity, message as title, metadata, created_at, 'event' as source
      FROM events
      WHERE device_id = ?
    `, [id]);

    const incidents = dbAll(db, `
      SELECT id, incident_code as type, severity, summary as title, explanation as metadata, created_at, 'incident' as source
      FROM incidents
      WHERE device_id = ?
    `, [id]);

    const audits = dbAll(db, `
      SELECT id, action as type, 'INFO' as severity, details as title, actor as metadata, created_at, 'audit' as source
      FROM audit_log
      WHERE target_id = ?
    `, [id]);

    const combined = [...events, ...incidents, ...audits].map(item => {
      let parsedMeta = item.metadata;
      if (typeof parsedMeta === 'string') {
        try {
          parsedMeta = JSON.parse(parsedMeta);
        } catch {
          // Keep as string
        }
      }
      return {
        ...item,
        metadata: parsedMeta
      };
    });

    // Sort descending by created_at
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      success: true,
      device,
      timeline: combined
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. SCANNING
// ==========================================
apiRouter.post('/scan', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = await runNetworkScan(db);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. INCIDENTS
// ==========================================
apiRouter.get('/incidents', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { status, severity } = req.query;

    let query = `
      SELECT i.*, d.name as device_name, d.ip_address as device_ip, d.mac_address as device_mac, d.fingerprint as device_fingerprint
      FROM incidents i
      LEFT JOIN devices d ON i.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'all') {
      query += " AND i.status = ?";
      params.push(status);
    }

    if (severity && severity !== 'all') {
      query += " AND i.severity = ?";
      params.push(severity);
    }

    query += " ORDER BY i.status = 'OPEN' DESC, i.created_at DESC;";

    const rows = dbAll(db, query, params);
    const enriched = rows.map(r => ({
      ...r,
      evidence: JSON.parse(r.evidence || '[]')
    }));

    res.json({ success: true, incidents: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/incidents/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const inc = dbGet(db, "SELECT * FROM incidents WHERE id = ?;", [id]);
    if (!inc) {
      return res.status(404).json({ success: false, error: 'Инцидент не найден' });
    }

    const nowIso = new Date().toISOString();
    dbRun(db, "UPDATE incidents SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?;", [nowIso, id]);

    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'INCIDENT_ACKNOWLEDGED', 'INCIDENT', ?, ?, ?);
    `, [
      'aud-inc-ack-' + Date.now(),
      id,
      `Инцидент ${inc.incident_code} принят в обработку администратором`,
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: 'Инцидент принят в обработку' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/incidents/:id/resolve', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { note } = req.body;

    const inc = dbGet(db, "SELECT * FROM incidents WHERE id = ?;", [id]);
    if (!inc) {
      return res.status(404).json({ success: false, error: 'Инцидент не найден' });
    }

    const nowIso = new Date().toISOString();
    const resolutionNote = (note && note.trim()) ? note.trim() : 'Проблема устранена администратором сети';

    dbRun(db, `
      UPDATE incidents
      SET status = 'RESOLVED', resolved_at = ?, resolution_note = ?
      WHERE id = ?;
    `, [nowIso, resolutionNote, id]);

    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'INCIDENT_RESOLVED', 'INCIDENT', ?, ?, ?);
    `, [
      'aud-inc-res-' + Date.now(),
      id,
      `Инцидент ${inc.incident_code} закрыт. Резолюция: ${resolutionNote}`,
      nowIso
    ]);

    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, 'INCIDENT_RESOLVED', 'INFO', ?, ?, ?);
    `, [
      'evt-inc-close-' + Date.now(),
      inc.device_id,
      `Инцидент ${inc.incident_code} закрыт администратором (${resolutionNote})`,
      JSON.stringify({ incidentCode: inc.incident_code, note: resolutionNote }),
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: 'Инцидент успешно закрыт' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. AUDIT LOG & EVENTS
// ==========================================
apiRouter.get('/audit', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { action, search } = req.query;

    let query = "SELECT * FROM audit_log WHERE 1=1";
    const params: any[] = [];

    if (action && action !== 'all') {
      query += " AND action = ?";
      params.push(action);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += " AND (LOWER(details) LIKE ? OR LOWER(actor) LIKE ? OR LOWER(action) LIKE ?)";
      params.push(term, term, term);
    }

    query += " ORDER BY created_at DESC LIMIT 200;";

    const records = dbAll(db, query, params);
    res.json({ success: true, auditLog: records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { type, severity, deviceId } = req.query;

    let query = `
      SELECT e.*, d.name as device_name, d.ip_address as device_ip
      FROM events e
      LEFT JOIN devices d ON e.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (type && type !== 'all') {
      query += " AND e.event_type = ?";
      params.push(type);
    }

    if (severity && severity !== 'all') {
      query += " AND e.severity = ?";
      params.push(severity);
    }

    if (deviceId) {
      query += " AND e.device_id = ?";
      params.push(deviceId);
    }

    query += " ORDER BY e.created_at DESC LIMIT 200;";

    const rows = dbAll(db, query, params);
    const enriched = rows.map(r => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    }));

    res.json({ success: true, events: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. SETTINGS
// ==========================================
apiRouter.get('/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = dbAll(db, "SELECT * FROM settings;");
    const settingsObj: Record<string, string> = {};
    for (const r of rows) {
      settingsObj[r.key] = r.value;
    }
    res.json({ success: true, settings: settingsObj });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const settings = req.body;
    const nowIso = new Date().toISOString();

    for (const [k, v] of Object.entries(settings)) {
      dbRun(db, "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);", [k, String(v), nowIso]);
    }

    dbRun(db, `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'SETTINGS_CHANGED', 'SYSTEM', 'config', ?, ?);
    `, [
      'aud-set-' + Date.now(),
      `Обновлены параметры системы: ${Object.keys(settings).join(', ')}`,
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: 'Настройки успешно сохранены' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 7. EXPORT CSV
// ==========================================
apiRouter.get('/export/devices', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const devices = dbAll(db, "SELECT * FROM devices WHERE deleted_at IS NULL ORDER BY ip_address;");

    const header = ['ID', 'Имя устройства', 'IP-адрес', 'MAC-адрес', 'Hostname', 'Тип', 'Производитель', 'Fingerprint', 'Достоверность', 'Статус доверия', 'В сети', 'Первое обнаружение', 'Последняя активность'];
    const rows = devices.map(d => [
      d.id,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.ip_address,
      d.mac_address,
      `"${(d.hostname || '').replace(/"/g, '""')}"`,
      d.device_type,
      `"${(d.manufacturer || '').replace(/"/g, '""')}"`,
      d.fingerprint,
      d.confidence,
      d.trust_status,
      d.is_online ? 'Да' : 'Нет',
      d.first_seen,
      d.last_seen
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lan-sentinel-devices-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/export/audit', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const records = dbAll(db, "SELECT * FROM audit_log ORDER BY created_at DESC;");

    const header = ['ID', 'Время (UTC)', 'Субъект (Actor)', 'Действие (Action)', 'Тип объекта', 'ID объекта', 'Подробности'];
    const rows = records.map(r => [
      r.id,
      r.created_at,
      `"${(r.actor || '').replace(/"/g, '""')}"`,
      r.action,
      r.target_type,
      r.target_id,
      `"${(r.details || '').replace(/"/g, '""')}"`
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lan-sentinel-audit-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/export/events', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const events = dbAll(db, `
      SELECT e.*, d.name as device_name, d.ip_address as device_ip
      FROM events e
      LEFT JOIN devices d ON e.device_id = d.id
      ORDER BY e.created_at DESC;
    `);

    const header = ['ID', 'Время', 'Тип события', 'Важность', 'Устройство', 'IP', 'Сообщение'];
    const rows = events.map(e => [
      e.id,
      e.created_at,
      e.event_type,
      e.severity,
      `"${(e.device_name || '').replace(/"/g, '""')}"`,
      e.device_ip || '',
      `"${(e.message || '').replace(/"/g, '""')}"`
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lan-sentinel-events-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 8. DEMO SIMULATION CONTROLS
// ==========================================
// Simulate Unknown Device Arrival
apiRouter.post('/demo/simulate-unknown', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    // 1. Add unknown device to demo scanner pool
    const newDev = demoScannerInstance.addUnknownDevice();

    // 2. Execute network scan cycle
    const scanResult = await runNetworkScan(db);

    // 3. Find created device and incident
    const device = dbGet(db, "SELECT * FROM devices WHERE mac_address = ? AND deleted_at IS NULL;", [newDev.mac.toUpperCase()]);
    const incident = device ? dbGet(db, "SELECT * FROM incidents WHERE device_id = ? ORDER BY created_at DESC LIMIT 1;", [device.id]) : null;

    res.json({
      success: true,
      message: `Обнаружено несанкционированное устройство: ${newDev.ip}`,
      device,
      incident: incident ? { ...incident, evidence: JSON.parse(incident.evidence || '[]') } : null,
      scanResult
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simulate Device Offline / Online
apiRouter.post('/demo/toggle-online', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { deviceId, isOnline } = req.body;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [deviceId]);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Устройство не найдено' });
    }

    demoScannerInstance.toggleDeviceOnline(device.mac_address, Boolean(isOnline));
    const nowIso = new Date().toISOString();

    dbRun(db, "UPDATE devices SET is_online = ?, updated_at = ? WHERE id = ?;", [isOnline ? 1 : 0, nowIso, deviceId]);

    const eventType = isOnline ? 'DEVICE_ONLINE' : 'DEVICE_OFFLINE';
    const msg = isOnline
      ? `Устройство ${device.name} (${device.ip_address}) подключилось к сети`
      : `Устройство ${device.name} (${device.ip_address}) отключилось от сети (Offline)`;

    dbRun(db, `
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, ?, ?, 'INFO', ?, ?, ?);
    `, [
      'evt-tog-' + Date.now(),
      deviceId,
      eventType,
      msg,
      JSON.stringify({ isOnline: Boolean(isOnline) }),
      nowIso
    ]);

    saveDb();
    res.json({ success: true, message: msg, isOnline: Boolean(isOnline) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force Expire Temporary Access Now (Demo scenario button)
apiRouter.post('/demo/expire-temporary', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const pastIso = new Date(Date.now() - 5000).toISOString();

    // Set all active temporary authorizations to expired
    dbRun(db, `
      UPDATE authorizations
      SET expires_at = ?
      WHERE active = 1 AND authorization_type = 'TEMPORARY';
    `, [pastIso]);

    // Check & trigger expiration logic
    const count = checkTemporaryAuthorizations(db);
    saveDb();

    res.json({
      success: true,
      message: `Принудительно завершён срок временного доступа для ${count} устройств`,
      count
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset Demo Environment
apiRouter.post('/demo/reset', async (req: Request, res: Response) => {
  try {
    const db = await getDb();

    // Clean tables
    db.run("DELETE FROM authorizations;");
    db.run("DELETE FROM incidents;");
    db.run("DELETE FROM events;");
    db.run("DELETE FROM audit_log;");
    db.run("DELETE FROM devices;");

    // Reset demo scanner
    demoScannerInstance.reset();

    // Re-seed baseline data
    const now = new Date();
    const formatIso = (date: Date) => date.toISOString();

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

      db.run(`
        INSERT INTO authorizations (
          id, device_id, authorization_type, starts_at, expires_at, note, active, created_at
        ) VALUES (?, ?, 'PERMANENT', ?, NULL, 'Постоянно доверенное устройство инфраструктуры', 1, ?);
      `, ['auth-' + d.id, d.id, firstSeen, firstSeen]);

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
    }

    db.run(`
      INSERT INTO audit_log (id, actor, action, target_type, target_id, details, created_at)
      VALUES (?, 'Локальный администратор', 'RESET_DEMO_ENVIRONMENT', 'SYSTEM', 'core', 'Демонстрационная база данных сброшена к исходному состоянию (5 доверенных узлов)', ?);
    `, ['aud-reset-' + Date.now(), formatIso(now)]);

    db.run(`
      INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
      VALUES (?, NULL, 'SYSTEM_STARTED', 'INFO', 'Демонстрационная среда перезапущена в исходном состоянии', '{}', ?);
    `, ['evt-reset-' + Date.now(), formatIso(now)]);

    saveDb();
    res.json({ success: true, message: 'Демо-окружение успешно сброшено к исходному состоянию' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
