import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  getDb, dbAll, dbGet, dbRun, runTransaction, saveDbAtomic,
  insertAuditRecord, verifyAuditIntegrity, getNextIncidentSequence
} from './db.js';
import { runNetworkScan, checkTemporaryAuthorizations, demoScannerInstance } from './scanner.js';
import { generateDeviceFingerprint } from './fingerprint.js';

export const apiRouter = Router();

function safeJsonParse<T = any>(val: any, fallback: T): T {
  if (typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes('"') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

// Compute comprehensive system state
function computeSystemState(db: any) {
  const devices = dbAll(db, "SELECT * FROM devices WHERE deleted_at IS NULL ORDER BY is_online DESC, trust_status = 'UNKNOWN' DESC, last_seen DESC;");
  const incidents = dbAll(db, "SELECT * FROM incidents ORDER BY status = 'OPEN' DESC, status = 'ACKNOWLEDGED' DESC, created_at DESC;");

  const totalDevices = devices.length;
  const activeDevices = devices.filter((d: any) => d.is_online === 1).length;
  const trustedDevices = devices.filter((d: any) => d.trust_status === 'TRUSTED').length;
  const temporaryDevices = devices.filter((d: any) => d.trust_status === 'TEMPORARY').length;
  const unknownDevices = devices.filter((d: any) => d.trust_status === 'UNKNOWN').length;
  const revokedDevices = devices.filter((d: any) => d.trust_status === 'REVOKED').length;

  const onlineUnknown = devices.filter((d: any) => d.trust_status === 'UNKNOWN' && d.is_online === 1).length;
  const onlineRevoked = devices.filter((d: any) => d.trust_status === 'REVOKED' && d.is_online === 1).length;
  const untrustedOnline = onlineUnknown + onlineRevoked;

  const openIncidents = incidents.filter((i: any) => i.status === 'OPEN').length;
  const acknowledgedIncidents = incidents.filter((i: any) => i.status === 'ACKNOWLEDGED').length;
  const resolvedIncidents = incidents.filter((i: any) => i.status === 'RESOLVED').length;
  const unresolvedIncidents = openIncidents + acknowledgedIncidents;
  const unresolvedHigh = incidents.filter((i: any) => (i.status === 'OPEN' || i.status === 'ACKNOWLEDGED') && i.severity === 'HIGH').length;

  let networkStatus: 'NORMAL' | 'ATTENTION REQUIRED' | 'ALERT' = 'NORMAL';
  let statusDescription = 'Все активные узлы сети авторизованы. Угрозы и нерешённые инциденты отсутствуют.';

  if (untrustedOnline >= 2 || onlineRevoked > 0 || unresolvedHigh > 0) {
    networkStatus = 'ALERT';
    statusDescription = onlineRevoked > 0
      ? `Тревога: в сети зафиксирован узел с отозванным доверием. Требуется немедленная изоляция.`
      : `Тревога: обнаружено ${untrustedOnline} неавторизованных устройств или активен инцидент высокой важности.`;
  } else if (onlineUnknown === 1 || temporaryDevices > 0 || unresolvedIncidents > 0) {
    networkStatus = 'ATTENTION REQUIRED';
    statusDescription = onlineUnknown === 1
      ? `Внимание: обнаружено 1 неизвестное устройство. Требуется верификация администратором.`
      : `Внимание: имеются открытые инциденты (${unresolvedIncidents}) или устройства с временным доступом (${temporaryDevices}).`;
  }

  const enrichedDevices = devices.map((d: any) => {
    const activeAuth = dbGet(db, `
      SELECT * FROM authorizations
      WHERE device_id = ? AND active = 1 AND authorization_type = 'TEMPORARY'
      ORDER BY created_at DESC LIMIT 1;
    `, [d.id]);

    let remainingSeconds = 0;
    if (activeAuth && activeAuth.expires_at) {
      remainingSeconds = Math.max(0, Math.floor((new Date(activeAuth.expires_at).getTime() - Date.now()) / 1000));
    }

    return {
      ...d,
      activeAuthorization: activeAuth ? { ...activeAuth, remainingSeconds } : null
    };
  });

  const enrichedIncidents = incidents.map((i: any) => {
    const dev = devices.find((d: any) => d.id === i.device_id);
    return {
      ...i,
      device_name: dev?.name || 'Устройство сети',
      device_ip: dev?.ip_address || '',
      device_mac: dev?.mac_address || '',
      device_fingerprint: dev?.fingerprint || '',
      evidence: safeJsonParse(i.evidence, [])
    };
  });

  const recentEvents = dbAll(db, `
    SELECT e.*, d.name as device_name, d.ip_address as device_ip
    FROM events e
    LEFT JOIN devices d ON e.device_id = d.id
    ORDER BY e.created_at DESC
    LIMIT 10;
  `).map((e: any) => ({
    ...e,
    metadata: safeJsonParse(e.metadata, null)
  }));

  const lastScanEvent = dbGet(db, "SELECT created_at FROM events WHERE event_type = 'SCAN_COMPLETED' ORDER BY created_at DESC LIMIT 1;");
  const modeSetting = dbGet(db, "SELECT value FROM settings WHERE key = 'network_mode';");

  const distribution = [
    { name: 'Доверенные', count: trustedDevices, color: '#3FB950' },
    { name: 'Временный доступ', count: temporaryDevices, color: '#D29922' },
    { name: 'Неизвестные', count: unknownDevices, color: '#F85149' },
    { name: 'Отозванные', count: revokedDevices, color: '#F85149' },
    { name: 'Не в сети', count: totalDevices - activeDevices, color: '#6E7681' }
  ];

  return {
    stats: {
      totalDevices,
      activeDevices,
      trustedDevices,
      temporaryDevices,
      unknownDevices,
      revokedDevices,
      openIncidents,
      acknowledgedIncidents,
      resolvedIncidents,
      unresolvedIncidents
    },
    networkStatus,
    statusDescription,
    devices: enrichedDevices,
    incidents: enrichedIncidents,
    recentEvents,
    distribution,
    lastScan: lastScanEvent ? lastScanEvent.created_at : null,
    mode: (modeSetting?.value === 'live' ? 'live' : 'demo') as 'demo' | 'live'
  };
}

// ==========================================
// 1. UNIFIED APP STATE (Single round-trip)
// ==========================================
apiRouter.get('/app-state', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);
    const state = computeSystemState(db);
    res.json({ success: true, data: state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);
    const state = computeSystemState(db);
    res.json({
      success: true,
      stats: state.stats,
      networkStatus: state.networkStatus,
      statusDescription: state.statusDescription,
      distribution: state.distribution,
      recentEvents: state.recentEvents,
      lastScan: state.lastScan,
      mode: state.mode
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 2. DEVICES
// ==========================================
apiRouter.get('/devices', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    checkTemporaryAuthorizations(db);
    const state = computeSystemState(db);
    res.json({ success: true, devices: state.devices });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.get('/devices/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
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

    // Fingerprint snapshot from device_fingerprints table (stored snapshot, not recalculated!)
    const fpRecord = dbGet(db, `
      SELECT * FROM device_fingerprints
      WHERE device_id = ? AND is_current = 1
      ORDER BY created_at DESC LIMIT 1;
    `, [id]);

    const fpDetails = fpRecord ? {
      algorithmVersion: fpRecord.algorithm_version,
      fingerprint: fpRecord.display_fingerprint,
      fullHash: fpRecord.full_hash,
      confidence: fpRecord.confidence,
      confidenceReason: fpRecord.confidence === 'High'
        ? 'Идентифицированы MAC-адрес, сетевое имя узла и вендор сетевого адаптера'
        : 'Идентифицирован валидный аппаратный MAC-адрес',
      attributesUsed: safeJsonParse(fpRecord.attributes_json, {}),
      generatedAt: fpRecord.created_at
    } : generateDeviceFingerprint({
      macAddress: device.mac_address,
      hostname: device.hostname,
      manufacturer: device.manufacturer,
      deviceType: device.device_type
    });

    const incidents = dbAll(db, "SELECT * FROM incidents WHERE device_id = ? ORDER BY created_at DESC;", [id]).map(i => ({
      ...i,
      evidence: safeJsonParse(i.evidence, [])
    }));

    const events = dbAll(db, "SELECT * FROM events WHERE device_id = ? ORDER BY created_at DESC LIMIT 20;", [id]).map(e => ({
      ...e,
      metadata: safeJsonParse(e.metadata, null)
    }));

    res.json({
      success: true,
      device: {
        ...device,
        activeAuthorization: activeAuth ? { ...activeAuth, remainingSeconds } : null,
        fingerprintDetails: fpDetails,
        incidents,
        events
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
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
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

    const nowIso = new Date().toISOString();
    const updatedName = (name && typeof name === 'string' && name.trim()) ? name.trim().slice(0, 80) : device.name;
    const updatedType = (deviceType && typeof deviceType === 'string' && deviceType.trim()) ? deviceType.trim().slice(0, 40) : device.device_type;
    const trustNote = (note && typeof note === 'string') ? note.trim().slice(0, 300) : 'Постоянное доверие подтверждено администратором';

    runTransaction(db, () => {
      // 1. Update device
      db.run("UPDATE devices SET trust_status = 'TRUSTED', name = ?, device_type = ?, updated_at = ? WHERE id = ?;", [updatedName, updatedType, nowIso, id]);

      // 2. Deactivate previous authorizations & insert permanent
      db.run("UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);
      db.run(`
        INSERT INTO authorizations (id, device_id, authorization_type, starts_at, expires_at, note, active, created_at)
        VALUES (?, ?, 'PERMANENT', ?, NULL, ?, 1, ?);
      `, [crypto.randomUUID(), id, nowIso, trustNote, nowIso]);

      // 3. Event
      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'TRUST_GRANTED', 'INFO', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        id,
        `Устройство ${updatedName} (${device.ip_address}) включено в реестр доверенных узлов`,
        JSON.stringify({ note: trustNote, fingerprint: device.fingerprint }),
        nowIso
      ]);

      // 4. Audit
      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'TRUST_GRANTED',
        targetType: 'DEVICE',
        targetId: id,
        details: `Устройство ${updatedName} (${device.mac_address}) наделено постоянным доверием. Примечание: ${trustNote}`,
        createdAt: nowIso
      });

      // 5. Automatically resolve open unknown-device incidents for this device
      const openIncidents = dbAll<{ id: string; incident_code: string }>(
        db,
        "SELECT id, incident_code FROM incidents WHERE device_id = ? AND status != 'RESOLVED';",
        [id]
      );

      for (const inc of openIncidents) {
        db.run(
          "UPDATE incidents SET status = 'RESOLVED', resolved_at = ?, resolution_note = ? WHERE id = ?;",
          [nowIso, 'Устройство авторизовано администратором как доверенное', inc.id]
        );

        db.run(`
          INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
          VALUES (?, ?, 'INCIDENT_RESOLVED', 'INFO', ?, ?, ?);
        `, [
          crypto.randomUUID(),
          id,
          `Инцидент ${inc.incident_code} автоматически закрыт в связи с авторизацией узла`,
          JSON.stringify({ incidentCode: inc.incident_code }),
          nowIso
        ]);

        insertAuditRecord(db, {
          actor: 'Локальный администратор',
          action: 'INCIDENT_RESOLVED',
          targetType: 'INCIDENT',
          targetId: inc.id,
          details: `Инцидент ${inc.incident_code} автоматически разрешён при предоставлении постоянного доверия узлу ${updatedName}`,
          createdAt: nowIso
        });
      }
    });

    res.json({ success: true, message: 'Устройство успешно зарегистрировано как доверенное' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Grant Temporary Access
apiRouter.post('/devices/:id/temporary-access', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { durationMinutes, mode: durationMode, note } = req.body;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

    const now = new Date();
    let calculatedMinutes = 60;

    // Check mode: END_OF_DAY calculates actual end of current local day
    if (durationMode === 'END_OF_DAY') {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const diffMs = endOfDay.getTime() - now.getTime();
      calculatedMinutes = Math.max(5, Math.floor(diffMs / 60000));
    } else {
      const parsed = parseInt(String(durationMinutes), 10);
      if (isNaN(parsed) || parsed < 5 || parsed > 10080) {
        return res.status(400).json({
          success: false,
          error: { message: 'Недопустимый срок временного доступа (допустимо от 5 минут до 7 дней)' }
        });
      }
      calculatedMinutes = parsed;
    }

    const expiresAt = new Date(now.getTime() + calculatedMinutes * 60 * 1000);
    const nowIso = now.toISOString();
    const expiresIso = expiresAt.toISOString();
    const authNote = (note && typeof note === 'string') ? note.trim().slice(0, 300) : 'Временный доступ';

    runTransaction(db, () => {
      db.run("UPDATE devices SET trust_status = 'TEMPORARY', updated_at = ? WHERE id = ?;", [nowIso, id]);
      db.run("UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);

      db.run(`
        INSERT INTO authorizations (id, device_id, authorization_type, starts_at, expires_at, note, active, created_at)
        VALUES (?, ?, 'TEMPORARY', ?, ?, ?, 1, ?);
      `, [crypto.randomUUID(), id, nowIso, expiresIso, authNote, nowIso]);

      const durationLabel = calculatedMinutes >= 60
        ? `${(calculatedMinutes / 60).toFixed(1).replace('.0', '')} ч.`
        : `${calculatedMinutes} мин.`;

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'TEMPORARY_ACCESS_GRANTED', 'INFO', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        id,
        `Устройству ${device.name} предоставлен временный доступ на ${durationLabel} (до ${expiresAt.toLocaleTimeString('ru-RU')})`,
        JSON.stringify({ durationMinutes: calculatedMinutes, expiresAt: expiresIso, note: authNote }),
        nowIso
      ]);

      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'TEMPORARY_ACCESS_GRANTED',
        targetType: 'DEVICE',
        targetId: id,
        details: `Предоставлен временный доступ для ${device.name} (${device.ip_address}) на ${durationLabel} (до ${expiresIso}). Примечание: ${authNote}`,
        createdAt: nowIso
      });

      // Acknowledge open incident
      db.run("UPDATE incidents SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE device_id = ? AND status = 'OPEN';", [nowIso, id]);
    });

    res.json({
      success: true,
      message: `Временный доступ предоставлен до ${expiresAt.toLocaleTimeString('ru-RU')}`,
      expiresAt: expiresIso
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
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
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

    const nowIso = new Date().toISOString();
    const revokeReason = (reason && typeof reason === 'string') ? reason.trim().slice(0, 300) : 'Отозвано администратором';

    runTransaction(db, () => {
      db.run("UPDATE devices SET trust_status = 'REVOKED', updated_at = ? WHERE id = ?;", [nowIso, id]);
      db.run("UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'TRUST_REVOKED', 'WARNING', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        id,
        `Доверие к устройству ${device.name} (${device.ip_address}) отозвано администратором`,
        JSON.stringify({ reason: revokeReason }),
        nowIso
      ]);

      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'TRUST_REVOKED',
        targetType: 'DEVICE',
        targetId: id,
        details: `Отозван статус доверия для ${device.name} (${device.mac_address}). Причина: ${revokeReason}`,
        createdAt: nowIso
      });
    });

    res.json({ success: true, message: 'Доверие к устройству успешно отозвано' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Soft Delete Device
apiRouter.delete('/devices/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

    const nowIso = new Date().toISOString();

    runTransaction(db, () => {
      db.run("UPDATE devices SET deleted_at = ?, is_online = 0 WHERE id = ?;", [nowIso, id]);
      db.run("UPDATE authorizations SET active = 0 WHERE device_id = ?;", [id]);

      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'DEVICE_DELETED',
        targetType: 'DEVICE',
        targetId: id,
        details: `Устройство ${device.name} (${device.mac_address}) удалено из активного мониторинга (исторические записи сохранены)`,
        createdAt: nowIso
      });
    });

    res.json({ success: true, message: 'Устройство удалено из активного мониторинга. Исторические логи сохранены.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Device Investigation Timeline
apiRouter.get('/devices/:id/timeline', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [id]);
    if (!device) {
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

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

    const combined = [...events, ...incidents, ...audits].map((item: any) => ({
      ...item,
      metadata: typeof item.metadata === 'string' ? safeJsonParse(item.metadata, item.metadata) : item.metadata
    }));

    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ success: true, device, timeline: combined });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
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
    if (error.code === 'SCAN_IN_PROGRESS') {
      return res.status(409).json({ success: false, error: { message: 'Сканирование сети уже выполняется' } });
    }
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 4. INCIDENTS
// ==========================================
apiRouter.get('/incidents', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const state = computeSystemState(db);
    res.json({ success: true, incidents: state.incidents });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.post('/incidents/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const inc = dbGet(db, "SELECT * FROM incidents WHERE id = ?;", [id]);
    if (!inc) {
      return res.status(404).json({ success: false, error: { message: 'Инцидент не найден' } });
    }

    const nowIso = new Date().toISOString();
    runTransaction(db, () => {
      db.run("UPDATE incidents SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?;", [nowIso, id]);

      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'INCIDENT_ACKNOWLEDGED',
        targetType: 'INCIDENT',
        targetId: id,
        details: `Инцидент ${inc.incident_code} принят в обработку администратором`,
        createdAt: nowIso
      });
    });

    res.json({ success: true, message: 'Инцидент принят в обработку' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.post('/incidents/:id/resolve', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { note } = req.body;

    const inc = dbGet(db, "SELECT * FROM incidents WHERE id = ?;", [id]);
    if (!inc) {
      return res.status(404).json({ success: false, error: { message: 'Инцидент не найден' } });
    }

    const nowIso = new Date().toISOString();
    const resolutionNote = (note && typeof note === 'string' && note.trim())
      ? note.trim().slice(0, 300)
      : 'Проблема проверена и устранена администратором';

    runTransaction(db, () => {
      db.run("UPDATE incidents SET status = 'RESOLVED', resolved_at = ?, resolution_note = ? WHERE id = ?;", [nowIso, resolutionNote, id]);

      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'INCIDENT_RESOLVED',
        targetType: 'INCIDENT',
        targetId: id,
        details: `Инцидент ${inc.incident_code} закрыт. Резолюция: ${resolutionNote}`,
        createdAt: nowIso
      });

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, 'INCIDENT_RESOLVED', 'INFO', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        inc.device_id,
        `Инцидент ${inc.incident_code} закрыт администратором (${resolutionNote})`,
        JSON.stringify({ incidentCode: inc.incident_code, note: resolutionNote }),
        nowIso
      ]);
    });

    res.json({ success: true, message: 'Инцидент успешно закрыт' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 5. AUDIT LOG & INTEGRITY HASH CHAIN
// ==========================================
apiRouter.get('/audit/integrity', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const result = verifyAuditIntegrity(db);
    res.json({ success: true, integrity: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.get('/audit', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { action, search, limit = '200', offset = '0' } = req.query;

    const parsedLimit = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 200));
    const parsedOffset = Math.max(0, parseInt(String(offset), 10) || 0);

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

    query += " ORDER BY rowid DESC LIMIT ? OFFSET ?;";
    params.push(parsedLimit, parsedOffset);

    const records = dbAll(db, query, params);
    const integrity = verifyAuditIntegrity(db);

    res.json({ success: true, auditLog: records, integrity });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { type, severity, deviceId, limit = '200' } = req.query;

    const parsedLimit = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 200));

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

    query += " ORDER BY e.created_at DESC LIMIT ?;";
    params.push(parsedLimit);

    const rows = dbAll(db, query, params).map((r: any) => ({
      ...r,
      metadata: safeJsonParse(r.metadata, null)
    }));

    res.json({ success: true, events: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 6. SETTINGS (Strict Whitelist Validation)
// ==========================================
const ALLOWED_SETTINGS_KEYS: Record<string, (val: string) => boolean> = {
  network_mode: (v) => v === 'demo' || v === 'live',
  auto_scan_enabled: (v) => v === 'true' || v === 'false',
  auto_scan_interval: (v) => ['30', '60', '300', '600'].includes(v),
  create_incident_on_unknown: (v) => v === 'true' || v === 'false',
  incident_severity_default: (v) => ['LOW', 'MEDIUM', 'HIGH'].includes(v)
};

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
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: { message: 'Некорректный формат настроек' } });
    }

    const nowIso = new Date().toISOString();
    const changedDetails: Record<string, { old: string; new: string }> = {};

    runTransaction(db, () => {
      for (const [k, v] of Object.entries(settings)) {
        if (!ALLOWED_SETTINGS_KEYS[k]) continue; // Ignore non-whitelisted keys

        const strVal = String(v);
        if (!ALLOWED_SETTINGS_KEYS[k](strVal)) {
          throw new Error(`Недопустимое значение для параметра "${k}": ${strVal}`);
        }

        const current = dbGet<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?;", [k]);
        const oldVal = current ? current.value : '';

        if (oldVal !== strVal) {
          changedDetails[k] = { old: oldVal, new: strVal };
          db.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?);", [k, strVal, nowIso]);
        }
      }

      if (Object.keys(changedDetails).length > 0) {
        insertAuditRecord(db, {
          actor: 'Локальный администратор',
          action: 'SETTINGS_CHANGED',
          targetType: 'SYSTEM',
          targetId: 'config',
          details: `Обновлены параметры системы: ${JSON.stringify(changedDetails)}`,
          createdAt: nowIso
        });
      }
    });

    res.json({ success: true, message: 'Настройки успешно сохранены' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 7. EXPORT CSV (RFC 4180 + UTF-8 BOM)
// ==========================================
apiRouter.get('/export/devices', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const devices = dbAll(db, "SELECT * FROM devices WHERE deleted_at IS NULL ORDER BY ip_address;");

    const header = ['ID', 'Имя устройства', 'IP-адрес', 'MAC-адрес', 'Hostname', 'Тип', 'Производитель', 'Fingerprint', 'Достоверность', 'Статус доверия', 'В сети', 'Первое обнаружение', 'Последняя активность'];
    const rows = devices.map((d: any) => [
      escapeCsvCell(d.id),
      escapeCsvCell(d.name),
      escapeCsvCell(d.ip_address),
      escapeCsvCell(d.mac_address),
      escapeCsvCell(d.hostname || ''),
      escapeCsvCell(d.device_type),
      escapeCsvCell(d.manufacturer || ''),
      escapeCsvCell(d.fingerprint),
      escapeCsvCell(d.confidence),
      escapeCsvCell(d.trust_status),
      escapeCsvCell(d.is_online ? 'Да' : 'Нет'),
      escapeCsvCell(d.first_seen),
      escapeCsvCell(d.last_seen)
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="secure-lan-devices-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.get('/export/audit', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const records = dbAll(db, "SELECT * FROM audit_log ORDER BY rowid DESC;");

    const header = ['ID', 'Время (UTC)', 'Субъект (Actor)', 'Действие (Action)', 'Тип объекта', 'ID объекта', 'Подробности', 'Хэш записи', 'Предыдущий хэш'];
    const rows = records.map((r: any) => [
      escapeCsvCell(r.id),
      escapeCsvCell(r.created_at),
      escapeCsvCell(r.actor),
      escapeCsvCell(r.action),
      escapeCsvCell(r.target_type),
      escapeCsvCell(r.target_id),
      escapeCsvCell(r.details),
      escapeCsvCell(r.entry_hash),
      escapeCsvCell(r.previous_hash)
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="secure-lan-audit-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
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

    const header = ['ID', 'Время (UTC)', 'Тип события', 'Важность', 'Устройство', 'IP-адрес', 'Сообщение'];
    const rows = events.map((e: any) => [
      escapeCsvCell(e.id),
      escapeCsvCell(e.created_at),
      escapeCsvCell(e.event_type),
      escapeCsvCell(e.severity),
      escapeCsvCell(e.device_name || ''),
      escapeCsvCell(e.device_ip || ''),
      escapeCsvCell(e.message)
    ].join(';'));

    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="secure-lan-events-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ==========================================
// 8. DEMO SIMULATION (Protected: Demo Mode Only)
// ==========================================
function verifyDemoMode(db: any, res: Response): boolean {
  const modeSetting = dbGet<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'network_mode';");
  if (modeSetting?.value !== 'demo') {
    res.status(403).json({
      success: false,
      error: { message: 'Демонстрационные операции доступны только в Demo Mode' }
    });
    return false;
  }
  return true;
}

apiRouter.post('/demo/simulate-unknown', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!verifyDemoMode(db, res)) return;

    const newDev = demoScannerInstance.addUnknownDevice();
    const scanResult = await runNetworkScan(db);

    const device = dbGet(db, "SELECT * FROM devices WHERE mac_address = ? AND deleted_at IS NULL;", [newDev.mac.toUpperCase()]);
    const incident = device ? dbGet(db, "SELECT * FROM incidents WHERE device_id = ? ORDER BY created_at DESC LIMIT 1;", [device.id]) : null;

    res.json({
      success: true,
      message: `Обнаружено неизвестное устройство: ${newDev.ip}`,
      device,
      incident: incident ? { ...incident, evidence: safeJsonParse(incident.evidence, []) } : null,
      scanResult
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.post('/demo/toggle-online', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!verifyDemoMode(db, res)) return;

    const { deviceId, isOnline } = req.body;
    const device = dbGet(db, "SELECT * FROM devices WHERE id = ?;", [deviceId]);
    if (!device) {
      return res.status(404).json({ success: false, error: { message: 'Устройство не найдено' } });
    }

    demoScannerInstance.toggleDeviceOnline(device.mac_address, Boolean(isOnline));
    const nowIso = new Date().toISOString();

    runTransaction(db, () => {
      db.run("UPDATE devices SET is_online = ?, updated_at = ? WHERE id = ?;", [isOnline ? 1 : 0, nowIso, deviceId]);

      const eventType = isOnline ? 'DEVICE_ONLINE' : 'DEVICE_OFFLINE';
      const msg = isOnline
        ? `Устройство ${device.name} (${device.ip_address}) подключилось к сети`
        : `Устройство ${device.name} (${device.ip_address}) отключилось от сети (Offline)`;

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, ?, ?, 'INFO', ?, ?, ?);
      `, [
        crypto.randomUUID(),
        deviceId,
        eventType,
        msg,
        JSON.stringify({ isOnline: Boolean(isOnline) }),
        nowIso
      ]);
    });

    res.json({ success: true, message: `Статус устройства ${device.name} обновлён`, isOnline: Boolean(isOnline) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

apiRouter.post('/demo/expire-temporary', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!verifyDemoMode(db, res)) return;

    const pastIso = new Date(Date.now() - 5000).toISOString();
    runTransaction(db, () => {
      db.run("UPDATE authorizations SET expires_at = ? WHERE active = 1 AND authorization_type = 'TEMPORARY';", [pastIso]);
    });

    const count = checkTemporaryAuthorizations(db);
    res.json({
      success: true,
      message: `Завершён срок временного доступа для ${count} устройств`,
      count
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Demo Reset (PRESERVES AUDIT LOG!)
apiRouter.post('/demo/reset', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!verifyDemoMode(db, res)) return;

    const now = new Date();
    const nowIso = now.toISOString();

    runTransaction(db, () => {
      // 1. Reset tables (DO NOT DELETE FROM audit_log!)
      db.run("DELETE FROM authorizations;");
      db.run("DELETE FROM incidents;");
      db.run("DELETE FROM events;");
      db.run("DELETE FROM device_fingerprints;");
      db.run("DELETE FROM devices;");

      demoScannerInstance.reset();

      // 2. Re-create baseline 5 devices
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

        db.run(`
          INSERT INTO authorizations (id, device_id, authorization_type, starts_at, expires_at, note, active, created_at)
          VALUES (?, ?, 'PERMANENT', ?, NULL, 'Постоянно доверенное устройство инфраструктуры', 1, ?);
        `, [crypto.randomUUID(), d.id, firstSeen, firstSeen]);

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
          VALUES (?, ?, 'TRUST_GRANTED', 'INFO', ?, ?, ?);
        `, [
          crypto.randomUUID(),
          d.id,
          `Устройство ${d.name} включено в реестр доверенных узлов`,
          JSON.stringify({ fingerprint: fpResult.fingerprint }),
          firstSeen
        ]);
      }

      db.run(`
        INSERT INTO events (id, device_id, event_type, severity, message, metadata, created_at)
        VALUES (?, NULL, 'SYSTEM_STARTED', 'INFO', 'Демонстрационная среда возвращена к исходному состоянию', '{}', ?);
      `, [crypto.randomUUID(), nowIso]);

      // 3. Append reset entry into audit log (preserves history!)
      insertAuditRecord(db, {
        actor: 'Локальный администратор',
        action: 'DEMO_ENVIRONMENT_RESET',
        targetType: 'SYSTEM',
        targetId: 'demo-core',
        details: 'Демонстрационная среда сброшена к исходному состоянию (5 доверенных узлов). Журнал аудита сохранён.',
        createdAt: nowIso
      });
    });

    res.json({ success: true, message: 'Демонстрационная среда сброшена к исходному состоянию. Журнал аудита сохранён.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});
