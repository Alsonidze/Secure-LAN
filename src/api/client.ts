import { DashboardData, Device, Incident, EventRecord, AuditRecord } from '../types';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  async getDashboard(): Promise<DashboardData> {
    const res = await fetch('/api/dashboard');
    return handleResponse<DashboardData>(res);
  },

  async getDevices(status?: string, search?: string): Promise<{ success: boolean; devices: Device[] }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const res = await fetch(`/api/devices?${params.toString()}`);
    return handleResponse(res);
  },

  async getDevice(id: string): Promise<{ success: boolean; device: any }> {
    const res = await fetch(`/api/devices/${id}`);
    return handleResponse(res);
  },

  async trustDevice(id: string, data: { name?: string; deviceType?: string; note?: string }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/devices/${id}/trust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async grantTemporaryAccess(id: string, durationMinutes: number, note?: string): Promise<{ success: boolean; message: string; expiresAt: string }> {
    const res = await fetch(`/api/devices/${id}/temporary-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes, note })
    });
    return handleResponse(res);
  },

  async revokeTrust(id: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/devices/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return handleResponse(res);
  },

  async deleteDevice(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    return handleResponse(res);
  },

  async getDeviceTimeline(id: string): Promise<{ success: boolean; device: Device; timeline: any[] }> {
    const res = await fetch(`/api/devices/${id}/timeline`);
    return handleResponse(res);
  },

  async runScan(): Promise<{ success: boolean; result: any }> {
    const res = await fetch('/api/scan', { method: 'POST' });
    return handleResponse(res);
  },

  async getIncidents(status?: string, severity?: string): Promise<{ success: boolean; incidents: Incident[] }> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (severity) params.append('severity', severity);
    const res = await fetch(`/api/incidents?${params.toString()}`);
    return handleResponse(res);
  },

  async acknowledgeIncident(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/incidents/${id}/acknowledge`, { method: 'POST' });
    return handleResponse(res);
  },

  async resolveIncident(id: string, note?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/incidents/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    return handleResponse(res);
  },

  async getAuditLog(action?: string, search?: string): Promise<{ success: boolean; auditLog: AuditRecord[] }> {
    const params = new URLSearchParams();
    if (action) params.append('action', action);
    if (search) params.append('search', search);
    const res = await fetch(`/api/audit?${params.toString()}`);
    return handleResponse(res);
  },

  async getEvents(type?: string, severity?: string, deviceId?: string): Promise<{ success: boolean; events: EventRecord[] }> {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (severity) params.append('severity', severity);
    if (deviceId) params.append('deviceId', deviceId);
    const res = await fetch(`/api/events?${params.toString()}`);
    return handleResponse(res);
  },

  async getSettings(): Promise<{ success: boolean; settings: Record<string, string> }> {
    const res = await fetch('/api/settings');
    return handleResponse(res);
  },

  async updateSettings(settings: Record<string, string>): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return handleResponse(res);
  },

  // Demo simulation endpoints
  async simulateUnknownDevice(): Promise<{ success: boolean; message: string; device: Device; incident: Incident | null }> {
    const res = await fetch('/api/demo/simulate-unknown', { method: 'POST' });
    return handleResponse(res);
  },

  async toggleDeviceOnline(deviceId: string, isOnline: boolean): Promise<{ success: boolean; message: string; isOnline: boolean }> {
    const res = await fetch('/api/demo/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, isOnline })
    });
    return handleResponse(res);
  },

  async expireTemporaryAccess(): Promise<{ success: boolean; message: string; count: number }> {
    const res = await fetch('/api/demo/expire-temporary', { method: 'POST' });
    return handleResponse(res);
  },

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/demo/reset', { method: 'POST' });
    return handleResponse(res);
  }
};
