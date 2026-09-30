import React, { useState } from 'react';
import { Radio, AlertOctagon, RotateCcw, Clock, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface DemoControlsBannerProps {
  onSimulateUnknown: () => Promise<void>;
  onExpireTemporary: () => Promise<void>;
  onResetDemo: () => void;
  isSimulating: boolean;
}

export const DemoControlsBanner: React.FC<DemoControlsBannerProps> = ({
  onSimulateUnknown,
  onExpireTemporary,
  onResetDemo,
  isSimulating
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="fixed bottom-4 right-4 z-30 max-w-lg shadow-2xl transition-all select-none">
      <div className="bg-[#0f141f]/95 backdrop-blur-md border border-amber-500/40 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.15)]">
        {/* Toggle Bar */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-400" />
              Панель демонстрации (Demo Controls)
            </span>
          </div>
          <button className="text-amber-400/80 hover:text-amber-300">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>

        {/* Action Buttons */}
        {isExpanded && (
          <div className="p-3.5 space-y-2.5">
            <p className="text-[11px] text-slate-400 leading-tight">
              Инструменты быстрого воспроизведения сценариев для демонстрации перед преподавателем:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onSimulateUnknown}
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition disabled:opacity-50"
              >
                <Radio size={13} className={isSimulating ? 'animate-ping' : ''} />
                <span>Симуляция неизвестного узла</span>
              </button>

              <button
                onClick={onExpireTemporary}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition"
              >
                <Clock size={13} />
                <span>Истечение временного доступа</span>
              </button>

              <button
                onClick={onResetDemo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                <RotateCcw size={13} />
                <span>Сброс демо</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
