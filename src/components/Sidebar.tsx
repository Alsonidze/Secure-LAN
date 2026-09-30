import React from 'react';
import {
  LayoutDashboard, Radar, Laptop2, ShieldAlert,
  SearchCode, ShieldCheck, ScrollText, Settings,
  ChevronLeft, ChevronRight, Shield, Database, Radio
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'radar'
  | 'devices'
  | 'incidents'
  | 'investigation'
  | 'trusted'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  openIncidentsCount: number;
  unknownDevicesCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mode: 'demo' | 'live';
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  openIncidentsCount,
  unknownDevicesCount,
  isCollapsed,
  onToggleCollapse,
  mode
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Панель управления',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'radar' as NavTab,
      label: 'Сетевой радар',
      icon: Radar,
      badge: unknownDevicesCount > 0 ? unknownDevicesCount : null,
      badgeColor: 'bg-rose-500'
    },
    {
      id: 'devices' as NavTab,
      label: 'Устройства сети',
      icon: Laptop2,
      badge: null
    },
    {
      id: 'incidents' as NavTab,
      label: 'Инциденты',
      icon: ShieldAlert,
      badge: openIncidentsCount > 0 ? openIncidentsCount : null,
      badgeColor: 'bg-rose-500'
    },
    {
      id: 'investigation' as NavTab,
      label: 'Расследование',
      icon: SearchCode,
      badge: null
    },
    {
      id: 'trusted' as NavTab,
      label: 'Доверенные узлы',
      icon: ShieldCheck,
      badge: null
    },
    {
      id: 'audit' as NavTab,
      label: 'Журнал аудита',
      icon: ScrollText,
      badge: null
    },
    {
      id: 'settings' as NavTab,
      label: 'Настройки',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-40 bg-[#0a0d14] border-r border-slate-800/80 flex flex-col transition-all duration-300 select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 border-b border-slate-800/80 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-black font-black text-lg shadow-lg shadow-yellow-400/20 shrink-0">
            <Shield size={22} className="stroke-[2.5]" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <div className="font-extrabold text-white text-base tracking-tight leading-none flex items-center gap-1.5">
                <span>Secure LAN</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Система Онлайн
                </span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          aria-label={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
                isActive
                  ? 'bg-yellow-400/10 text-yellow-300 border border-yellow-400/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              <Icon
                size={18}
                className={isActive ? 'text-yellow-400 stroke-[2.2]' : 'text-slate-400'}
              />

              {!isCollapsed && <span className="truncate">{item.label}</span>}

              {item.badge !== null && (
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ${
                    item.badgeColor || 'bg-yellow-500'
                  } ${isCollapsed ? 'absolute top-1.5 right-1.5' : ''}`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom System Status */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 space-y-2">
        {/* Environment Mode Badge */}
        <div
          className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold ${
            mode === 'demo'
              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
              : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
          }`}
        >
          <Radio size={14} className={mode === 'demo' ? 'text-amber-400' : 'text-cyan-400'} />
          {!isCollapsed && (
            <div className="truncate">
              <span className="uppercase text-[10px] font-bold">
                {mode === 'demo' ? 'DEMO MODE' : 'LIVE MODE'}
              </span>
            </div>
          )}
        </div>

        {/* Database Connected */}
        {!isCollapsed && (
          <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-slate-400">
            <Database size={13} className="text-emerald-400 shrink-0" />
            <span className="truncate">SQLite Connected</span>
          </div>
        )}
      </div>
    </aside>
  );
};
