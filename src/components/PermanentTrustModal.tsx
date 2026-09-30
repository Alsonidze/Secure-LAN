import React, { useState } from 'react';
import { Device } from '../types';
import { X, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface PermanentTrustModalProps {
  device: Device;
  onClose: () => void;
  onConfirm: (deviceId: string, data: { name: string; deviceType: string; note: string }) => Promise<void>;
}

export const PermanentTrustModal: React.FC<PermanentTrustModalProps> = ({
  device,
  onClose,
  onConfirm
}) => {
  const [name, setName] = useState(device.name || '');
  const [deviceType, setDeviceType] = useState(device.device_type || 'Laptop');
  const [note, setNote] = useState('Авторизованное корпоративное оборудование');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deviceTypes = [
    'Desktop',
    'Laptop',
    'Smartphone',
    'Tablet',
    'Printer',
    'Smart TV',
    'Router',
    'IoT',
    'Workstation'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(device.id, { name, deviceType, note });
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
            <div className="p-2.5 bg-yellow-400/10 text-yellow-400 rounded-xl border border-yellow-400/20">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Регистрация доверенного узла</h3>
              <p className="text-xs text-slate-400">{device.ip_address} • {device.mac_address}</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Название устройства
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Рабочий ноутбук инженера"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Классификация типа
            </label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-yellow-400 transition"
            >
              {deviceTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Обоснование / примечание
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Сведения о владельце или назначении узла..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-yellow-400 transition"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <p>
              Устройство будет добавлено в белый список (TRUSTED). Все открытые инциденты, связанные с данным
              цифровым отпечатком, будут автоматически закрыты с фиксацией в журнале аудита.
            </p>
          </div>

          {/* Footer */}
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
              className="px-5 py-2 text-xs font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-400/20 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Сохранение...' : 'Зарегистрировать как доверенное'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
