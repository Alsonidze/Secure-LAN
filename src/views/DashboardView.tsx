import React from 'react';
import {
  ShieldCheck, ShieldAlert, Clock, Laptop, AlertTriangle,
  Radio, CheckCircle2, ArrowRight, Activity, Zap
} from 'lucide-react';
import { DashboardData, Device } from '../types';
import { NetworkRadar } from '../components/NetworkRadar';

interface DashboardViewProps {
  data: DashboardData;
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onNavigateToTab: (tab: any) => void;
  onScanNow: () => Promise<void>;
  isScanning: boolean;
  onSimulateUnknown: () => Promise<void>;
  isSimulating: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  devices,
  onSelectDevice,
  onNavigateToTab,
  onScanNow,
  isScanning,
  onSimulateUnknown,
  isSimulating
}) => {
  const { stats, networkStatus, statusDescription, recentEvents, distribution } = data;

  const getStatusBanner = () => {
    switch (networkStatus) {
      case 'ALERT':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          title: 'Критическое состояние: Обнаружены несанкционированные узлы',
          icon: <ShieldAlert size={24} className="text-rose-500 shrink-0" />
        };
      case 'ATTENTION REQUIRED':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          title: 'Внимание: В сети присутствуют неавторизованные узлы или открытые инциденты',
          icon: <AlertTriangle size={24} className="text-amber-400 shrink-0" />
        };
      default:
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          title: 'Сеть в штатном режиме: Все узлы верифицированы',
          icon: <ShieldCheck size={24} className="text-emerald-400 shrink-0" />
        };
    }
  };

  const banner = getStatusBanner();

  return (
    <div className="space-y-6">
      {/* Top Welcome & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Центр мониторинга локальной сети
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Информационно-аналитическая система обнаружения и анализа несанкционированных устройств
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateToTab('radar')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition"
          >
            Полноэкранный радар
          </button>
          {data.mode === 'demo' && (
            <button
              onClick={onSimulateUnknown}
              disabled={isSimulating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-black bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 rounded-xl shadow-lg shadow-yellow-400/20 transition disabled:opacity-50"
            >
              <Zap size={14} className={isSimulating ? 'animate-bounce' : ''} />
              <span>{isSimulating ? 'Инжекция...' : 'Симулировать неизвестный узел'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Devices */}
        <div className="p-4 rounded-2xl bg-[#0f141f] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Всего узлов</span>
            <Laptop size={16} className="text-yellow-400" />
          </div>
          <div className="text-2xl lg:text-3xl font-black text-white">{stats.totalDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1">В базе мониторинга</div>
        </div>

        {/* Active Online */}
        <div className="p-4 rounded-2xl bg-[#0f141f] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">В сети (Active)</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl lg:text-3xl font-black text-emerald-400">{stats.activeDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1">Отвечают на зонды</div>
        </div>

        {/* Trusted */}
        <div className="p-4 rounded-2xl bg-[#0f141f] border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Доверенные</span>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl lg:text-3xl font-black text-yellow-400">{stats.trustedDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1">Авторизованы постоянно</div>
        </div>

        {/* Unknown */}
        <div
          className={`p-4 rounded-2xl bg-[#0f141f] border shadow-md transition-all ${
            stats.unknownDevices > 0
              ? 'border-rose-500/40 bg-rose-500/5 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
              : 'border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Неизвестные</span>
            <ShieldAlert size={16} className={stats.unknownDevices > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-500'} />
          </div>
          <div className="text-2xl lg:text-3xl font-black text-rose-400">{stats.unknownDevices}</div>
          <div className="text-[11px] text-slate-500 mt-1">Требуют внимания</div>
        </div>

        {/* Open Incidents */}
        <div
          onClick={() => onNavigateToTab('incidents')}
          className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-[#0f141f] border border-slate-800/80 shadow-md cursor-pointer hover:border-yellow-400/40 transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Инциденты</span>
            <AlertTriangle size={16} className={stats.openIncidents > 0 ? 'text-amber-400' : 'text-slate-500'} />
          </div>
          <div className="text-2xl lg:text-3xl font-black text-white flex items-center gap-2">
            <span>{stats.openIncidents}</span>
            {stats.openIncidents > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                OPEN
              </span>
            )}
          </div>
          <div className="text-[11px] text-yellow-400/80 mt-1 flex items-center gap-1">
            <span>Перейти к списку</span>
            <ArrowRight size={10} />
          </div>
        </div>
      </div>

      {/* Network Status Banner */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${banner.bg}`}>
        <div className="flex items-center gap-3.5">
          {banner.icon}
          <div>
            <div className="font-bold text-sm tracking-tight">{banner.title}</div>
            <div className="text-xs opacity-90 mt-0.5 leading-relaxed">{statusDescription}</div>
          </div>
        </div>
        <div className="shrink-0 hidden md:block">
          <span className="font-mono text-xs font-bold px-3 py-1 rounded-xl bg-black/30 border border-current">
            {networkStatus}
          </span>
        </div>
      </div>

      {/* Central Visual Section: Radar + Analytics / Events */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Network Radar Card */}
        <div className="xl:col-span-7 bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
              <h3 className="font-bold text-white text-base">Интерактивный Network Radar</h3>
            </div>
            <button
              onClick={() => onNavigateToTab('radar')}
              className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1 font-semibold"
            >
              Развернуть радар <ArrowRight size={13} />
            </button>
          </div>

          {/* SVG Radar */}
          <div className="py-2 flex items-center justify-center">
            <NetworkRadar
              devices={devices}
              onSelectDevice={onSelectDevice}
              size={440}
              isCompact={false}
            />
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 text-center">
            Нажмите на любой узел радара для открытия карточки устройства, проверки цифрового отпечатка или выдачи доступа.
          </div>
        </div>

        {/* Right Column: Device Distribution + Recent Events */}
        <div className="xl:col-span-5 space-y-6">
          {/* Device Distribution Card */}
          <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-5 shadow-xl">
            <h3 className="font-bold text-white text-sm mb-3.5 flex items-center justify-between">
              <span>Распределение узлов по статусу</span>
              <span className="text-xs text-slate-400 font-normal">Всего: {stats.totalDevices}</span>
            </h3>

            {/* Distribution bars */}
            <div className="space-y-2.5">
              {distribution.map((item) => {
                const percent = stats.totalDevices > 0 ? Math.round((item.count / stats.totalDevices) * 100) : 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">{item.name}</span>
                      <span className="font-mono text-slate-400">{item.count} ({percent}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Events Log */}
          <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-yellow-400" />
                <h3 className="font-bold text-white text-sm">Недавние события сети</h3>
              </div>
              <button
                onClick={() => onNavigateToTab('audit')}
                className="text-xs text-yellow-400 hover:underline"
              >
                Все события
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
              {recentEvents.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Событий пока не зарегистрировано
                </div>
              ) : (
                recentEvents.slice(0, 6).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200 truncate">{evt.message}</span>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">
                        {new Date(evt.created_at).toLocaleTimeString('ru-RU')}
                      </span>
                    </div>
                    {evt.device_name && (
                      <div className="text-[11px] text-slate-400 mt-1 flex gap-2">
                        <span>Узел: {evt.device_name}</span>
                        {evt.device_ip && <span>({evt.device_ip})</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
