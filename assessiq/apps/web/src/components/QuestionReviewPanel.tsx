import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import {
  Check,
  X,
  Wand2,
  Trash2,
  AlertTriangle,
  Target,
  TrendingUp,
  ShieldAlert,
  Quote,
  Eye,
  Scale,
  MessageSquareText,
} from 'lucide-react';
import type { ApproveQuestionRequest, QuestionDraft } from '@assessiq/types';
import { questionsApi } from '../api/questions.api';
import { ApiRequestError } from '../api/client';
import { Badge, Button, Input, Spinner, difficultyTone } from './ui';
import { cn } from '../lib/cn';

/**
 * Textarea that grows to fit its content. Rubric guides run 600–1300
 * characters; a fixed 4-row box turned every one of them into its own little
 * scroll region, which is what made the panel unreadable.
 */
function AutoTextarea({
  value,
  minRows = 2,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn(
        'w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}

type Accent = 'sky' | 'brand' | 'rose' | 'amber';

const accents: Record<Accent, { bar: string; chip: string; icon: string; ring: string }> = {
  sky: {
    bar: 'bg-sky-400',
    chip: 'bg-sky-50 text-sky-700',
    icon: 'bg-sky-100 text-sky-600',
    ring: 'ring-sky-100',
  },
  brand: {
    bar: 'bg-brand-500',
    chip: 'bg-brand-50 text-brand-700',
    icon: 'bg-brand-100 text-brand-600',
    ring: 'ring-brand-200',
  },
  rose: {
    bar: 'bg-rose-400',
    chip: 'bg-rose-50 text-rose-700',
    icon: 'bg-rose-100 text-rose-600',
    ring: 'ring-rose-100',
  },
  amber: {
    bar: 'bg-amber-400',
    chip: 'bg-amber-50 text-amber-700',
    icon: 'bg-amber-100 text-amber-600',
    ring: 'ring-amber-100',
  },
};

/**
 * One rubric component.
 *
 * Both halves stay editable and visible: `_display` is what a job seeker reads
 * after an answer is revealed, but `_guide` is what actually scores the
 * candidate — hiding it would mean approving a scoring rule sight-unseen. They
 * are styled differently so it is obvious at a glance which one does the work.
 */
function RubricSection({
  icon,
  title,
  weight,
  accent,
  hint,
  emphasis,
  display,
  guide,
  onDisplay,
  onGuide,
}: {
  icon: ReactNode;
  title: string;
  weight: number;
  accent: Accent;
  hint: string;
  emphasis?: boolean;
  display?: string;
  guide: string;
  onDisplay?: (v: string) => void;
  onGuide: (v: string) => void;
}) {
  const a = accents[accent];
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border bg-white',
        emphasis ? cn('border-brand-200 ring-1', a.ring) : 'border-slate-200',
      )}
    >
      {/* Colour spine — gives each component its own identity in the scroll. */}
      <span className={cn('absolute inset-y-0 left-0 w-1', a.bar)} />

      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', a.icon)}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', a.chip)}>
              {weight}%
            </span>
            {emphasis && (
              <span className="text-[11px] font-medium text-brand-600">weighted highest</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
        </div>
      </header>

      <div className="space-y-3 px-5 pb-4 pl-5">
        {onDisplay && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Eye size={12} /> Job seeker sees this
            </p>
            <AutoTextarea value={display ?? ''} onChange={(e) => onDisplay(e.target.value)} />
          </div>
        )}
        <div className="rounded-lg bg-slate-50/80 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Scale size={12} /> Scores the answer
          </p>
          <AutoTextarea
            value={guide}
            minRows={3}
            onChange={(e) => onGuide(e.target.value)}
            className="bg-white"
          />
        </div>
      </div>
    </section>
  );
}

/** Proportional strip showing how the four components add up to 100. */
function WeightBar() {
  const segments: { w: number; cls: string; label: string }[] = [
    { w: 25, cls: 'bg-sky-400', label: 'Core 25%' },
    { w: 35, cls: 'bg-brand-500', label: 'Senior signal 35%' },
    { w: 25, cls: 'bg-rose-400', label: 'Trap 25%' },
    { w: 15, cls: 'bg-amber-400', label: 'Evidence 15%' },
  ];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full">
      {segments.map((s) => (
        <span key={s.label} title={s.label} className={s.cls} style={{ width: `${s.w}%` }} />
      ))}
    </div>
  );
}

/**
 * Full review of a generated (or AI-rubric'd) question before it can be used.
 * Approve is the only path to `vetted`, and it is always an explicit act by
 * the manager after seeing the whole rubric.
 */
export function QuestionReviewPanel({
  draft,
  onApproved,
  onRejected,
  onClose,
}: {
  draft: QuestionDraft;
  onApproved: (q: QuestionDraft) => void;
  onRejected: (id: string) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<QuestionDraft>(draft);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState<null | 'refine' | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  // A refine replaces the draft in place; reset the editor to the new version.
  useEffect(() => setD(draft), [draft.id]);

  // Escape closes, matching every other dismissable surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busy === null) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const set = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof ApiRequestError ? e.message : fallback);

  const refine = async () => {
    if (!instruction.trim()) return;
    setBusy('refine');
    setError(null);
    try {
      const next = await questionsApi.refine(d.id, { instruction: instruction.trim() });
      setD(next);
      setInstruction('');
    } catch (e) {
      fail(e, 'Could not refine this question.');
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy('approve');
    setError(null);
    // Send the whole edited set; the server keeps a draft value for anything
    // omitted, and this is simpler than diffing eight fields.
    const edits: ApproveQuestionRequest = {
      text: d.text,
      core_answer_guide: d.core_answer_guide,
      senior_signal_guide: d.senior_signal_guide,
      trap_guide: d.trap_guide,
      evidence_guide: d.evidence_guide,
      core_answer_display: d.core_answer_display,
      senior_signal_display: d.senior_signal_display,
      trap_display: d.trap_display,
    };
    try {
      onApproved(await questionsApi.approve(d.id, edits));
    } catch (e) {
      fail(e, 'Could not approve this question.');
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    setError(null);
    try {
      await questionsApi.reject(d.id);
      onRejected(d.id);
    } catch (e) {
      fail(e, 'Could not reject this question.');
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* HEADER */}
        <header className="shrink-0 border-b border-slate-100 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Wand2 size={14} />
                </span>
                <h3 className="font-semibold text-slate-800">Review before use</h3>
                <Badge tone="amber">AI-generated</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{d.topic}</Badge>
                <Badge tone={difficultyTone[d.difficulty] ?? 'slate'}>{d.difficulty}</Badge>
                <Badge tone="slate">{d.type}</Badge>
                {d.domain && <Badge tone="violet">{d.domain}</Badge>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* BODY */}
        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 px-6 py-5">
          {/* The question itself gets top billing — it's the thing being asked. */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <MessageSquareText size={12} /> The question
            </p>
            <AutoTextarea
              value={d.text}
              minRows={3}
              onChange={(e) => set('text', e.target.value)}
              className="text-[15px] font-medium text-slate-800"
            />
          </section>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-700">Scoring rubric</h4>
                <p className="text-xs text-slate-400">
                  How an answer earns its score. Edit anything before approving.
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">100% total</span>
            </div>
            <WeightBar />
          </div>

          <div className="space-y-4">
            <RubricSection
              icon={<Target size={15} />}
              title="Core answer"
              weight={25}
              accent="sky"
              hint="What any correct answer must cover."
              display={d.core_answer_display}
              guide={d.core_answer_guide}
              onDisplay={(v) => set('core_answer_display', v)}
              onGuide={(v) => set('core_answer_guide', v)}
            />
            <RubricSection
              icon={<TrendingUp size={15} />}
              title="Senior signal"
              weight={35}
              accent="brand"
              emphasis
              hint="What a senior answer adds beyond merely correct — the tradeoff, the edge case, the 'when not to'. Hardest to fake, so it drives the verdict."
              display={d.senior_signal_display}
              guide={d.senior_signal_guide}
              onDisplay={(v) => set('senior_signal_display', v)}
              onGuide={(v) => set('senior_signal_guide', v)}
            />
            <RubricSection
              icon={<ShieldAlert size={15} />}
              title="Trap avoidance"
              weight={25}
              accent="rose"
              hint="The plausible-but-wrong answer interviewers expect a weaker candidate to give."
              display={d.trap_display}
              guide={d.trap_guide}
              onDisplay={(v) => set('trap_display', v)}
              onGuide={(v) => set('trap_guide', v)}
            />
            {/* Evidence has no _display counterpart in the data model. */}
            <RubricSection
              icon={<Quote size={15} />}
              title="Evidence / example"
              weight={15}
              accent="amber"
              hint="What a grounded, concrete example looks like. Scoring-only — job seekers never see this one."
              guide={d.evidence_guide}
              onGuide={(v) => set('evidence_guide', v)}
            />
          </div>

          {/* REFINE */}
          <section className="rounded-xl border border-brand-100 bg-brand-soft p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              <Wand2 size={12} /> Refine with AI
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. make it payment-specific, focus on at-least-once delivery"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void refine();
                  }
                }}
              />
              <Button variant="secondary" onClick={refine} disabled={disabled || !instruction.trim()}>
                {busy === 'refine' ? <Spinner /> : <Wand2 size={16} />}
                Refine
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Revises this question and its rubric — it keeps what works rather than starting over.
            </p>
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <Button variant="secondary" onClick={reject} disabled={disabled}>
            {busy === 'reject' ? <Spinner /> : <Trash2 size={16} />}
            Reject
          </Button>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:block">
              Approving saves it to your bank as vetted
            </span>
            <Button variant="secondary" onClick={onClose} disabled={disabled}>
              Cancel
            </Button>
            <Button onClick={approve} disabled={disabled}>
              {busy === 'approve' ? (
                <Spinner className="border-white/40 border-t-white" />
              ) : (
                <Check size={16} />
              )}
              Approve &amp; add
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
