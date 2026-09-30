import React, { useState } from 'react';
import { Device } from '../types';
import { X, Clock, ShieldAlert } from 'lucide-react';

interface TemporaryAuthModalProps {
  device: Device;
  onClose: () => void;
  onConfirm: (deviceId: string, durationMinutes: number, note?: string) => Promise<void>;
}

export const TemporaryAuthModal: React.FC<TemporaryAuthModalProps> = ({
  device,
  onClose,
  onConfirm
}) => {
  const [selectedDuration, setSelectedDuration] = useState<number>(120); // default 2 hours
  const [customMinutes, setCustomMinutes] = useState<string>('180');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [note, setNote] = useState<string>('Гостевой доступ для рабочей встречи');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const presets = [
    { label: '30 минут', minutes: 30 },
    { label: '1 час', minutes: 60 },
    { label: '2 часа', minutes: 120 },
    { label: '8 часов', minutes: 480 },
    { label: 'До конца дня', minutes: 540 }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalMinutes = isCustom ? (parseInt(customMinutes, 10) || 60) : selectedDuration;
    setIsSubmitting(true);
    try {
      await onConfirm(device.id, finalMinutes, note);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Временная авторизация узла</h3>
              <p className="text-xs text-slate-400">{device.name} ({device.ip_address})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
              Срок действия разрешения
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {presets.map((p) => {
                const active = !isCustom && selectedDuration === p.minutes;
                return (
                  <button
                    type="button"
                    key={p.minutes}
                    onClick={() => {
                      setIsCustom(false);
                      setSelectedDuration(p.minutes);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition ${
                      active
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition ${
                  isCustom
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                Свой срок
              </button>
            </div>

            {isCustom && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="10080"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="w-32 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-amber-400"
                  placeholder="Минуты"
                />
                <span className="text-xs text-slate-400">минут</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Обоснование / примечание
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Укажите причину допуска устройства..."
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <span>
              По истечении заданного срока статус устройства автоматически вернётся в «Неизвестное» (UNKNOWN).
              Событие и факт авторизации сохранятся в журнале аудита.
            </span>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-black bg-amber-400 hover:bg-amber-300 rounded-xl shadow-lg shadow-amber-400/20 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Авторизация...' : 'Предоставить доступ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
