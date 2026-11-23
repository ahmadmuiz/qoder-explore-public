import { useMemo, useRef, useState } from 'react';
import { formatCompactMoney, formatDate, formatMoney } from '../lib/format';

const TYPE_COLORS: Record<string, string> = {
  DUPLICATE_PAYMENT: '#B42318',
  AMOUNT_MISMATCH: '#D97706',
  MISSING_PAYMENT: '#0B5C4B',
  UNALLOCATED_PAYMENT: '#2563EB',
  NOMINAL_VARIANCE: '#7C3AED',
  ORPHAN_RECEIPT: '#64748B',
  DUPLICATE_RECEIPT: '#C2410C',
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#94A3B8';
}

export function ThroughputChart({
  data,
  height = 264,
}: {
  data: Array<{ date: string; ledgerValueMinor: number; matchedValueMinor: number; ledgerCount?: number }>;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const width = 780;
    const margins = { left: 58, right: 12, top: 16, bottom: 30 };
    const plotW = width - margins.left - margins.right;
    const plotH = height - margins.top - margins.bottom;
    const left = margins.left;
    const top = margins.top;
    const count = Math.max(1, data.length);
    const slot = plotW / count;
    const max = Math.max(1, ...data.map((point) => Math.max(point.ledgerValueMinor, point.matchedValueMinor)));
    const niceMax = max * 1.12;
    const x = (index: number) => left + slot * index + slot / 2;
    const y = (value: number) => top + plotH - (value / niceMax) * plotH;
    const barWidth = Math.max(2, slot * 0.44);
    const linePath = data
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.matchedValueMinor).toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L${x(count - 1).toFixed(1)},${(top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(top + plotH).toFixed(1)} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: niceMax * ratio,
      y: top + plotH - ratio * plotH,
    }));
    const labelEvery = Math.max(1, Math.ceil(count / 7));
    const labels = data
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index % labelEvery === 0 || index === data.length - 1)
      .map(({ point, index }) => ({ x: x(index), label: formatDate(point.date, { short: true }).replace(/\s\d{4}$/, '') }));
    return { width, left, top, plotH, plotW, slot, x, y, barWidth, linePath, areaPath, ticks, labels, niceMax };
  }, [data, height]);

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || data.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scale = geometry.width / rect.width;
    const localX = (event.clientX - rect.left) * scale;
    const index = Math.min(
      data.length - 1,
      Math.max(0, Math.floor((localX - geometry.left) / Math.max(0.001, geometry.slot))),
    );
    setHover(index);
  };

  const active = hover !== null ? data[hover] : null;
  const activeX = hover !== null ? (geometry.x(hover) / geometry.width) * 100 : 0;

  return (
    <div className="chart-wrap" ref={containerRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${geometry.width} ${height}`} className="chart-svg" preserveAspectRatio="none" role="img" aria-label="Reconciliation throughput">
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CFE3D8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#EAF3EC" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B5C4B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0B5C4B" stopOpacity="0" />
          </linearGradient>
        </defs>
        {geometry.ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={geometry.left} y1={tick.y} x2={geometry.width - 12} y2={tick.y} stroke="#E9E5D9" strokeWidth="1" />
            <text x={geometry.left - 10} y={tick.y + 4} textAnchor="end" className="chart-axis-label">
              {tick.value === 0 ? '0' : formatCompactMoney(tick.value).replace('Rp ', '')}
            </text>
          </g>
        ))}
        {data.map((point, index) => {
          const barHeight = Math.max(0, geometry.y(0) - geometry.y(point.ledgerValueMinor));
          return (
            <rect
              key={point.date}
              x={geometry.x(index) - geometry.barWidth / 2}
              y={geometry.y(point.ledgerValueMinor)}
              width={geometry.barWidth}
              height={barHeight}
              rx={Math.min(3, geometry.barWidth / 2)}
              fill="url(#barGradient)"
              opacity={hover === index ? 1 : 0.85}
            />
          );
        })}
        <path d={geometry.areaPath} fill="url(#areaGradient)" />
        <path d={geometry.linePath} fill="none" stroke="#0B5C4B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && active && (
          <g>
            <line x1={geometry.x(hover)} y1={geometry.top} x2={geometry.x(hover)} y2={geometry.top + geometry.plotH} stroke="#0B3D32" strokeDasharray="3 4" opacity="0.35" />
            <circle cx={geometry.x(hover)} cy={geometry.y(active.matchedValueMinor)} r="3.5" fill="#0B5C4B" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {geometry.labels.map((label) => (
          <text key={`${label.x}-${label.label}`} x={label.x} y={height - 8} textAnchor="middle" className="chart-axis-label">
            {label.label}
          </text>
        ))}
      </svg>
      {active && (
        <div className="chart-tooltip" style={{ left: `${Math.min(88, Math.max(12, activeX))}%` }}>
          <div className="chart-tooltip-date">{formatDate(active.date)}</div>
          <div className="chart-tooltip-row">
            <span className="legend-swatch" style={{ background: '#0B5C4B' }} />
            Matched value <strong>{formatMoney(active.matchedValueMinor)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span className="legend-swatch" style={{ background: '#CFE3D8' }} />
            Ledger value <strong>{formatMoney(active.ledgerValueMinor)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export function Donut({
  segments,
  size = 176,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color?: string; type?: string }>;
  size?: number;
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={centerLabel}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#F0EDE2" strokeWidth="17" />
        {total > 0 &&
          segments.map((segment) => {
            const length = (segment.value / total) * circumference;
            const dash = `${Math.max(0, length - 3)} ${circumference - Math.max(0, length - 3)}`;
            const circle = (
              <circle
                key={segment.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={segment.color ?? typeColor(segment.type ?? '')}
                strokeWidth="17"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
              />
            );
            offset += length;
            return circle;
          })}
      </svg>
      <div className="donut-center">
        <span className="donut-value">{centerValue}</span>
        <span className="donut-label">{centerLabel}</span>
      </div>
    </div>
  );
}

export function ProgressRing({
  value,
  size = 92,
  stroke = 8,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF0E5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0B5C4B"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="progress-ring-label">
        <strong>{value.toFixed(1)}%</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 108, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((value - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" stroke="#0B5C4B" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AgingBars({ data }: { data: Array<{ bucket: string; count: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="aging-bars">
      {data.map((item, index) => (
        <div className="aging-row" key={item.bucket}>
          <span className="aging-label">{item.bucket}</span>
          <div className="aging-track">
            <div
              className={`aging-fill aging-fill-${index}`}
              style={{ width: `${Math.max(item.count === 0 ? 2 : 10, (item.count / max) * 100)}%` }}
            />
          </div>
          <span className="aging-value">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function HorizontalBars({
  items,
}: {
  items: Array<{ label: string; sub?: string; value: number; color?: string }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="h-bars">
      {items.map((item) => (
        <div className="h-bar-row" key={item.label}>
          <div className="h-bar-meta">
            <span>{item.label}</span>
            {item.sub && <small>{item.sub}</small>}
          </div>
          <div className="h-bar-track">
            <div className="h-bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? '#0B5C4B' }} />
          </div>
          <span className="h-bar-value">{formatCompactMoney(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
