export interface IncidentEvidence {
  incidentCode: string;
  deviceId: string;
  type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  explanation: string;
  evidence: string[];
}

export function generateUnknownDeviceIncident(device: {
  id: string;
  name: string;
  ip: string;
  mac: string;
  fingerprint: string;
  hostname?: string | null;
  firstSeen: string;
}, defaultSeverity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): IncidentEvidence {
  const codeNum = Math.floor(1000 + Math.random() * 9000);
  const incidentCode = `INC-${new Date().getFullYear()}-${codeNum}`;
  const timeStr = new Date(device.firstSeen).toLocaleTimeString('ru-RU');

  const summary = `Обнаружено новое неизвестное устройство: ${device.ip}`;

  const explanation =
    `Устройство с цифровым отпечатком ${device.fingerprint} зафиксировано в сегменте локальной сети в ${timeStr}. ` +
    `Данный узел отсутствует в локальном реестре доверенных устройств (Trusted Devices). ` +
    `Присвоен статус «Неизвестное». Данная классификация является превентивной аналитической мерой и не ` +
    `утверждает наличие вредоносной активности. Рекомендуется идентификация владельца узла и принятие решения ` +
    `об авторизации либо изоляции.`;

  const evidence = [
    `Цифровой отпечаток (${device.fingerprint}) ранее не регистрировался в системе`,
    `Устройство отсутствует в реестре разрешённого сетевого оборудования`,
    `Время первичного обнаружения: ${timeStr} (UTC: ${device.firstSeen})`,
    `Сетевой адрес в сегменте: ${device.ip}`,
    `Аппаратный MAC-адрес адаптера: ${device.mac}`,
    device.hostname ? `Зафиксированное имя хоста: ${device.hostname}` : 'Сетевое имя узла (hostname) не объявлено'
  ];

  return {
    incidentCode,
    deviceId: device.id,
    type: 'UNKNOWN_DEVICE',
    severity: defaultSeverity,
    summary,
    explanation,
    evidence
  };
}
