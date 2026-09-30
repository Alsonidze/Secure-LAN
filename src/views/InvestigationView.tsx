import React, { useState, useEffect } from 'react';
import { Device } from '../types';
import { api } from '../api/client';
import {
  SearchCode, Activity, ShieldCheck, Clock, ShieldAlert,
  Fingerprint, Laptop, Wifi, ArrowDown, Filter, FileText,
  RotateCcw, CheckCircle2, User, Info
} from 'lucide-react';

interface InvestigationViewProps {
  devices: Device[];
  initialDeviceId?: string;
  onTrustPermanently: (device: Device) => void;
  onGrantTemporary: (device: Device) => void;
}

export const InvestigationView: React.FC<InvestigationViewProps> = ({
  devices,
  initialDeviceId,
  onTrustPermanently,
  onGrantTemporary
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    initialDeviceId || (devices[0]?.id || '')
  );
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [targetDevice, setTargetDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'event' | 'incident' | 'audit'>('all');

  useEffect(() => {
    if (initialDeviceId) {
      setSelectedDeviceId(initialDeviceId);
    }
  }, [initialDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId) return;

    const dev = devices.find(d => d.id === selectedDeviceId) || null;
    setTargetDevice(dev);

    const loadTimeline = async () => {
      setLoading(true);
      try {
        const res = await api.getDeviceTimeline(selectedDeviceId);
        if (res.success) {
          setTimelineData(res.timeline);
          if (res.device) setTargetDevice(res.device);
        }
      } catch (err) {
        console.error('Failed to load device timeline', err);
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [selectedDeviceId, devices]);

  const filteredTimeline = timelineData.filter(item => {
    if (categoryFilter === 'all') return true;
    return item.source === categoryFilter;
  });

  const getTimelineIcon = (item: any) => {
    if (item.source === 'incident') {
      return <ShieldAlert size={16} className="text-rose-400" />;
    }
    if (item.source === 'audit') {
      return <User size={16} className="text-yellow-400" />;
    }
    if (item.type.includes('TRUST')) {
      return <ShieldCheck size={16} className="text-emerald-400" />;
    }
    if (item.type.includes('TEMPORARY')) {
      return <Clock size={16} className="text-amber-400" />;
    }
    if (item.type.includes('FINGERPRINT')) {
      return <Fingerprint size={16} className="text-yellow-400" />;
    }
    if (item.type.includes('IP_CHANGED')) {
      return <RotateCcw size={16} className="text-cyan-400" />;
    }
    return <Wifi size={16} className="text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <SearchCode className="text-cyan-400" />
            Режим расследования (Investigation Mode)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Ретроспективный анализ истории сетевой активности, формирования цифрового профиля и действий администратора
          </p>
        </div>

        {/* Device selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Объект расследования:</span>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-yellow-400 min-w-56"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.ip_address})
              </option>
            ))}
          </select>
        </div>
      </div>

      {targetDevice && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Device Dossier */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="font-bold text-white text-sm">Досье сетевого узла</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  targetDevice.trust_status === 'TRUSTED'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : targetDevice.trust_status === 'TEMPORARY'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {targetDevice.trust_status}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Имя устройства:</span>
                  <span className="font-semibold text-white">{targetDevice.name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">IP-адрес:</span>
                  <span className="font-mono text-white">{targetDevice.ip_address}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">MAC-адрес:</span>
                  <span className="font-mono text-slate-300">{targetDevice.mac_address}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hostname:</span>
                  <span className="text-slate-300">{targetDevice.hostname || 'Не указан'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Производитель (OUI):</span>
                  <span className="text-slate-300">{targetDevice.manufacturer || 'Неизвестен'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Тип узла:</span>
                  <span className="text-slate-300">{targetDevice.device_type}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Первое обнаружение:</span>
                  <span className="text-slate-300">{new Date(targetDevice.first_seen).toLocaleString('ru-RU')}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Последняя активность:</span>
                  <span className="text-slate-300">{new Date(targetDevice.last_seen).toLocaleString('ru-RU')}</span>
                </div>
              </div>

              {/* Fingerprint block */}
              <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[11px] text-slate-400">Аналитический цифровой отпечаток</div>
                <div className="font-mono text-sm font-bold text-yellow-400">{targetDevice.fingerprint}</div>
                <div className="text-[10px] text-slate-500">
                  Достоверность: <span className="text-yellow-400 font-semibold">{targetDevice.confidence}</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-2 flex flex-col gap-2">
                {targetDevice.trust_status !== 'TRUSTED' && (
                  <button
                    onClick={() => onTrustPermanently(targetDevice)}
                    className="w-full py-2 text-xs font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-md transition"
                  >
                    Доверить постоянно
                  </button>
                )}
                {targetDevice.trust_status === 'UNKNOWN' && (
                  <button
                    onClick={() => onGrantTemporary(targetDevice)}
                    className="w-full py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition"
                  >
                    Предоставить временный доступ
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Vertical Timeline */}
          <div className="lg:col-span-7 bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Activity size={16} className="text-cyan-400" />
                Хронологическая лента событий (Timeline)
              </h3>

              {/* Filter pills */}
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    categoryFilter === 'all'
                      ? 'bg-yellow-400 text-black'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Все
                </button>
                <button
                  onClick={() => setCategoryFilter('event')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    categoryFilter === 'event'
                      ? 'bg-cyan-500 text-black'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Сетевые
                </button>
                <button
                  onClick={() => setCategoryFilter('incident')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    categoryFilter === 'incident'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Инциденты
                </button>
                <button
                  onClick={() => setCategoryFilter('audit')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    categoryFilter === 'audit'
                      ? 'bg-amber-500 text-black'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Аудит
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">Загрузка хронологии...</div>
            ) : filteredTimeline.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Записей в хронологии для данного фильтра не найдено
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {filteredTimeline.map((item, idx) => (
                  <div key={idx} className="relative group">
                    {/* Node Dot */}
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center shadow-md">
                      {getTimelineIcon(item)}
                    </div>

                    {/* Timeline Item Content */}
                    <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-1 hover:border-slate-700 transition">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white tracking-wide">
                          {item.type}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {new Date(item.created_at).toLocaleTimeString('ru-RU')} • {new Date(item.created_at).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 leading-relaxed">
                        {item.title}
                      </div>

                      {/* Additional Details */}
                      {item.metadata && typeof item.metadata === 'object' && Object.keys(item.metadata).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono">
                          {Object.entries(item.metadata).map(([k, v]) => (
                            <div key={k} className="truncate">
                              <span className="text-slate-500">{k}:</span> {String(v)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
