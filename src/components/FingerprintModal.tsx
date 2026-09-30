import React from 'react';
import { Device } from '../types';
import { X, Fingerprint, Shield, Copy, Check, Info } from 'lucide-react';

interface FingerprintModalProps {
  device: Device | null;
  onClose: () => void;
}

export const FingerprintModal: React.FC<FingerprintModalProps> = ({ device, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  if (!device) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getConfidenceBadge = (conf: string) => {
    switch (conf) {
      case 'High':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Высокая (High)
          </span>
        );
      case 'Medium':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Средняя (Medium)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            Базовая (Low)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-yellow-400/10 text-yellow-400 rounded-xl border border-yellow-400/20">
              <Fingerprint size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Аналитический Device Fingerprint</h3>
              <p className="text-xs text-slate-400">Цифровой профиль узла: {device.name}</p>
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
        <div className="p-6 space-y-5 text-sm">
          {/* Scientific / Analytical Disclaimer */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex gap-3 text-xs text-slate-300">
            <Info className="text-yellow-400 shrink-0 mt-0.5" size={18} />
            <p>
              Цифровой отпечаток формируется на основе доступных сетевых атрибутов без агрессивного вмешательства.
              Он служит для устойчивой аналитической корреляции повторных появлений одного и того же узла в сети.
            </p>
          </div>

          {/* Short Code & Copy */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Идентификатор отпечатка (ID)</span>
              {getConfidenceBadge(device.confidence)}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xl font-bold text-yellow-400 tracking-wider">
                {device.fingerprint}
              </span>
              <button
                onClick={() => handleCopy(device.fingerprint)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
          </div>

          {/* Source Attributes Table */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Исходные атрибуты формирования хэша (SHA-256)
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl divide-y divide-slate-800/80 text-xs">
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">Аппаратный MAC-адрес:</span>
                <span className="font-mono text-white font-medium">{device.mac_address}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">Сетевое имя узла (Hostname):</span>
                <span className="text-slate-200">{device.hostname || 'Не объявлено'}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">Вендор сетевого адаптера (OUI):</span>
                <span className="text-slate-200">{device.manufacturer || 'Не определен'}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">Классифицированный тип:</span>
                <span className="text-slate-200">{device.device_type}</span>
              </div>
              <div className="p-2.5 flex justify-between">
                <span className="text-slate-400">Сетевой сегмент LAN:</span>
                <span className="font-mono text-slate-300">192.168.1.0/24</span>
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <div className="text-[11px] text-slate-500 text-right">
            Дата формирования профиля: {new Date(device.first_seen).toLocaleString('ru-RU')}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
