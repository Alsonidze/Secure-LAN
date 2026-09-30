import crypto from 'crypto';

export interface IncidentEvidence {
  incidentId: string;
  incidentCode: string;
  deviceId: string;
  type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  explanation: string;
  evidence: string[];
}

export function generateIncidentCode(sequenceNumber: number, year: number = new Date().getFullYear()): string {
  const padded = String(sequenceNumber).padStart(4, '0');
  return `INC-${year}-${padded}`;
}

export function generateUnknownDeviceIncident(
  device: {
    id: string;
    name: string;
    ip: string;
    mac: string;
    fingerprint: string;
    hostname?: string | null;
    firstSeen: string;
  },
  sequenceNumber: number,
  defaultSeverity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
): IncidentEvidence {
  const incidentId = crypto.randomUUID();
  const incidentCode = generateIncidentCode(sequenceNumber);
  const timeStr = new Date(device.firstSeen).toLocaleTimeString('ru-RU');

  const summary = `Обнаружено неизвестное устройство: ${device.ip}`;

  const explanation =
    `В локальной сети зафиксировано устройство, которое отсутствует в реестре доверенных узлов. ` +
    `Для аппаратного MAC-адреса ${device.mac} и цифрового отпечатка ${device.fingerprint} не найдено активной разрешающей записи. ` +
    `Устройство классифицировано как UNKNOWN до верификации и решения администратора. ` +
    `Статус UNKNOWN не является доказательством вредоносной активности.`;

  const evidence = [
    `Цифровой отпечаток (${device.fingerprint}) ранее не регистрировался в системе`,
    `Устройство отсутствует в реестре доверенных узлов (White-list)`,
    `Время первичного обнаружения: ${timeStr} (UTC: ${device.firstSeen})`,
    `Текущий сетевой адрес в подсети: ${device.ip}`,
    `Аппаратный MAC-адрес адаптера: ${device.mac}`,
    device.hostname ? `Сетевое имя узла (Hostname): ${device.hostname}` : 'Сетевое имя узла (Hostname) не объявлено'
  ];

  return {
    incidentId,
    incidentCode,
    deviceId: device.id,
    type: 'UNKNOWN_DEVICE',
    severity: defaultSeverity,
    summary,
    explanation,
    evidence
  };
}
