import React, { useState, useEffect } from 'react';
import { AuditRecord } from '../types';
import { api } from '../api/client';
import {
  ScrollText, Search, Download, Filter,
  Shield, Check, User, Info
} from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadAuditLog = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLog(actionFilter, search);
      if (res.success) {
        setRecords(res.auditLog);
      }
    } catch (e) {
      console.error('Failed to load audit log', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLog();
  }, [actionFilter, search]);

  const handleExportCsv = () => {
    window.location.href = '/api/export/audit';
  };

  const getActionBadge = (action: string) => {
    if (action.includes('TRUST_GRANTED')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">TRUST_GRANTED</span>;
    }
    if (action.includes('TRUST_REVOKED') || action.includes('DEVICE_DELETED')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">{action}</span>;
    }
    if (action.includes('TEMPORARY')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">{action}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{action}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ScrollText className="text-yellow-400" />
            Неизменяемый журнал аудита (Audit Log)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Хронологическая фиксация административных действий и авторизационных изменений (Append-only журнал)
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 border border-slate-700 rounded-xl hover:border-yellow-400 transition shadow-sm"
        >
          <Download size={14} />
          <span>Экспорт в CSV</span>
        </button>
      </div>

      {/* Analytical disclaimer notice */}
      <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 text-xs text-slate-400">
        <Info size={18} className="text-yellow-400 shrink-0" />
        <span>
          Журнал аудита ведётся в режиме append-only на уровне бизнес-логики приложения.
          Записи не подлежат редактированию или выборочному удалению через интерфейс оператора.
        </span>
      </div>

      {/* Filters and search */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Фильтр по типу:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Все действия</option>
            <option value="TRUST_GRANTED">Выдача постоянного доверия (TRUST_GRANTED)</option>
            <option value="TRUST_REVOKED">Отзыв доверия (TRUST_REVOKED)</option>
            <option value="TEMPORARY_ACCESS_GRANTED">Временный доступ (GRANTED)</option>
            <option value="TEMPORARY_ACCESS_EXPIRED">Истечение временного доступа (EXPIRED)</option>
            <option value="INCIDENT_ACKNOWLEDGED">Принятие инцидента (ACKNOWLEDGED)</option>
            <option value="INCIDENT_RESOLVED">Закрытие инцидента (RESOLVED)</option>
            <option value="DEVICE_DELETED">Удаление узла (DEVICE_DELETED)</option>
            <option value="SETTINGS_CHANGED">Изменение настроек (SETTINGS_CHANGED)</option>
          </select>
        </div>

        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3.5 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по описанию или субъекту..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">Время (UTC)</th>
                <th className="py-3.5 px-4">Субъект (Actor)</th>
                <th className="py-3.5 px-4">Действие (Action)</th>
                <th className="py-3.5 px-4">Объект</th>
                <th className="py-3.5 px-4">Подробности</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    Загрузка записей аудита...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    Записи аудита не найдены
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      {r.actor}
                    </td>
                    <td className="py-3.5 px-4">
                      {getActionBadge(r.action)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                      {r.target_type} • {r.target_id.slice(0, 16)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 leading-relaxed max-w-md">
                      {r.details}
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
