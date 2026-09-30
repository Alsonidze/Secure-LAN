import React, { useState } from 'react';
import { Device } from '../types';
import { NetworkRadar } from '../components/NetworkRadar';
import {
  Radar, RefreshCw, Radio, Search, Filter,
  ShieldCheck, Clock, ShieldAlert, WifiOff
} from 'lucide-react';

interface RadarViewProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onScanNow: () => Promise<void>;
  isScanning: boolean;
  onSimulateUnknown: () => Promise<void>;
  isSimulating: boolean;
  mode: 'demo' | 'live';
}

export const RadarView: React.FC<RadarViewProps> = ({
  devices,
  onSelectDevice,
  onScanNow,
  isScanning,
  onSimulateUnknown,
  isSimulating,
  mode
}) => {
  const [filter, setFilter] = useState<'all' | 'trusted' | 'temporary' | 'unknown'>('all');
  const [search, setSearch] = useState('');

  const filteredDevices = devices.filter(d => {
    if (filter === 'trusted' && d.trust_status !== 'TRUSTED') return false;
    if (filter === 'temporary' && d.trust_status !== 'TEMPORARY') return false;
    if (filter === 'unknown' && d.trust_status !== 'UNKNOWN') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.ip_address.includes(q) ||
        d.mac_address.toLowerCase().includes(q) ||
        (d.hostname && d.hostname.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Radar className="text-yellow-400" />
            Сетевой круговой радар (Network Radar)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Пространственная визуализация активных узлов локального сегмента и оперативное обнаружение вторжений
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onScanNow}
            disabled={isScanning}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 border border-slate-700 rounded-xl transition"
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin text-yellow-400' : ''} />
            <span>{isScanning ? 'Сканирование...' : 'Обновить радар'}</span>
          </button>

          {mode === 'demo' && (
            <button
              onClick={onSimulateUnknown}
              disabled={isSimulating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-black bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 rounded-xl shadow-lg shadow-yellow-400/20 transition disabled:opacity-50"
            >
              <Radio size={14} className={isSimulating ? 'animate-ping' : ''} />
              <span>Симулировать неизвестный узел</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Radar on left, device drawer on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Radar Big Display */}
        <div className="lg:col-span-8 bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center min-h-[600px]">
          <NetworkRadar
            devices={devices}
            onSelectDevice={onSelectDevice}
            size={540}
            isCompact={false}
          />
        </div>

        {/* Node Index List */}
        <div className="lg:col-span-4 bg-[#0f141f] border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[660px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
            <h3 className="font-bold text-white text-sm">Узлы на радаре ({filteredDevices.length})</h3>
            <span className="text-[11px] text-slate-500">Автокорреляция</span>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени, IP, MAC..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filter === 'all'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setFilter('trusted')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filter === 'trusted'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Доверенные
            </button>
            <button
              onClick={() => setFilter('temporary')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filter === 'temporary'
                  ? 'bg-amber-500 text-black'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Временные
            </button>
            <button
              onClick={() => setFilter('unknown')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filter === 'unknown'
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Неизвестные
            </button>
          </div>

          {/* Scrollable devices list */}
          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {filteredDevices.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                Устройства по заданному фильтру не найдены
              </div>
            ) : (
              filteredDevices.map((d) => (
                <div
                  key={d.id}
                  onClick={() => onSelectDevice(d)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                    d.trust_status === 'UNKNOWN'
                      ? 'bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50'
                      : d.trust_status === 'TEMPORARY'
                      ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        d.is_online === 0
                          ? 'bg-slate-500'
                          : d.trust_status === 'TRUSTED'
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                          : d.trust_status === 'TEMPORARY'
                          ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse'
                      }`}
                    />
                    <div className="truncate">
                      <div className="font-semibold text-white truncate">{d.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 flex gap-2">
                        <span>{d.ip_address}</span>
                        <span>•</span>
                        <span>{d.mac_address}</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      d.trust_status === 'TRUSTED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : d.trust_status === 'TEMPORARY'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {d.trust_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
