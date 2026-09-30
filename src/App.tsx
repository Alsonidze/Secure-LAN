import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client';
import { DashboardData, Device, Incident } from './types';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DemoControlsBanner } from './components/DemoControlsBanner';

// Views
import { DashboardView } from './views/DashboardView';
import { RadarView } from './views/RadarView';
import { DevicesView } from './views/DevicesView';
import { IncidentsView } from './views/IncidentsView';
import { InvestigationView } from './views/InvestigationView';
import { TrustedDevicesView } from './views/TrustedDevicesView';
import { AuditLogView } from './views/AuditLogView';
import { SettingsView } from './views/SettingsView';

// Modals
import { DeviceDetailsModal } from './components/DeviceDetailsModal';
import { FingerprintModal } from './components/FingerprintModal';
import { TemporaryAuthModal } from './components/TemporaryAuthModal';
import { PermanentTrustModal } from './components/PermanentTrustModal';
import { IncidentDetailsModal } from './components/IncidentDetailsModal';
import { ConfirmationModal } from './components/ConfirmationModal';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modal target states
  const [inspectingDevice, setInspectingDevice] = useState<Device | null>(null);
  const [fingerprintDevice, setFingerprintDevice] = useState<Device | null>(null);
  const [temporaryAuthDevice, setTemporaryAuthDevice] = useState<Device | null>(null);
  const [permanentTrustDevice, setPermanentTrustDevice] = useState<Device | null>(null);
  const [revokeDevice, setRevokeDevice] = useState<Device | null>(null);
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);
  const [inspectingIncident, setInspectingIncident] = useState<Incident | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Investigation view target device
  const [investigationDeviceId, setInvestigationDeviceId] = useState<string | undefined>();

  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Fetch full application state
  const loadData = useCallback(async () => {
    try {
      const [dashRes, devRes, incRes] = await Promise.all([
        api.getDashboard(),
        api.getDevices(),
        api.getIncidents()
      ]);

      if (dashRes.success) setDashboardData(dashRes);
      if (devRes.success) setDevices(devRes.devices);
      if (incRes.success) setIncidents(incRes.incidents);
    } catch (err: any) {
      console.error('Error fetching Secure LAN data:', err);
    }
  }, []);

  // Initial load + periodic polling (every 6 seconds for live state & expiration checks)
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Actions
  const handleScanNow = async () => {
    setIsScanning(true);
    try {
      const res = await api.runScan();
      if (res.success) {
        showToast(
          `Сканирование завершено: обнаружено ${res.result.totalFound} узлов (новых: ${res.result.newDevices})`,
          'success'
        );
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка при сканировании: ' + err.message, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSimulateUnknown = async () => {
    setIsSimulating(true);
    try {
      const res = await api.simulateUnknownDevice();
      if (res.success) {
        showToast(
          `Внимание: Зафиксировано неизвестное устройство (${res.device?.ip_address})! Создан инцидент.`,
          'warning'
        );
        await loadData();
        // If device created, set up for quick inspection
        if (res.device) {
          setInspectingDevice(res.device);
        }
      }
    } catch (err: any) {
      showToast('Ошибка симуляции: ' + err.message, 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTrustPermanently = async (deviceId: string, data: { name: string; deviceType: string; note: string }) => {
    try {
      const res = await api.trustDevice(deviceId, data);
      if (res.success) {
        showToast('Устройство успешно зарегистрировано как доверенное', 'success');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка авторизации: ' + err.message, 'error');
    }
  };

  const handleGrantTemporary = async (deviceId: string, durationMinutes: number, note?: string) => {
    try {
      const res = await api.grantTemporaryAccess(deviceId, { durationMinutes, note });
      if (res.success) {
        showToast(res.message, 'warning');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка временной авторизации: ' + err.message, 'error');
    }
  };

  const handleRevokeTrustConfirm = async () => {
    if (!revokeDevice) return;
    try {
      const res = await api.revokeTrust(revokeDevice.id, 'Отозвано администратором');
      if (res.success) {
        showToast('Доверие к устройству отозвано', 'warning');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка отзыва доверия: ' + err.message, 'error');
    } finally {
      setRevokeDevice(null);
    }
  };

  const handleDeleteDeviceConfirm = async () => {
    if (!deleteDevice) return;
    try {
      const res = await api.deleteDevice(deleteDevice.id);
      if (res.success) {
        showToast('Устройство удалено из активного мониторинга (логи сохранены)', 'info');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка удаления устройства: ' + err.message, 'error');
    } finally {
      setDeleteDevice(null);
    }
  };

  const handleAcknowledgeIncident = async (id: string) => {
    try {
      const res = await api.acknowledgeIncident(id);
      if (res.success) {
        showToast('Инцидент принят в обработку', 'info');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка обработки инцидента: ' + err.message, 'error');
    }
  };

  const handleResolveIncident = async (id: string, note: string) => {
    try {
      const res = await api.resolveIncident(id, note);
      if (res.success) {
        showToast('Инцидент успешно закрыт', 'success');
        await loadData();
        setInspectingIncident(null);
      }
    } catch (err: any) {
      showToast('Ошибка закрытия инцидента: ' + err.message, 'error');
    }
  };

  const handleExpireTemporaryNow = async () => {
    try {
      const res = await api.expireTemporaryAccess();
      if (res.success) {
        showToast(res.message, 'warning');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка завершения доступа: ' + err.message, 'error');
    }
  };

  const handleResetDemoConfirm = async () => {
    try {
      const res = await api.resetDemo();
      if (res.success) {
        showToast('Демо-окружение сброшено к базовому состоянию (5 доверенных узлов)', 'success');
        await loadData();
      }
    } catch (err: any) {
      showToast('Ошибка сброса: ' + err.message, 'error');
    } finally {
      setIsResetConfirmOpen(false);
    }
  };

  const handleOpenInvestigationForDevice = (deviceOrId: Device | string) => {
    const id = typeof deviceOrId === 'string' ? deviceOrId : deviceOrId.id;
    setInvestigationDeviceId(id);
    setCurrentTab('investigation');
  };

  // Header Title calculation
  const getHeaderTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return { title: 'Панель управления', subtitle: 'Оперативный мониторинг LAN' };
      case 'radar':
        return { title: 'Сетевой радар', subtitle: 'Круговая карта активных узлов' };
      case 'devices':
        return { title: 'Устройства сети', subtitle: 'Инвентаризация и аналитические отпечатки' };
      case 'incidents':
        return { title: 'Инциденты безопасности', subtitle: 'Анализ обнаруженных аномалий' };
      case 'investigation':
        return { title: 'Расследование активности', subtitle: 'Ретроспективная хронология' };
      case 'trusted':
        return { title: 'Доверенные узлы', subtitle: 'Белый список разрешённых устройств' };
      case 'audit':
        return { title: 'Журнал аудита', subtitle: 'Append-only аудит действий администратора' };
      case 'settings':
        return { title: 'Настройки', subtitle: 'Параметры системы и сканирования' };
    }
  };

  const headerInfo = getHeaderTitle();

  return (
    <div className="min-h-screen bg-[#090b10] text-[#f1f5f9] flex font-sans">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        openIncidentsCount={dashboardData?.stats?.openIncidents || 0}
        unknownDevicesCount={dashboardData?.stats?.unknownDevices || 0}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        mode={dashboardData?.mode || 'demo'}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Header */}
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          networkStatus={dashboardData?.networkStatus || 'NORMAL'}
          lastScanTime={dashboardData?.lastScan || null}
          onScanNow={handleScanNow}
          isScanning={isScanning}
          onSimulateUnknown={handleSimulateUnknown}
          isSimulating={isSimulating}
          recentEvents={dashboardData?.recentEvents || []}
          mode={dashboardData?.mode || 'demo'}
          onNavigateToTab={setCurrentTab}
        />

        {/* View Viewport */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto pb-24">
          {currentTab === 'dashboard' && dashboardData && (
            <DashboardView
              data={dashboardData}
              devices={devices}
              onSelectDevice={(d) => setInspectingDevice(d)}
              onNavigateToTab={setCurrentTab}
              onScanNow={handleScanNow}
              isScanning={isScanning}
              onSimulateUnknown={handleSimulateUnknown}
              isSimulating={isSimulating}
            />
          )}

          {currentTab === 'radar' && (
            <RadarView
              devices={devices}
              onSelectDevice={(d) => setInspectingDevice(d)}
              onScanNow={handleScanNow}
              isScanning={isScanning}
              onSimulateUnknown={handleSimulateUnknown}
              isSimulating={isSimulating}
              mode={dashboardData?.mode || 'demo'}
            />
          )}

          {currentTab === 'devices' && (
            <DevicesView
              devices={devices}
              onSelectDevice={(d) => setInspectingDevice(d)}
              onTrustPermanently={(d) => setPermanentTrustDevice(d)}
              onGrantTemporary={(d) => setTemporaryAuthDevice(d)}
              onRevokeTrust={(d) => setRevokeDevice(d)}
              onDeleteDevice={(d) => setDeleteDevice(d)}
              onScanNow={handleScanNow}
              isScanning={isScanning}
            />
          )}

          {currentTab === 'incidents' && (
            <IncidentsView
              incidents={incidents}
              onSelectIncident={(i) => setInspectingIncident(i)}
              onAcknowledge={handleAcknowledgeIncident}
              onResolve={handleResolveIncident}
              onOpenDevice={(deviceId) => {
                const dev = devices.find((d) => d.id === deviceId);
                if (dev) setInspectingDevice(dev);
              }}
            />
          )}

          {currentTab === 'investigation' && (
            <InvestigationView
              devices={devices}
              initialDeviceId={investigationDeviceId}
              onTrustPermanently={(d) => setPermanentTrustDevice(d)}
              onGrantTemporary={(d) => setTemporaryAuthDevice(d)}
            />
          )}

          {currentTab === 'trusted' && (
            <TrustedDevicesView
              devices={devices}
              onSelectDevice={(d) => setInspectingDevice(d)}
              onRevokeTrust={(d) => setRevokeDevice(d)}
            />
          )}

          {currentTab === 'audit' && <AuditLogView />}

          {currentTab === 'settings' && (
            <SettingsView
              onSettingsSaved={loadData}
              onResetDemo={() => setIsResetConfirmOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Floating Demo Controls in Demo Mode */}
      {dashboardData?.mode === 'demo' && (
        <DemoControlsBanner
          onSimulateUnknown={handleSimulateUnknown}
          onExpireTemporary={handleExpireTemporaryNow}
          onResetDemo={() => setIsResetConfirmOpen(true)}
          isSimulating={isSimulating}
        />
      )}

      {/* Toast Notification Container */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`p-3.5 rounded-2xl shadow-2xl border text-xs font-semibold pointer-events-auto flex items-center justify-between gap-3 animate-slideDown ${
              t.type === 'success'
                ? 'bg-[#0f1f18]/95 border-emerald-500/40 text-emerald-300'
                : t.type === 'warning'
                ? 'bg-[#21160a]/95 border-amber-500/40 text-amber-300'
                : t.type === 'error'
                ? 'bg-[#250d11]/95 border-rose-500/40 text-rose-300'
                : 'bg-[#0f141f]/95 border-yellow-400/40 text-yellow-300'
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Modals */}
      {inspectingDevice && (
        <DeviceDetailsModal
          device={inspectingDevice}
          onClose={() => setInspectingDevice(null)}
          onTrustPermanently={(d) => {
            setInspectingDevice(null);
            setPermanentTrustDevice(d);
          }}
          onGrantTemporary={(d) => {
            setInspectingDevice(null);
            setTemporaryAuthDevice(d);
          }}
          onRevokeTrust={(d) => {
            setInspectingDevice(null);
            setRevokeDevice(d);
          }}
          onDeleteDevice={(d) => {
            setInspectingDevice(null);
            setDeleteDevice(d);
          }}
          onOpenInvestigation={handleOpenInvestigationForDevice}
          onViewFingerprint={(d) => setFingerprintDevice(d)}
        />
      )}

      {fingerprintDevice && (
        <FingerprintModal
          device={fingerprintDevice}
          onClose={() => setFingerprintDevice(null)}
        />
      )}

      {temporaryAuthDevice && (
        <TemporaryAuthModal
          device={temporaryAuthDevice}
          onClose={() => setTemporaryAuthDevice(null)}
          onConfirm={handleGrantTemporary}
        />
      )}

      {permanentTrustDevice && (
        <PermanentTrustModal
          device={permanentTrustDevice}
          onClose={() => setPermanentTrustDevice(null)}
          onConfirm={handleTrustPermanently}
        />
      )}

      {inspectingIncident && (
        <IncidentDetailsModal
          incident={inspectingIncident}
          onClose={() => setInspectingIncident(null)}
          onAcknowledge={handleAcknowledgeIncident}
          onResolve={handleResolveIncident}
          onOpenDevice={(deviceId) => {
            setInspectingIncident(null);
            const dev = devices.find((d) => d.id === deviceId);
            if (dev) setInspectingDevice(dev);
          }}
          onOpenInvestigation={(deviceId) => {
            setInspectingIncident(null);
            handleOpenInvestigationForDevice(deviceId);
          }}
        />
      )}

      {/* Confirmation: Revoke Trust */}
      {revokeDevice && (
        <ConfirmationModal
          isOpen={true}
          title="Отозвать доверие к устройству?"
          message={`Вы собираетесь отозвать статус доверенного у устройства "${revokeDevice.name}" (${revokeDevice.ip_address}). Устройство будет перемещено в категорию неподтверждённых, а в журнал аудита будет внесена соответствующая запись.`}
          confirmLabel="Отозвать доверие"
          confirmVariant="danger"
          onClose={() => setRevokeDevice(null)}
          onConfirm={handleRevokeTrustConfirm}
        />
      )}

      {/* Confirmation: Delete Device */}
      {deleteDevice && (
        <ConfirmationModal
          isOpen={true}
          title="Удалить устройство из активного списка?"
          message={`Устройство "${deleteDevice.name}" (${deleteDevice.mac_address}) будет удалено из активного мониторинга. Исторические события, цифровой отпечаток и записи аудита будут сохранены для целостности аналитики.`}
          confirmLabel="Удалить узел"
          confirmVariant="danger"
          onClose={() => setDeleteDevice(null)}
          onConfirm={handleDeleteDeviceConfirm}
        />
      )}

      {/* Confirmation: Reset Demo */}
      {isResetConfirmOpen && (
        <ConfirmationModal
          isOpen={true}
          title="Сбросить демонстрационное окружение?"
          message="База данных будет полностью возвращена к исходному эталонному состоянию: 5 доверенных узлов корпоративной инфраструктуры, 0 неизвестных устройств и 0 открытых инцидентов. Это действие очистит симулированные инциденты."
          confirmLabel="Сбросить данные"
          confirmVariant="warning"
          onClose={() => setIsResetConfirmOpen(false)}
          onConfirm={handleResetDemoConfirm}
        />
      )}
    </div>
  );
}
