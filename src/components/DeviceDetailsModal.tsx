import React, { useState, useEffect } from 'react';
import { Device, ActiveAuthorization } from '../types';
import {
  X, ShieldCheck, Clock, ShieldAlert, Fingerprint, Activity,
  Trash2, ExternalLink, Laptop, Smartphone, Printer, Tv, Router, HelpCircle
} from 'lucide-react';

interface DeviceDetailsModalProps {
  device: Device | null;
  onClose: () => void;
  onTrustPermanently: (device: Device) => void;
  onGrantTemporary: (device: Device) => void;
  onRevokeTrust: (device: Device) => void;
  onDeleteDevice: (device: Device) => void;
  onOpenInvestigation: (device: Device) => void;
  onViewFingerprint: (device: Device) => void;
}

export const DeviceDetailsModal: React.FC<DeviceDetailsModalProps> = ({
  device,
  onClose,
  onTrustPermanently,
  onGrantTemporary,
  onRevokeTrust,
  onDeleteDevice,
  onOpenInvestigation,
  onViewFingerprint
}) => {
  if (!device) return null;

  // Local live timer for temporary access remaining time
  const [remainingSec, setRemainingSec] = useState<number>(
    device.activeAuthorization?.remainingSeconds || 0
  );

  useEffect(() => {
    if (!device.activeAuthorization?.expires_at) return;

    const updateTimer = () => {
      const expiresTime = new Date(device.activeAuthorization!.expires_at!).getTime();
      const diff = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
      setRemainingSec(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [device]);

  const formatRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Истёк';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'desktop':
      case 'laptop':
        return <Laptop className="text-yellow-400" size={24} />;
      case 'smartphone':
      case 'tablet':
        return <Smartphone className="text-yellow-400" size={24} />;
      case 'printer':
        return <Printer className="text-yellow-400" size={24} />;
      case 'smart tv':
        return <Tv className="text-yellow-400" size={24} />;
      case 'router':
        return <Router className="text-yellow-400" size={24} />;
      default:
        return <HelpCircle className="text-slate-400" size={24} />;
    }
  };

  const getStatusBadge = () => {
    switch (device.trust_status) {
      case 'TRUSTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={14} /> Доверенное (TRUSTED)
          </span>
        );
      case 'TEMPORARY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={14} /> Временный доступ
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <ShieldAlert size={14} /> Неизвестное (UNKNOWN)
          </span>
        );
      case 'REVOKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Доверие отозвано
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-inner">
              {getDeviceIcon(device.device_type)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">{device.name}</h2>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{device.device_type}</span>
                <span>•</span>
                <span className={device.is_online ? 'text-emerald-400' : 'text-slate-500'}>
                  {device.is_online ? '● В сети (Online)' : '○ Не в сети (Offline)'}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Temporary Access Banner if active */}
          {device.trust_status === 'TEMPORARY' && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="text-amber-400 shrink-0" size={22} />
                <div>
                  <div className="font-semibold text-amber-300 text-sm">Активна временная авторизация</div>
                  <div className="text-xs text-amber-400/80">
                    {device.activeAuthorization?.note || 'Авторизовано локальным администратором'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Осталось времени</div>
                <div className="font-mono text-lg font-bold text-amber-300">
                  {formatRemaining(remainingSec)}
                </div>
              </div>
            </div>
          )}

          {/* Network Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 mb-1">IP-адрес в подсети</div>
              <div className="font-mono text-white text-base font-semibold">{device.ip_address}</div>
            </div>
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 mb-1">Физический MAC-адрес</div>
              <div className="font-mono text-white text-base font-semibold">{device.mac_address}</div>
            </div>
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 mb-1">Сетевое имя узла (Hostname)</div>
              <div className="text-slate-200 text-sm font-medium">{device.hostname || 'Не определено'}</div>
            </div>
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400 mb-1">Производитель оборудования (OUI)</div>
              <div className="text-slate-200 text-sm font-medium">{device.manufacturer || 'Неизвестен'}</div>
            </div>
          </div>

          {/* Fingerprint Card */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow-400/10 border border-yellow-400/20 rounded-lg text-yellow-400">
                <Fingerprint size={22} />
              </div>
              <div>
                <div className="text-xs text-slate-400">Аналитический цифровой отпечаток</div>
                <div className="font-mono text-white font-bold tracking-wide mt-0.5">{device.fingerprint}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Достоверность корреляции: <span className="text-yellow-400 font-semibold">{device.confidence}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onViewFingerprint(device)}
              className="px-3 py-1.5 text-xs font-semibold text-yellow-300 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 rounded-lg transition"
            >
              Детали отпечатка
            </button>
          </div>

          {/* History observation timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl flex justify-between">
              <span className="text-slate-400">Первое обнаружение:</span>
              <span className="text-slate-200 font-medium">
                {new Date(device.first_seen).toLocaleString('ru-RU')}
              </span>
            </div>
            <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl flex justify-between">
              <span className="text-slate-400">Последняя активность:</span>
              <span className="text-slate-200 font-medium">
                {new Date(device.last_seen).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenInvestigation(device);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700"
            >
              <Activity size={14} className="text-cyan-400" />
              Расследование активности
            </button>
            <button
              onClick={() => onDeleteDevice(device)}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition border border-transparent hover:border-rose-500/20"
              title="Удалить устройство"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {device.trust_status === 'UNKNOWN' && (
              <>
                <button
                  onClick={() => onGrantTemporary(device)}
                  className="px-4 py-2 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition"
                >
                  Временный доступ
                </button>
                <button
                  onClick={() => onTrustPermanently(device)}
                  className="px-4 py-2 text-xs font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-400/20 transition"
                >
                  Доверить постоянно
                </button>
              </>
            )}

            {device.trust_status === 'TEMPORARY' && (
              <>
                <button
                  onClick={() => onGrantTemporary(device)}
                  className="px-4 py-2 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition"
                >
                  Продлить доступ
                </button>
                <button
                  onClick={() => onTrustPermanently(device)}
                  className="px-4 py-2 text-xs font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-400/20 transition"
                >
                  Сделать доверенным
                </button>
              </>
            )}

            {device.trust_status === 'TRUSTED' && (
              <button
                onClick={() => onRevokeTrust(device)}
                className="px-4 py-2 text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition"
              >
                Отозвать доверие
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
