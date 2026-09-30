import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen?: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen = true,
  title,
  message,
  confirmLabel = 'Подтвердить',
  confirmVariant = 'danger',
  onClose,
  onConfirm
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const getButtonStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20';
      default:
        return 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f141f] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="font-bold text-white text-base leading-snug">{title}</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-5 py-2 text-xs font-bold rounded-xl shadow-lg transition disabled:opacity-50 ${getButtonStyles()}`}
          >
            {loading ? 'Обработка...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
