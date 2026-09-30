import React, { useState, useRef, useEffect } from 'react';
import {
  Bell, RefreshCw, Radio, ShieldAlert,
  AlertTriangle, CheckCircle2, ShieldCheck, ChevronRight
} from 'lucide-react';
import { NetworkStatusType, EventRecord } from '../types';

interface HeaderProps {
  title: string;
  subtitle?: string;
  networkStatus: NetworkStatusType;
  lastScanTime: string | null;
  onScanNow: () => Promise<void>;
  isScanning: boolean;
  onSimulateUnknown: () => Promise<void>;
  isSimulating: boolean;
  recentEvents: EventRecord[];
  mode: 'demo' | 'live';
  onNavigateToTab: (tab: any) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  networkStatus,
  lastScanTime,
  onScanNow,
  isScanning,
  onSimulateUnknown,
  isSimulating,
  recentEvents,
  mode,
  onNavigateToTab
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [readEventIds, setReadEventIds] = useState<Set<string>>(new Set());
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadEvents = recentEvents.filter(e => !readEventIds.has(e.id));

  const markAllAsRead = () => {
    const allIds = new Set(recentEvents.map(e => e.id));
    setReadEventIds(allIds);
  };

  const getStatusBadge = () => {
    switch (networkStatus) {
      case 'ALERT':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold shadow-lg shadow-rose-500/10">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>ALERT • ТРЕБУЕТСЯ ВМЕШАТЕЛЬСТВО</span>
          </div>
        );
      case 'ATTENTION REQUIRED':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold shadow-lg shadow-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>ТРЕБУЕТСЯ ВНИМАНИЕ</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>НОРМА • ВСЕ УЗЛЫ В БЕЛОМ СПИСКЕ</span>
          </div>
        );
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0a0d14]/80 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between">
      {/* Title & Status */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 -mt-0.5">{subtitle}</p>}
        </div>
        <div className="hidden lg:block ml-4">
          {getStatusBadge()}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Last scan info */}
        {lastScanTime && (
          <div className="hidden md:flex flex-col text-right text-[11px] text-slate-400 pr-2">
            <span>Последнее сканирование</span>
            <span className="font-mono text-slate-300 font-medium">
              {new Date(lastScanTime).toLocaleTimeString('ru-RU')}
            </span>
          </div>
        )}

        {/* Scan Now button */}
        <button
          onClick={onScanNow}
          disabled={isScanning}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-yellow-400/60 text-slate-200 hover:text-white text-xs font-semibold transition shadow-sm disabled:opacity-60"
        >
          <RefreshCw size={14} className={isScanning ? 'animate-spin text-yellow-400' : 'text-slate-400'} />
          <span>{isScanning ? 'Сканирование...' : 'Сканировать сеть'}</span>
        </button>

        {/* Demo Fast Trigger button */}
        {mode === 'demo' && (
          <button
            onClick={onSimulateUnknown}
            disabled={isSimulating}
            title="Инжектировать неизвестное устройство в сеть для демонстрации инцидента"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black text-xs font-bold shadow-md shadow-yellow-400/10 transition disabled:opacity-60"
          >
            <Radio size={14} className={isSimulating ? 'animate-ping' : ''} />
            <span className="hidden sm:inline">
              {isSimulating ? 'Инжекция...' : 'Симуляция неизвестного узла'}
            </span>
            <span className="sm:hidden">+ Узел</span>
          </button>
        )}

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition"
            aria-label="Уведомления"
          >
            <Bell size={18} />
            {unreadEvents.length > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-2 ring-[#0a0d14]" />
            )}
          </button>

          {/* Notifications Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0f141f] border border-slate-800 rounded-2xl shadow-2xl p-4 z-50 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm">Уведомления системы</h3>
                  {unreadEvents.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-400 text-black">
                      {unreadEvents.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-yellow-400 hover:underline"
                >
                  Прочитать все
                </button>
              </div>

              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                {recentEvents.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    Уведомлений пока нет
                  </div>
                ) : (
                  recentEvents.slice(0, 8).map((evt) => (
                    <div
                      key={evt.id}
                      className={`p-2.5 rounded-xl border text-xs transition ${
                        evt.event_type.includes('UNKNOWN') || evt.event_type.includes('INCIDENT')
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                          : evt.event_type.includes('EXPIRED') || evt.event_type.includes('WARNING')
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-white truncate">{evt.message}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {new Date(evt.created_at).toLocaleTimeString('ru-RU')}
                        </span>
                      </div>
                      {evt.device_name && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          Узел: {evt.device_name} ({evt.device_ip})
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-800/80 flex justify-between">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    onNavigateToTab('audit');
                  }}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  Журнал аудита <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    onNavigateToTab('incidents');
                  }}
                  className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  Все инциденты <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
