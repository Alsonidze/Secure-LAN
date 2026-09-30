import React, { useState, useMemo } from 'react';
import { Device, formatTime } from '../types';
import { Router } from 'lucide-react';

interface NetworkRadarProps {
  devices: Device[];
  onSelectDevice?: (device: Device) => void;
  newDeviceId?: string | null;
  size?: number;
  isCompact?: boolean;
}

// Deterministic positioning with collision avoidance
function computeDeterministicNodes(devices: Device[], center: number, maxRadius: number) {
  const nodes: { device: Device; x: number; y: number; angle: number; radius: number }[] = [];

  for (let i = 0; i < devices.length; i++) {
    const d = devices[i];
    const seed = (d.mac_address || d.fingerprint || d.id).replace(/[^0-9A-Fa-f]/g, '');
    let hash = 0;
    for (let c = 0; c < seed.length; c++) {
      hash = (hash << 5) - hash + seed.charCodeAt(c);
      hash |= 0;
    }
    const absHash = Math.abs(hash);

    let angle = ((absHash % 340) + 10) * (Math.PI / 180);
    let radiusRatio = 0.28 + ((absHash >> 3) % 58) / 100;
    let radius = maxRadius * radiusRatio;

    // Collision avoidance with already placed nodes
    let attempts = 0;
    while (attempts < 12) {
      const candidateX = center + radius * Math.cos(angle);
      const candidateY = center + radius * Math.sin(angle);

      const tooClose = nodes.some(n => {
        const dx = n.x - candidateX;
        const dy = n.y - candidateY;
        return Math.sqrt(dx * dx + dy * dy) < 32;
      });

      if (!tooClose) {
        break;
      }

      // Slightly adjust angle and radius
      angle += 0.35;
      radiusRatio = 0.28 + ((radiusRatio * 100 + 17) % 58) / 100;
      radius = maxRadius * radiusRatio;
      attempts++;
    }

    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);

    nodes.push({ device: d, x, y, angle, radius });
  }

  return nodes;
}

export const NetworkRadar: React.FC<NetworkRadarProps> = ({
  devices,
  onSelectDevice,
  newDeviceId,
  size = 600,
  isCompact = false
}) => {
  const [hoveredDev, setHoveredDev] = useState<Device | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const radarSize = size;
  const center = radarSize / 2;
  const maxRadius = center - 40;

  const placedNodes = useMemo(() => {
    return computeDeterministicNodes(devices, center, maxRadius);
  }, [devices, center, maxRadius]);

  const rings = [0.25, 0.5, 0.75, 1.0];

  const getNodeColor = (d: Device) => {
    if (d.is_online === 0) return '#6E7681'; // Gray offline
    if (d.trust_status === 'TRUSTED') return '#3FB950'; // Green trusted
    if (d.trust_status === 'TEMPORARY') return '#D29922'; // Amber temporary
    if (d.trust_status === 'UNKNOWN') return '#F85149'; // Red unknown
    if (d.trust_status === 'REVOKED') return '#F85149'; // Red revoked
    return '#A7B0BD';
  };

  const getStatusLabel = (d: Device) => {
    if (d.is_online === 0) return 'Не в сети';
    if (d.trust_status === 'TRUSTED') return 'Доверенное';
    if (d.trust_status === 'TEMPORARY') return 'Временный доступ';
    if (d.trust_status === 'UNKNOWN') return 'Неизвестное';
    if (d.trust_status === 'REVOKED') return 'Доверие отозвано';
    return 'Не определено';
  };

  return (
    <div className="relative w-full flex flex-col items-center select-none">
      {/* Responsive Aspect-Ratio SVG Radar Container */}
      <div className="relative w-full max-w-[560px] aspect-square">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width="100%"
          height="100%"
          className="overflow-visible block"
        >
          {/* Base Radar Surface */}
          <circle
            cx={center}
            cy={center}
            r={maxRadius}
            fill="#10151D"
            stroke="#2B3441"
            strokeWidth="1.5"
          />

          {/* Concentric rings */}
          {rings.map((ratio, idx) => (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={maxRadius * ratio}
              fill="none"
              stroke="#2B3441"
              strokeWidth="1"
              strokeDasharray={ratio === 1.0 ? 'none' : '4 4'}
            />
          ))}

          {/* Cardinal Crosshair lines */}
          <line
            x1={center - maxRadius}
            y1={center}
            x2={center + maxRadius}
            y2={center}
            stroke="#2B3441"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1={center}
            y1={center - maxRadius}
            x2={center}
            y2={center + maxRadius}
            stroke="#2B3441"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Single Thin Rotating Sweep Line */}
          <g
            style={{
              transformOrigin: `${center}px ${center}px`,
              animation: 'radarSweep 7s linear infinite'
            }}
          >
            <line
              x1={center}
              y1={center}
              x2={center + maxRadius}
              y2={center}
              stroke="#4C82F7"
              strokeWidth="1.5"
              strokeOpacity="0.4"
            />
          </g>

          {/* Center Gateway Router Node */}
          <circle
            cx={center}
            cy={center}
            r={16}
            fill="#151B23"
            stroke="#2B3441"
            strokeWidth="1.5"
          />

          {/* Device Nodes */}
          {placedNodes.map(({ device: d, x, y }) => {
            const color = getNodeColor(d);
            const isHovered = hoveredDev?.id === d.id;
            const isNew = d.id === newDeviceId;
            const isRevoked = d.trust_status === 'REVOKED';

            return (
              <g
                key={d.id}
                className="cursor-pointer"
                onClick={() => onSelectDevice?.(d)}
                tabIndex={0}
                role="button"
                aria-label={`Устройство ${d.name}, статус: ${getStatusLabel(d)}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDevice?.(d);
                  }
                }}
                onMouseEnter={(e) => {
                  setHoveredDev(d);
                  const svgEl = e.currentTarget.closest('svg');
                  if (svgEl) {
                    const rect = svgEl.getBoundingClientRect();
                    const scaleX = rect.width / size;
                    const scaleY = rect.height / size;
                    setTooltipCoords({ x: x * scaleX, y: y * scaleY });
                  }
                }}
                onMouseLeave={() => setHoveredDev(null)}
              >
                {/* Single non-infinite ripple on freshly added unknown device */}
                {isNew && (
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill="none"
                    stroke="#F85149"
                    strokeWidth="1.5"
                    className="animate-single-ripple"
                  />
                )}

                {/* Node Target hit area */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 12 : 8}
                  fill={isHovered ? '#1B222C' : 'transparent'}
                  stroke={isHovered ? '#3A4656' : 'transparent'}
                  strokeWidth="1"
                />

                {/* Main Node Point */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5.5 : 4.5}
                  fill={isRevoked ? '#10151D' : color}
                  stroke={isRevoked ? '#F85149' : '#0D1117'}
                  strokeWidth={isRevoked ? 2 : 1.5}
                />

                {/* Node Label */}
                <text
                  x={x}
                  y={y + 14}
                  textAnchor="middle"
                  fill={isHovered ? '#F0F3F6' : '#A7B0BD'}
                  fontSize="11"
                  className="pointer-events-none font-medium select-none"
                >
                  {d.name.length > 15 ? d.name.slice(0, 14) + '…' : d.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Center Router Icon */}
        <div
          className="absolute pointer-events-none flex items-center justify-center text-[#A7B0BD]"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 20
          }}
        >
          <Router size={14} />
        </div>

        {/* Solid Flat Tooltip without blur or glow */}
        {hoveredDev && (
          <div
            className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 bg-[#1B222C] border border-[#2B3441] rounded-[8px] p-3 text-xs w-60 shadow-lg"
            style={{
              left: tooltipCoords.x,
              top: tooltipCoords.y - 6
            }}
          >
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#2B3441]">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: getNodeColor(hoveredDev),
                  border: hoveredDev.trust_status === 'REVOKED' ? '1.5px solid #F85149' : 'none'
                }}
              />
              <span className="font-semibold text-[#F0F3F6] truncate">{hoveredDev.name}</span>
            </div>

            <div className="space-y-1 text-[#A7B0BD] text-[11px]">
              <div className="flex justify-between">
                <span>IP:</span>
                <span className="font-mono text-[#F0F3F6]">{hoveredDev.ip_address}</span>
              </div>
              <div className="flex justify-between">
                <span>MAC:</span>
                <span className="font-mono text-[#F0F3F6]">{hoveredDev.mac_address}</span>
              </div>
              <div className="flex justify-between">
                <span>Статус:</span>
                <span className="font-medium text-[#F0F3F6]">{getStatusLabel(hoveredDev)}</span>
              </div>
              <div className="flex justify-between">
                <span>Тип:</span>
                <span>{hoveredDev.device_type}</span>
              </div>
              <div className="flex justify-between">
                <span>Активность:</span>
                <span>{formatTime(hoveredDev.last_seen)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#2B3441] text-[10px]">
                <span>Отпечаток:</span>
                <span className="font-mono text-[#F0F3F6]">{hoveredDev.fingerprint}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Flat Radar Legend */}
      <div className="flex flex-wrap items-center justify-center gap-5 mt-4 py-2 px-4 rounded-[8px] bg-[#151B23] border border-[#2B3441] text-xs text-[#A7B0BD]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3FB950]" />
          <span>Доверенное ({devices.filter(d => d.trust_status === 'TRUSTED' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D29922]" />
          <span>Временный доступ ({devices.filter(d => d.trust_status === 'TEMPORARY' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F85149]" />
          <span>Неизвестное ({devices.filter(d => d.trust_status === 'UNKNOWN' && d.is_online === 1).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6E7681]" />
          <span>Не в сети ({devices.filter(d => d.is_online === 0).length})</span>
        </div>
      </div>

      <style>{`
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
