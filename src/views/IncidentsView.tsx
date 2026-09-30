import React, { useState } from 'react';
import { Incident } from '../types';
import {
  ShieldAlert, AlertTriangle, CheckCircle2, Clock,
  ArrowRight, FileText, Check, ShieldCheck
} from 'lucide-react';

interface IncidentsViewProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  onAcknowledge: (id: string) => Promise<void>;
  onResolve: (id: string, note: string) => Promise<void>;
  onOpenDevice: (deviceId: string) => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  onSelectIncident,
  onAcknowledge,
  onResolve,
  onOpenDevice
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filteredIncidents = incidents.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    return true;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'HIGH':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">LOW</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">INFO</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse">ОТКРЫТ (OPEN)</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">В ОБРАБОТКЕ</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">ЗАКРЫТ</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="text-rose-400" />
            Инциденты информационной безопасности
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Аналитический журнал обнаруженных аномалий и автоматических заключений экспертной системы
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Открытых инцидентов:</span>
          <span className="font-mono text-sm font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl">
            {incidents.filter(i => i.status === 'OPEN').length}
          </span>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-yellow-400 text-black'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Все ({incidents.length})
          </button>
          <button
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'OPEN'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Открытые ({incidents.filter(i => i.status === 'OPEN').length})
          </button>
          <button
            onClick={() => setStatusFilter('ACKNOWLEDGED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'ACKNOWLEDGED'
                ? 'bg-amber-500 text-black'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            В обработке ({incidents.filter(i => i.status === 'ACKNOWLEDGED').length})
          </button>
          <button
            onClick={() => setStatusFilter('RESOLVED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Закрытые ({incidents.filter(i => i.status === 'RESOLVED').length})
          </button>
        </div>

        {/* Severity Selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Важность:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Все уровни</option>
            <option value="HIGH">Высокая (HIGH)</option>
            <option value="MEDIUM">Средняя (MEDIUM)</option>
            <option value="LOW">Низкая (LOW)</option>
            <option value="INFO">Информационная (INFO)</option>
          </select>
        </div>
      </div>

      {/* Incidents Cards List */}
      <div className="space-y-4">
        {filteredIncidents.length === 0 ? (
          <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-12 text-center shadow-xl">
            <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3" />
            <h3 className="font-bold text-white text-base">Активных инцидентов не обнаружено</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              В локальной сети не зафиксировано нарушений политики безопасности и неавторизованных подключений.
            </p>
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className={`bg-[#0f141f] border rounded-2xl p-5 shadow-xl transition-all ${
                inc.status === 'OPEN'
                  ? 'border-rose-500/40 bg-gradient-to-r from-rose-500/5 to-transparent'
                  : inc.status === 'ACKNOWLEDGED'
                  ? 'border-amber-500/30'
                  : 'border-slate-800/80 opacity-80'
              }`}
            >
              {/* Card Top */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-bold text-white tracking-wider">
                    {inc.incident_code}
                  </span>
                  {getSeverityBadge(inc.severity)}
                  {getStatusBadge(inc.status)}
                </div>
                <div className="font-mono text-xs text-slate-400">
                  {new Date(inc.created_at).toLocaleString('ru-RU')}
                </div>
              </div>

              {/* Card Middle: Summary & Explanation */}
              <div className="py-4 space-y-3">
                <h4 className="font-bold text-white text-sm">{inc.summary}</h4>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  {inc.explanation}
                </p>

                {/* Evidence snippet */}
                {inc.evidence && inc.evidence.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Ключевые признаки:
                    </span>
                    <ul className="text-xs text-slate-400 space-y-0.5 list-disc list-inside">
                      {inc.evidence.slice(0, 3).map((e, idx) => (
                        <li key={idx} className="truncate">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Card Footer: Device + Actions */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span>Узел:</span>
                  <button
                    onClick={() => onOpenDevice(inc.device_id)}
                    className="font-semibold text-yellow-400 hover:underline"
                  >
                    {inc.device_name || 'Целевой узел'} ({inc.device_ip})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectIncident(inc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
                  >
                    <FileText size={14} />
                    <span>Карточка инцидента</span>
                  </button>

                  {inc.status === 'OPEN' && (
                    <button
                      onClick={() => onAcknowledge(inc.id)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold transition"
                    >
                      В обработку
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
