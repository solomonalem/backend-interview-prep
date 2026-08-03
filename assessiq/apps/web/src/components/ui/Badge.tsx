import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'slate' | 'brand' | 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';

const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Domain mappings ──────────────────────────────────────────────────────────
export const difficultyTone: Record<string, Tone> = {
  junior: 'emerald',
  mid: 'sky',
  senior: 'amber',
  staff: 'rose',
};

export const verdictTone: Record<string, Tone> = {
  Strong_Senior: 'emerald',
  Approaching_Senior: 'sky',
  Mid_Level: 'amber',
  Junior: 'rose',
};

export function verdictLabel(v: string): string {
  return v.replace(/_/g, ' ');
}
