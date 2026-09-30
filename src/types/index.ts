export type TrustStatus = 'UNKNOWN' | 'TEMPORARY' | 'TRUSTED' | 'REVOKED';
export type IncidentSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type NetworkStatusType = 'NORMAL' | 'ATTENTION REQUIRED' | 'ALERT';

export interface ActiveAuthorization {
  id: string;
  device_id: string;
  authorization_type: 'PERMANENT' | 'TEMPORARY';
  starts_at: string;
  expires_at: string | null;
  note: string | null;
  active: number;
  remainingSeconds?: number;
}

export interface Device {
  id: string;
  name: string;
  ip_address: string;
  mac_address: string;
  hostname: string | null;
  device_type: string;
  manufacturer: string;
  fingerprint: string;
  confidence: 'High' | 'Medium' | 'Low';
  trust_status: TrustStatus;
  first_seen: string;
  last_seen: string;
  is_online: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  activeAuthorization?: ActiveAuthorization | null;
}

export interface Incident {
  id: string;
  incident_code: string;
  device_id: string;
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  explanation: string;
  evidence: string[];
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  device_name?: string;
  device_ip?: string;
  device_mac?: string;
  device_fingerprint?: string;
}

export interface EventRecord {
  id: string;
  device_id: string | null;
  event_type: string;
  severity: string;
  message: string;
  metadata: any;
  created_at: string;
  device_name?: string;
  device_ip?: string;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface DashboardStats {
  totalDevices: number;
  activeDevices: number;
  trustedDevices: number;
  temporaryDevices: number;
  unknownDevices: number;
  openIncidents: number;
  acknowledgedIncidents: number;
  resolvedIncidents: number;
}

export interface DashboardData {
  success: boolean;
  stats: DashboardStats;
  networkStatus: NetworkStatusType;
  statusDescription: string;
  distribution: { name: string; count: number; color: string }[];
  recentEvents: EventRecord[];
  lastScan: string | null;
  mode: 'demo' | 'live';
}

export interface FingerprintDetails {
  fingerprint: string;
  fullHash: string;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceReason: string;
  attributesUsed: Record<string, string>;
  generatedAt: string;
}
