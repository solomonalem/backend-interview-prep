import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// StatCard — a headline metric with an icon chip.
export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'brand',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'sky';
}) {
  const chip = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
  }[tone];
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-800 tabular">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <span className={cn('h-10 w-10 rounded-lg flex items-center justify-center', chip)}>
          {icon}
        </span>
      </div>
    </div>
  );
}

// PageHeader — consistent title block for every screen.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <span className="h-12 w-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        {icon}
      </span>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400 max-w-xs">{hint}</p>}
    </div>
  );
}
