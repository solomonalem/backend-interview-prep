import { useState } from 'react';
import { Flag, PenLine, Trash2, UserCheck, X } from 'lucide-react';
import type { OverrideFlag, ReportScore, SetScoreOverrideRequest } from '@assessiq/types';
import { Badge, Button, Input, Label, Spinner, Textarea } from './ui';
import { cn } from '../lib/cn';

// The four rubric components, in the order the report already shows them.
const COMPONENTS = [
  { key: 'senior_signal_pct', label: 'Senior signal', weight: '35%' },
  { key: 'core_pct', label: 'Core', weight: '25%' },
  { key: 'trap_pct', label: 'Trap', weight: '25%' },
  { key: 'evidence_pct', label: 'Evidence', weight: '15%' },
] as const;

type ComponentKey = (typeof COMPONENTS)[number]['key'];

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The standing record of an override. Deliberately states the AI's number as
 * well as the new one: the point of an override is that a human disagreed with
 * a specific machine judgement, which is unreadable if the machine's judgement
 * is gone.
 */
export function OverrideBanner({ score }: { score: ReportScore }) {
  const o = score.override;
  if (!o) return null;

  const changed = COMPONENTS.filter((c) => o[c.key] != null).map(
    (c) => `${c.label.toLowerCase()} ${score[c.key]}% → ${o[c.key]}%`,
  );

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        o.flag === 'adjusted'
          ? 'border-violet-200 bg-violet-50/60'
          : 'border-amber-200 bg-amber-50/60',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 shrink-0',
            o.flag === 'adjusted' ? 'text-violet-600' : 'text-amber-600',
          )}
        >
          {o.flag === 'adjusted' ? <UserCheck size={18} /> : <Flag size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            {o.total_pct != null ? (
              <>
                AI scored {score.total_pct}% · overridden to {o.total_pct}%
              </>
            ) : (
              <>AI scored {score.total_pct}% · flagged as disagreed</>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            by {o.by ?? 'an interviewer'} · {fmtWhen(o.at)}
            {o.total_pct == null && ' · no corrected score given, the AI score stands'}
          </p>
          {changed.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-500">Components: {changed.join(' · ')}</p>
          )}
          <p className="mt-2 max-w-[95ch] text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {o.note}
          </p>
          <p className="mt-2 text-[11px] text-slate-400">
            The AI's original score, components and reasoning are kept below, unchanged.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Override editor for one question. Owns its own form state; the parent owns
 * the request and the resulting report. Blank number fields mean "leave the
 * AI's value alone" rather than zero — that distinction is the whole reason
 * these are strings rather than numbers.
 */
export function ScoreOverrideEditor({
  score,
  onSave,
  onClear,
}: {
  score: ReportScore;
  onSave: (body: SetScoreOverrideRequest) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const existing = score.override;
  const [open, setOpen] = useState(false);
  const [flag, setFlag] = useState<OverrideFlag>(existing?.flag ?? 'adjusted');
  const [total, setTotal] = useState(existing?.total_pct?.toString() ?? '');
  const [parts, setParts] = useState<Record<ComponentKey, string>>(() => ({
    senior_signal_pct: existing?.senior_signal_pct?.toString() ?? '',
    core_pct: existing?.core_pct?.toString() ?? '',
    trap_pct: existing?.trap_pct?.toString() ?? '',
    evidence_pct: existing?.evidence_pct?.toString() ?? '',
  }));
  const [showParts, setShowParts] = useState(
    !!existing && COMPONENTS.some((c) => existing[c.key] != null),
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const num = (v: string): number | undefined => {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  };

  const numbers: SetScoreOverrideRequest = {
    flag,
    note,
    ...(num(total) !== undefined ? { total_pct: num(total) } : {}),
    ...COMPONENTS.reduce((acc, c) => {
      const n = num(parts[c.key]);
      return n === undefined ? acc : { ...acc, [c.key]: n };
    }, {}),
  };

  const hasNumbers =
    numbers.total_pct !== undefined || COMPONENTS.some((c) => numbers[c.key] !== undefined);
  const inRange = [numbers.total_pct, ...COMPONENTS.map((c) => numbers[c.key])]
    .filter((n): n is number => n !== undefined)
    .every((n) => n >= 0 && n <= 100);

  // Mirrors the server's rule: 'adjusted' claims a correction so it must carry
  // one; 'disagree' is valid on its own.
  const canSave =
    note.trim().length > 0 && inRange && (flag === 'disagree' || hasNumbers) && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy('save');
    setError(null);
    try {
      await onSave({ ...numbers, note: note.trim() });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the override.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    setError(null);
    try {
      await onClear();
      setOpen(false);
      setFlag('adjusted');
      setTotal('');
      setParts({ senior_signal_pct: '', core_pct: '', trap_pct: '', evidence_pct: '' });
      setShowParts(false);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the override.');
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <PenLine size={15} />
          {existing ? 'Edit override' : 'Override or flag this score'}
        </Button>
        {existing && (
          <Button variant="secondary" onClick={clear} disabled={busy !== null}>
            {busy === 'clear' ? <Spinner /> : <Trash2 size={15} />}
            Remove override
          </Button>
        )}
        {!existing && (
          <span className="text-xs text-slate-400">
            Disagree with this score? Correct it or flag it — the AI's score is kept either way.
          </span>
        )}
        {error && (
          <p className="w-full text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Your judgement on this score</p>
          <p className="mt-0.5 text-xs text-slate-500">
            The AI scored this {score.total_pct}%. Whatever you record here is stored beside that,
            never over it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['adjusted', 'Correct the score', 'I have a better number'],
            ['disagree', 'Flag as disagreed', "I don't accept it, no number"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFlag(value)}
            aria-pressed={flag === value}
            className={cn(
              'rounded-lg border px-3.5 py-2 text-left transition-colors',
              flag === value
                ? 'border-brand-300 bg-brand-soft'
                : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            <span
              className={cn(
                'block text-sm font-medium',
                flag === value ? 'text-brand-700' : 'text-slate-700',
              )}
            >
              {label}
            </span>
            <span className="block text-[11px] text-slate-400">{hint}</span>
          </button>
        ))}
      </div>

      {flag === 'adjusted' && (
        <div className="space-y-3 animate-fade-in">
          <div className="sm:max-w-[16rem]">
            <Label>Corrected total (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              placeholder={`AI said ${score.total_pct}`}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="tabular"
            />
          </div>

          {!showParts ? (
            <button
              type="button"
              onClick={() => setShowParts(true)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Correct individual components too →
            </button>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs text-slate-500">
                Leave any blank to keep the AI's value. Change a component and the total is
                recalculated from the rubric weighting, unless you set a total above.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {COMPONENTS.map((c) => (
                  <div key={c.key}>
                    <Label>
                      {c.label} <span className="text-slate-300">· {c.weight}</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      placeholder={`AI said ${score[c.key]}`}
                      value={parts[c.key]}
                      onChange={(e) => setParts((p) => ({ ...p, [c.key]: e.target.value }))}
                      className="tabular"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <Label>Why *</Label>
        <Textarea
          rows={3}
          placeholder="What did the scorer get wrong? Whoever reads this report later only has this note to go on."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {!inRange && (
        <p className="text-xs text-amber-700">Scores must be between 0 and 100.</p>
      )}
      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {flag === 'disagree'
            ? 'Recorded as a disagreement. The AI score stays as the reported number.'
            : 'Recorded as your correction, shown alongside the AI score.'}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {busy === 'save' ? <Spinner className="border-white/40 border-t-white" /> : null}
            {busy === 'save' ? 'Saving…' : existing ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small marker for the score column, so the header reads at a glance. */
export function OverrideBadge({ flag }: { flag: OverrideFlag }) {
  return flag === 'adjusted' ? (
    <Badge tone="violet">Overridden</Badge>
  ) : (
    <Badge tone="amber">Disagreed</Badge>
  );
}
