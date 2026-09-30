import React, { useState } from 'react';
import { Device } from '../types';
import {
  Search, ShieldCheck, Clock, ShieldAlert, Laptop, Smartphone,
  Printer, Tv, Router, HelpCircle, MoreHorizontal, ExternalLink,
  Trash2, ShieldX, RefreshCw
} from 'lucide-react';

interface DevicesViewProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onTrustPermanently: (device: Device) => void;
  onGrantTemporary: (device: Device) => void;
  onRevokeTrust: (device: Device) => void;
  onDeleteDevice: (device: Device) => void;
  onScanNow: () => Promise<void>;
  isScanning: boolean;
}

export const DevicesView: React.FC<DevicesViewProps> = ({
  devices,
  onSelectDevice,
  onTrustPermanently,
  onGrantTemporary,
  onRevokeTrust,
  onDeleteDevice,
  onScanNow,
  isScanning
}) => {
  const [filter, setFilter] = useState<'all' | 'trusted' | 'temporary' | 'unknown' | 'offline'>('all');
  const [search, setSearch] = useState('');

  const filteredDevices = devices.filter((d) => {
    if (filter === 'trusted' && d.trust_status !== 'TRUSTED') return false;
    if (filter === 'temporary' && d.trust_status !== 'TEMPORARY') return false;
    if (filter === 'unknown' && d.trust_status !== 'UNKNOWN') return false;
    if (filter === 'offline' && d.is_online !== 0) return false;

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

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'desktop':
      case 'laptop':
        return <Laptop size={16} className="text-yellow-400" />;
      case 'smartphone':
      case 'tablet':
        return <Smartphone size={16} className="text-yellow-400" />;
      case 'printer':
        return <Printer size={16} className="text-yellow-400" />;
      case 'smart tv':
        return <Tv size={16} className="text-yellow-400" />;
      case 'router':
        return <Router size={16} className="text-yellow-400" />;
      default:
        return <HelpCircle size={16} className="text-slate-400" />;
    }
  };

  const getStatusBadge = (d: Device) => {
    switch (d.trust_status) {
      case 'TRUSTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={12} /> Доверенное
          </span>
        );
      case 'TEMPORARY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Clock size={12} /> Временный доступ
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <ShieldAlert size={12} /> Неизвестное
          </span>
        );
      case 'REVOKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Отозвано
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Реестр сетевых устройств</h2>
          <p className="text-xs text-slate-400 mt-1">
            Полный перечень обнаруженных аппаратных узлов с аналитическими цифровыми отпечатками
          </p>
        </div>

        <button
          onClick={onScanNow}
          disabled={isScanning}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 border border-slate-700 rounded-xl transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={isScanning ? 'animate-spin text-yellow-400' : ''} />
          <span>{isScanning ? 'Сканирование...' : 'Сканировать сеть'}</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === 'all'
                ? 'bg-yellow-400 text-black shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Все ({devices.length})
          </button>
          <button
            onClick={() => setFilter('trusted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === 'trusted'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Доверенные ({devices.filter(d => d.trust_status === 'TRUSTED').length})
          </button>
          <button
            onClick={() => setFilter('temporary')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === 'temporary'
                ? 'bg-amber-500 text-black shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Временные ({devices.filter(d => d.trust_status === 'TEMPORARY').length})
          </button>
          <button
            onClick={() => setFilter('unknown')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === 'unknown'
                ? 'bg-rose-500 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Неизвестные ({devices.filter(d => d.trust_status === 'UNKNOWN').length})
          </button>
          <button
            onClick={() => setFilter('offline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === 'offline'
                ? 'bg-slate-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Не в сети ({devices.filter(d => d.is_online === 0).length})
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3.5 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени, IP или MAC..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition"
          />
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">Устройство</th>
                <th className="py-3.5 px-4">IP-адрес</th>
                <th className="py-3.5 px-4">MAC-адрес</th>
                <th className="py-3.5 px-4">Fingerprint</th>
                <th className="py-3.5 px-4">Статус доверия</th>
                <th className="py-3.5 px-4">Активность</th>
                <th className="py-3.5 px-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Устройства не найдены. Выполните сканирование сети или сбросьте фильтры.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-slate-900/40 transition group"
                  >
                    {/* Device Name & Icon */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800/80 rounded-lg shrink-0 border border-slate-700/50">
                          {getDeviceIcon(d.device_type)}
                        </div>
                        <div className="overflow-hidden">
                          <button
                            onClick={() => onSelectDevice(d)}
                            className="font-bold text-white hover:text-yellow-400 transition text-left truncate block max-w-xs"
                          >
                            {d.name}
                          </button>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>{d.device_type}</span>
                            {d.hostname && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 truncate">{d.hostname}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* IP Address */}
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      {d.ip_address}
                    </td>

                    {/* MAC Address */}
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {d.mac_address}
                    </td>

                    {/* Fingerprint */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-yellow-400 font-semibold text-[11px]">
                        {d.fingerprint}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Достоверность: {d.confidence}
                      </div>
                    </td>

                    {/* Trust Status */}
                    <td className="py-3.5 px-4">
                      {getStatusBadge(d)}
                    </td>

                    {/* Online / Last Seen */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${d.is_online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="text-slate-300 font-medium">
                          {d.is_online ? 'В сети' : 'Не в сети'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(d.last_seen).toLocaleTimeString('ru-RU')}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {d.trust_status === 'UNKNOWN' && (
                          <>
                            <button
                              onClick={() => onGrantTemporary(d)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition"
                            >
                              Временный
                            </button>
                            <button
                              onClick={() => onTrustPermanently(d)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-black bg-yellow-400 hover:bg-yellow-300 transition"
                            >
                              Доверить
                            </button>
                          </>
                        )}

                        {d.trust_status === 'TEMPORARY' && (
                          <>
                            <button
                              onClick={() => onGrantTemporary(d)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition"
                            >
                              Продлить
                            </button>
                            <button
                              onClick={() => onTrustPermanently(d)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-black bg-yellow-400 hover:bg-yellow-300 transition"
                            >
                              Доверить
                            </button>
                          </>
                        )}

                        {d.trust_status === 'TRUSTED' && (
                          <button
                            onClick={() => onRevokeTrust(d)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition"
                          >
                            Отозвать
                          </button>
                        )}

                        <button
                          onClick={() => onSelectDevice(d)}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Подробные сведения"
                        >
                          <ExternalLink size={14} />
                        </button>

                        <button
                          onClick={() => onDeleteDevice(d)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                          title="Удалить узел (сохранить логи)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
