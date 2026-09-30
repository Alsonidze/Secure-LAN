import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Settings as SettingsIcon, Save, Radio, Shield, Download,
  RotateCcw, Check, AlertTriangle, Database, Info, FileSpreadsheet
} from 'lucide-react';

interface SettingsViewProps {
  onSettingsSaved: () => void;
  onResetDemo: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onSettingsSaved,
  onResetDemo
}) => {
  const [networkMode, setNetworkMode] = useState<'demo' | 'live'>('demo');
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [autoScanInterval, setAutoScanInterval] = useState('60');
  const [createIncidentOnUnknown, setCreateIncidentOnUnknown] = useState(true);
  const [incidentSeverityDefault, setIncidentSeverityDefault] = useState('MEDIUM');
  const [appName, setAppName] = useState('Secure LAN');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.getSettings();
        if (res.success && res.settings) {
          const s = res.settings;
          if (s.network_mode) setNetworkMode(s.network_mode as any);
          if (s.auto_scan_enabled) setAutoScanEnabled(s.auto_scan_enabled === 'true');
          if (s.auto_scan_interval) setAutoScanInterval(s.auto_scan_interval);
          if (s.create_incident_on_unknown) setCreateIncidentOnUnknown(s.create_incident_on_unknown === 'true');
          if (s.incident_severity_default) setIncidentSeverityDefault(s.incident_severity_default);
          if (s.app_name) setAppName(s.app_name);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({
        network_mode: networkMode,
        auto_scan_enabled: String(autoScanEnabled),
        auto_scan_interval: autoScanInterval,
        create_incident_on_unknown: String(createIncidentOnUnknown),
        incident_severity_default: incidentSeverityDefault,
        app_name: appName
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      onSettingsSaved();
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <SettingsIcon className="text-yellow-400" />
            Параметры и конфигурация системы
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Управление режимом сканирования, чувствительностью правил обнаружения и экспортом данных
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">
            <Check size={14} />
            <span>Параметры сохранены</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Network Mode Card */}
        <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Radio size={18} className="text-yellow-400" />
            Режим мониторинга сети (Network Environment)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Demo Mode Option */}
            <div
              onClick={() => setNetworkMode('demo')}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                networkMode === 'demo'
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Демонстрационная среда (Demo)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Полноценный встроенный симулятор локальной сети. Идеально для защиты курсового проекта:
                  позволяет инжектировать неизвестные узлы и воспроизводить весь жизненный цикл инцидента.
                </p>
              </div>
              <div className="text-[11px] font-semibold text-amber-300 mt-3">
                {networkMode === 'demo' ? '✓ Активный режим' : 'Выбрать'}
              </div>
            </div>

            {/* Live Mode Option */}
            <div
              onClick={() => setNetworkMode('live')}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                networkMode === 'live'
                  ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Реальная сеть (Live Mode)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Пассивное обнаружение доступных узлов через сетевые интерфейсы ОС и системную ARP-таблицу.
                  Безопасный неатакующий сбор информации.
                </p>
              </div>
              <div className="text-[11px] font-semibold text-cyan-300 mt-3">
                {networkMode === 'live' ? '✓ Активный режим' : 'Выбрать'}
              </div>
            </div>
          </div>
        </div>

        {/* Scanning & Incident Configuration */}
        <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-5">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Shield size={18} className="text-yellow-400" />
            Параметры обнаружения и анализа
          </h3>

          <div className="space-y-4 text-xs">
            {/* Auto scan toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div>
                <div className="font-semibold text-white">Автоматическое периодическое сканирование</div>
                <div className="text-slate-400 mt-0.5">Периодический опрос сегмента и проверка истечения временных доступов</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScanEnabled}
                  onChange={(e) => setAutoScanEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400" />
              </label>
            </div>

            {/* Scan Interval */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div>
                <div className="font-semibold text-white">Интервал автосканирования</div>
                <div className="text-slate-400 mt-0.5">Частота циклов опроса сети</div>
              </div>
              <select
                value={autoScanInterval}
                onChange={(e) => setAutoScanInterval(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="30">30 секунд</option>
                <option value="60">1 минута</option>
                <option value="300">5 минут</option>
                <option value="600">10 минут</option>
              </select>
            </div>

            {/* Auto-create incident toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div>
                <div className="font-semibold text-white">Создавать инцидент при фиксации неизвестного узла</div>
                <div className="text-slate-400 mt-0.5">Автоматическая генерация аналитического заключения с доказательствами</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={createIncidentOnUnknown}
                  onChange={(e) => setCreateIncidentOnUnknown(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400" />
              </label>
            </div>

            {/* Severity Default */}
            <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
              <div>
                <div className="font-semibold text-white">Базовый уровень важности инцидента</div>
                <div className="text-slate-400 mt-0.5">Присваивается вновь обнаруженным узлам без белого списка</div>
              </div>
              <select
                value={incidentSeverityDefault}
                onChange={(e) => setIncidentSeverityDefault(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="LOW">LOW (Низкий)</option>
                <option value="MEDIUM">MEDIUM (Средний - рекомендуемый)</option>
                <option value="HIGH">HIGH (Высокий)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl shadow-lg shadow-yellow-400/20 transition disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? 'Сохранение...' : 'Сохранить настройки'}</span>
            </button>
          </div>
        </div>

        {/* Data Export Card */}
        <div className="bg-[#0f141f] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-yellow-400" />
            Экспорт оперативных данных (CSV)
          </h3>
          <p className="text-xs text-slate-400">
            Формирование отчётов с поддержкой кириллицы (UTF-8 BOM) для открытия в Excel и аналитических системах:
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/export/devices"
              download
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-yellow-400/60 text-slate-200 hover:text-white text-xs font-semibold transition"
            >
              <Download size={14} />
              <span>Экспорт реестра устройств (.csv)</span>
            </a>

            <a
              href="/api/export/audit"
              download
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-yellow-400/60 text-slate-200 hover:text-white text-xs font-semibold transition"
            >
              <Download size={14} />
              <span>Экспорт журнала аудита (.csv)</span>
            </a>

            <a
              href="/api/export/events"
              download
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-yellow-400/60 text-slate-200 hover:text-white text-xs font-semibold transition"
            >
              <Download size={14} />
              <span>Экспорт системных событий (.csv)</span>
            </a>
          </div>
        </div>

        {/* Danger Zone: Demo Reset */}
        <div className="bg-[#0f141f] border border-rose-500/20 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-rose-400 text-base flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            Сброс демонстрационного окружения
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Сбрасывает базу данных к исходному состоянию (5 доверенных узлов, 0 неизвестных устройств, 0 открытых инцидентов).
            Используется для подготовки перед демонстрацией комиссии.
          </p>

          <button
            type="button"
            onClick={onResetDemo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition"
          >
            <RotateCcw size={14} />
            <span>Сбросить демонстрационные данные</span>
          </button>
        </div>

        {/* Course Project Meta Info */}
        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl text-xs text-slate-400 space-y-1">
          <div className="font-bold text-white text-sm">Secure LAN (LAN Sentinel) • Версия 1.0.0</div>
          <div>Курсовой проект: «Информационно-аналитическая система обнаружения и анализа несанкционированных устройств в локальной сети»</div>
          <div className="text-[11px] text-slate-500 pt-1">
            Архитектура: React / TypeScript / Tailwind CSS / Express REST API / Persistent SQLite (sql.js)
          </div>
        </div>
      </form>
    </div>
  );
};
