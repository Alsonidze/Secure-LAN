import React, { useState, useMemo } from 'react';
import { Device } from '../types';
import { ShieldCheck, Clock, AlertTriangle, WifiOff, Router, ShieldAlert } from 'lucide-react';

interface NetworkRadarProps {
  devices: Device[];
  onSelectDevice?: (device: Device) => void;
  size?: number; // default 540
  isCompact?: boolean;
}

// Stable deterministic hash function so device positions stay exactly the same on re-renders
function getStableCoordinates(device: Device, center: number, maxRadius: number) {
  const seedStr = (device.mac_address || device.fingerprint || device.id).replace(/[^0-9A-Fa-f]/g, '');
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  // Deterministic angle from 0 to 2*PI (avoid exact 0, 90, 180, 270 to not collide directly with crosshairs)
  const angle = ((absHash % 350) + 5) * (Math.PI / 180);

  // Deterministic radius: keep inside inner safe zone 28% to 88% of maxRadius
  const radiusPercent = 0.28 + ((absHash >> 4) % 60) / 100;
  const radius = maxRadius * radiusPercent;

  const x = center + radius * Math.cos(angle);
  const y = center + radius * Math.sin(angle);

  return { x, y, angle, radius };
}

export const NetworkRadar: React.FC<NetworkRadarProps> = ({
  devices,
  onSelectDevice,
  size = 540,
  isCompact = false
}) => {
  const [hoveredDev, setHoveredDev] = useState<Device | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const center = size / 2;
  const maxRadius = center - 36;

  // Compute node positions once per device list
  const placedNodes = useMemo(() => {
    return devices.map(d => {
      const coords = getStableCoordinates(d, center, maxRadius);
      return {
        device: d,
        ...coords
      };
    });
  }, [devices, center, maxRadius]);

  const rings = [0.25, 0.5, 0.75, 1.0];

  const getNodeColor = (d: Device) => {
    if (d.is_online === 0) return '#64748b'; // Gray for offline
    if (d.trust_status === 'TRUSTED') return '#10b981'; // Green for trusted
    if (d.trust_status === 'TEMPORARY') return '#f59e0b'; // Amber for temporary
    if (d.trust_status === 'UNKNOWN') return '#ef4444'; // Red for unknown / incident
    return '#94a3b8';
  };

  const getStatusLabel = (d: Device) => {
    if (d.is_online === 0) return 'Не в сети (Offline)';
    if (d.trust_status === 'TRUSTED') return 'Доверенное (Trusted)';
    if (d.trust_status === 'TEMPORARY') return 'Временный доступ';
    if (d.trust_status === 'UNKNOWN') return 'Неизвестное (Unknown)';
    return 'Отозвано (Revoked)';
  };

  return (
    <div className="relative flex flex-col items-center justify-center select-none overflow-hidden">
      {/* Radar SVG Container */}
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full overflow-visible drop-shadow-[0_0_35px_rgba(234,179,8,0.08)]"
        >
          <defs>
            {/* Radar sweep radial gradient trail */}
            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#eab308" stopOpacity="0.12" />
              <stop offset="70%" stopColor="#eab308" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#090b10" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="sweepBeam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#eab308" stopOpacity="0.75" />
              <stop offset="60%" stopColor="#eab308" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
            </linearGradient>

            {/* Red pulsing glow for unknown devices */}
            <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Amber glow for temporary */}
            <filter id="amberGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background circular radar base */}
          <circle
            cx={center}
            cy={center}
            r={maxRadius}
            fill="#0b0e14"
            stroke="#1e293b"
            strokeWidth="1.5"
          />

          {/* Radar background ambient glow */}
          <circle
            cx={center}
            cy={center}
            r={maxRadius}
            fill="url(#radarGlow)"
          />

          {/* Concentric distance rings */}
          {rings.map((ratio, idx) => {
            const r = maxRadius * ratio;
            return (
              <g key={idx}>
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray={ratio === 1.0 ? 'none' : '3 4'}
                  opacity={0.65}
                />
                {!isCompact && (
                  <text
                    x={center + 6}
                    y={center - r + 13}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    opacity={0.8}
                  >
                    R{idx + 1} • {Math.round(ratio * 100)}%
                  </text>
                )}
              </g>
            );
          })}

          {/* Cardinal Crosshairs */}
          <line
            x1={center - maxRadius}
            y1={center}
            x2={center + maxRadius}
            y2={center}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.6}
          />
          <line
            x1={center}
            y1={center - maxRadius}
            x2={center}
            y2={center + maxRadius}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.6}
          />

          {/* Diagonal guidelines */}
          <line
            x1={center - maxRadius * 0.707}
            y1={center - maxRadius * 0.707}
            x2={center + maxRadius * 0.707}
            y2={center + maxRadius * 0.707}
            stroke="#1e293b"
            strokeWidth="1"
            opacity={0.5}
          />
          <line
            x1={center - maxRadius * 0.707}
            y1={center + maxRadius * 0.707}
            x2={center + maxRadius * 0.707}
            y2={center - maxRadius * 0.707}
            stroke="#1e293b"
            strokeWidth="1"
            opacity={0.5}
          />

          {/* Rotating Radar Sweep Animation */}
          <g
            style={{
              transformOrigin: `${center}px ${center}px`,
              animation: 'radarSweep 5.5s linear infinite'
            }}
          >
            {/* Sweep sector gradient */}
            <path
              d={`M ${center} ${center} L ${center + maxRadius} ${center} A ${maxRadius} ${maxRadius} 0 0 0 ${center + maxRadius * 0.866} ${center - maxRadius * 0.5} Z`}
              fill="url(#sweepBeam)"
              opacity={0.3}
            />
            {/* Sharp leading scanner beam line */}
            <line
              x1={center}
              y1={center}
              x2={center + maxRadius}
              y2={center}
              stroke="#eab308"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.9}
            />
          </g>

          {/* Center Gateway / Router Node */}
          <circle
            cx={center}
            cy={center}
            r={18}
            fill="#0f172a"
            stroke="#eab308"
            strokeWidth="2"
            className="drop-shadow-[0_0_12px_rgba(234,179,8,0.4)]"
          />
          <circle
            cx={center}
            cy={center}
            r={24}
            fill="none"
            stroke="#eab308"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity={0.6}
            style={{
              transformOrigin: `${center}px ${center}px`,
              animation: 'spin 12s linear infinite'
            }}
          />

          {/* Device Nodes */}
          {placedNodes.map(({ device: d, x, y }) => {
            const color = getNodeColor(d);
            const isUnknown = d.trust_status === 'UNKNOWN' && d.is_online === 1;
            const isTemporary = d.trust_status === 'TEMPORARY' && d.is_online === 1;
            const isHovered = hoveredDev?.id === d.id;

            return (
              <g
                key={d.id}
                className="cursor-pointer transition-transform duration-200"
                onClick={() => onSelectDevice?.(d)}
                onMouseEnter={(e) => {
                  setHoveredDev(d);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltipPos({ x: x, y: y });
                }}
                onMouseLeave={() => setHoveredDev(null)}
              >
                {/* Ping wave for unknown device */}
                {isUnknown && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r="16"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      opacity="0.8"
                      className="animate-ping"
                      style={{ animationDuration: '2s' }}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="24"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1"
                      opacity="0.4"
                      className="animate-pulse"
                    />
                  </>
                )}

                {/* Subtle amber pulsing ring for temporary access */}
                {isTemporary && (
                  <circle
                    cx={x}
                    cy={y}
                    r="14"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                    className="animate-spin"
                    style={{ animationDuration: '6s', transformOrigin: `${x}px ${y}px` }}
                  />
                )}

                {/* Outer halo */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 12 : 9}
                  fill={color}
                  fillOpacity={isHovered ? 0.4 : 0.2}
                  className="transition-all duration-200"
                />

                {/* Core dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 5}
                  fill={color}
                  stroke="#090b10"
                  strokeWidth="1.5"
                  className="transition-all duration-200"
                  filter={isUnknown ? 'url(#redGlow)' : isTemporary ? 'url(#amberGlow)' : undefined}
                />

                {/* Node label */}
                {!isCompact && (
                  <text
                    x={x}
                    y={y + 16}
                    textAnchor="middle"
                    fill={isHovered ? '#ffffff' : '#94a3b8'}
                    fontSize="10"
                    fontWeight={isHovered ? '600' : '400'}
                    className="pointer-events-none transition-colors"
                  >
                    {d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Center Gateway Icon overlay */}
        <div
          className="absolute pointer-events-none flex items-center justify-center text-amber-400"
          style={{
            top: center - 12,
            left: center - 12,
            width: 24,
            height: 24
          }}
        >
          <Router size={16} />
        </div>

        {/* Interactive Hover Tooltip */}
        {hoveredDev && (
          <div
            className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs w-60 transition-all duration-150"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y - 8
            }}
          >
            <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-800">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getNodeColor(hoveredDev) }}
              />
              <span className="font-semibold text-white truncate">{hoveredDev.name}</span>
            </div>

            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">IP:</span>
                <span className="font-mono text-white">{hoveredDev.ip_address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">MAC:</span>
                <span className="font-mono text-slate-300">{hoveredDev.mac_address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Статус:</span>
                <span className="font-medium text-amber-300">{getStatusLabel(hoveredDev)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Тип:</span>
                <span>{hoveredDev.device_type}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                <span>Fingerprint:</span>
                <span className="font-mono text-yellow-400">{hoveredDev.fingerprint}</span>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-center text-slate-400 bg-slate-900/60 py-0.5 rounded border border-slate-800">
              Нажмите для подробного анализа
            </div>
          </div>
        )}
      </div>

      {/* Radar Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-4 py-2 px-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-slate-300">Доверенное ({devices.filter(d => d.trust_status === 'TRUSTED' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
          <span className="text-slate-300">Временный доступ ({devices.filter(d => d.trust_status === 'TEMPORARY' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
          <span className="text-rose-400 font-medium">Неизвестное ({devices.filter(d => d.trust_status === 'UNKNOWN' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <span className="text-slate-400">Не в сети ({devices.filter(d => d.is_online === 0).length})</span>
        </div>
      </div>

      {/* Inline styles for custom radar animation */}
      <style>{`
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
