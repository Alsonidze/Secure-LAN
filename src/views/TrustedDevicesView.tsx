import React, { useState } from 'react';
import { Device } from '../types';
import {
  ShieldCheck, ShieldX, Search, Laptop, Smartphone,
  Printer, Tv, Router, HelpCircle, ExternalLink
} from 'lucide-react';

interface TrustedDevicesViewProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onRevokeTrust: (device: Device) => void;
}

export const TrustedDevicesView: React.FC<TrustedDevicesViewProps> = ({
  devices,
  onSelectDevice,
  onRevokeTrust
}) => {
  const [search, setSearch] = useState('');

  const trustedDevices = devices.filter(
    (d) => d.trust_status === 'TRUSTED' &&
    (!search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address.includes(search) ||
      d.mac_address.toLowerCase().includes(search.toLowerCase()))
  );

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'desktop':
      case 'laptop':
        return <Laptop size={18} className="text-yellow-400" />;
      case 'smartphone':
      case 'tablet':
        return <Smartphone size={18} className="text-yellow-400" />;
      case 'printer':
        return <Printer size={18} className="text-yellow-400" />;
      case 'smart tv':
        return <Tv size={18} className="text-yellow-400" />;
      case 'router':
        return <Router size={18} className="text-yellow-400" />;
      default:
        return <HelpCircle size={18} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="text-yellow-400" />
            Реестр доверенных устройств (Whitelist)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Перечень проверенного и постоянно авторизованного оборудования корпоративного периметра
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
          <span>Доверенных узлов:</span>
          <span className="font-bold text-yellow-400 font-mono text-sm">{trustedDevices.length}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-4 shadow-xl flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search size={15} className="absolute left-3.5 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию, IP или MAC адресу..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition"
          />
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trustedDevices.length === 0 ? (
          <div className="col-span-full bg-[#0f141f] border border-slate-800/80 rounded-2xl p-12 text-center text-slate-500 text-xs">
            Доверенные устройства не найдены
          </div>
        ) : (
          trustedDevices.map((d) => (
            <div
              key={d.id}
              className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-yellow-400/40 transition group"
            >
              <div>
                {/* Top: Icon + Name */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700/60">
                      {getDeviceIcon(d.device_type)}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm group-hover:text-yellow-400 transition">
                        {d.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{d.device_type}</p>
                    </div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>

                {/* Parameters */}
                <div className="space-y-1.5 py-3 border-y border-slate-800/60 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">IP-адрес:</span>
                    <span className="font-mono text-white font-medium">{d.ip_address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">MAC-адрес:</span>
                    <span className="font-mono text-slate-300">{d.mac_address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Производитель:</span>
                    <span className="text-slate-300 truncate max-w-40">{d.manufacturer || 'Неизвестен'}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-400">Fingerprint:</span>
                    <span className="font-mono text-yellow-400 text-[11px]">{d.fingerprint}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 mt-3 flex items-center justify-between text-xs">
                <button
                  onClick={() => onSelectDevice(d)}
                  className="text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <ExternalLink size={13} />
                  <span>Инспекция</span>
                </button>
                <button
                  onClick={() => onRevokeTrust(d)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                >
                  Отозвать доверие
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
