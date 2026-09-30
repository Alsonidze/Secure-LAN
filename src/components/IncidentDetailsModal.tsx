import React, { useState } from 'react';
import { Incident, Device } from '../types';
import {
  X, AlertTriangle, ShieldCheck, CheckCircle2,
  Clock, ArrowRight, ShieldAlert, FileText, Check
} from 'lucide-react';

interface IncidentDetailsModalProps {
  incident: Incident | null;
  onClose: () => void;
  onAcknowledge: (id: string) => Promise<void>;
  onResolve: (id: string, note: string) => Promise<void>;
  onOpenDevice: (deviceId: string) => void;
  onOpenInvestigation: (deviceId: string) => void;
}

export const IncidentDetailsModal: React.FC<IncidentDetailsModalProps> = ({
  incident,
  onClose,
  onAcknowledge,
  onResolve,
  onOpenDevice,
  onOpenInvestigation
}) => {
  const [resolutionNote, setResolutionNote] = useState('Устройство проверено администратором, угроза отсутствует');
  const [isResolving, setIsResolving] = useState(false);
  const [showResolveInput, setShowResolveInput] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!incident) return null;

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'HIGH':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">LOW</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/20 text-slate-300 border border-slate-500/40">INFO</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">ОТКРЫТ (OPEN)</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">В ОБРАБОТКЕ</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">ЗАКРЫТ (RESOLVED)</span>;
      default:
        return null;
    }
  };

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await onAcknowledge(incident.id);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSubmit = async () => {
    setLoading(true);
    try {
      await onResolve(incident.id, resolutionNote);
      setShowResolveInput(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-lg font-bold text-white">{incident.incident_code}</span>
                {getSeverityBadge(incident.severity)}
                {getStatusBadge(incident.status)}
              </div>
              <p className="text-sm font-medium text-slate-300 mt-1">{incident.summary}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Associated Device Bar */}
          <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Связанное сетевое устройство</div>
              <div className="font-semibold text-white mt-0.5">{incident.device_name || 'Устройство сети'}</div>
              <div className="font-mono text-xs text-slate-300 mt-0.5 flex gap-3">
                <span>IP: {incident.device_ip}</span>
                <span>MAC: {incident.device_mac}</span>
              </div>
            </div>
            <button
              onClick={() => onOpenDevice(incident.device_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-yellow-300 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 rounded-lg transition"
            >
              Карточка узла
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Automatic Explanation Box */}
          <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-yellow-400 uppercase tracking-wider">
              <FileText size={15} />
              Автоматическое аналитическое заключение
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              {incident.explanation}
            </p>
          </div>

          {/* Evidence / Reasons */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Причины и доказательная база (Evidence)
            </div>
            <div className="space-y-1.5">
              {incident.evidence && incident.evidence.map((ev, idx) => (
                <div key={idx} className="p-2.5 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-start gap-2 text-xs text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                  <span>{ev}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Resolution Details if already resolved */}
          {incident.status === 'RESOLVED' && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
              <div className="font-semibold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={16} /> Инцидент закрыт
              </div>
              <div className="text-slate-300">
                Резолюция: {incident.resolution_note || 'Проблема устранена'}
              </div>
              {incident.resolved_at && (
                <div className="text-slate-500 text-[11px]">
                  Время закрытия: {new Date(incident.resolved_at).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          )}

          {/* Input field if resolving now */}
          {showResolveInput && incident.status !== 'RESOLVED' && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Резолюция закрытия инцидента
              </label>
              <textarea
                rows={2}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-yellow-400"
                placeholder="Укажите результаты проверки и принятые меры..."
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResolveInput(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleResolveSubmit}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-semibold text-black bg-emerald-400 hover:bg-emerald-300 rounded-lg"
                >
                  Подтвердить закрытие
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <button
            onClick={() => onOpenInvestigation(incident.device_id)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1.5"
          >
            Хронология расследования
            <ArrowRight size={14} />
          </button>

          <div className="flex items-center gap-2">
            {incident.status === 'OPEN' && (
              <button
                onClick={handleAcknowledge}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition"
              >
                Принять в обработку
              </button>
            )}

            {incident.status !== 'RESOLVED' && !showResolveInput && (
              <button
                onClick={() => setShowResolveInput(true)}
                className="px-4 py-2 text-xs font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-400/20 transition"
              >
                Закрыть инцидент
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
