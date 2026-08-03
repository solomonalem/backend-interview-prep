import { cn } from '../../lib/cn';

// Linear progress / score bar. Color follows the value unless `tone` is set.
export function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number; // 0–100
  tone?: string; // tailwind bg-* override
  className?: string;
}) {
  const auto = value >= 70 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className={cn('h-2 w-full rounded-full bg-slate-100 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', tone ?? auto)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// Circular score ring (SVG) for headline numbers.
export function ScoreRing({ value, size = 96 }: { value: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  const color = value >= 70 ? '#10b981' : value >= 45 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f1f5f9" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold text-slate-800 tabular">{Math.round(value)}</span>
        <span className="text-[10px] text-slate-400 font-medium">/ 100</span>
      </div>
    </div>
  );
}
