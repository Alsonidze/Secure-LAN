import crypto from 'crypto';

export interface FingerprintSource {
  macAddress: string;
  hostname?: string | null;
  manufacturer?: string | null;
  deviceType?: string | null;
  ipSubnet?: string | null;
}

export interface FingerprintResult {
  fingerprint: string;
  fullHash: string;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceReason: string;
  attributesUsed: Record<string, string>;
  generatedAt: string;
}

/**
 * Generates an analytical device fingerprint from observed network features.
 * This is an analytical identifier to correlate observations, not a cryptographic hardware lock.
 */
export function generateDeviceFingerprint(source: FingerprintSource): FingerprintResult {
  const normMac = (source.macAddress || '').trim().toUpperCase();
  const normHostname = (source.hostname || '').trim().toLowerCase();
  const normManufacturer = (source.manufacturer || '').trim();
  const normType = (source.deviceType || 'Unknown Device').trim();
  const normSubnet = (source.ipSubnet || '192.168.1.0/24').trim();

  const attributesUsed: Record<string, string> = {
    'MAC-адрес': normMac || 'Отсутствует',
    'Сетевое имя (Hostname)': normHostname || 'Не определено',
    'Производитель (OUI)': normManufacturer || 'Неизвестен',
    'Тип устройства': normType,
    'Подсеть LAN': normSubnet
  };

  // Canonical normalized string for hashing
  const normalizedString = [
    `mac:${normMac}`,
    `host:${normHostname}`,
    `mfg:${normManufacturer}`,
    `type:${normType}`,
    `net:${normSubnet}`
  ].join('|');

  const fullHash = crypto.createHash('sha256').update(normalizedString).digest('hex').toUpperCase();

  // Short 12-char fingerprint format: FP-XXXX-XXXX-XXXX
  const p1 = fullHash.substring(0, 4);
  const p2 = fullHash.substring(4, 8);
  const p3 = fullHash.substring(8, 12);
  const fingerprint = `FP-${p1}-${p2}-${p3}`;

  // Analytical confidence determination
  let score = 0;
  if (normMac && normMac.length >= 11) score += 2;
  if (normHostname && normHostname !== 'не определено') score += 1;
  if (normManufacturer && normManufacturer !== 'неизвестен') score += 1;

  let confidence: 'High' | 'Medium' | 'Low' = 'Low';
  let confidenceReason = 'Использованы минимальные параметры сетевого обнаружения';

  if (score >= 4) {
    confidence = 'High';
    confidenceReason = 'Идентифицированы MAC-адрес, сетевое имя хоста и вендор сетевого адаптера (OUI)';
  } else if (score >= 2) {
    confidence = 'Medium';
    confidenceReason = 'Идентифицирован валидный аппаратный MAC-адрес и базовые атрибуты';
  }

  return {
    fingerprint,
    fullHash,
    confidence,
    confidenceReason,
    attributesUsed,
    generatedAt: new Date().toISOString()
  };
}
