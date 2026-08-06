import { useEffect, useState } from 'react';
import { Check, X, Wand2, Trash2, AlertTriangle } from 'lucide-react';
import type { ApproveQuestionRequest, QuestionDraft } from '@assessiq/types';
import { questionsApi } from '../api/questions.api';
import { ApiRequestError } from '../api/client';
import { Badge, Button, Input, Label, Spinner, Textarea } from './ui';

/**
 * One rubric component. Both halves are editable on purpose:
 * `_display` is what a job seeker reads after an answer is revealed, but
 * `_guide` is what actually scores the candidate — hiding it would mean
 * approving a scoring rule sight-unseen.
 */
function RubricField({
  title,
  weight,
  hint,
  display,
  guide,
  onDisplay,
  onGuide,
}: {
  title: string;
  weight: string;
  hint: string;
  display?: string;
  guide: string;
  onDisplay?: (v: string) => void;
  onGuide: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <Badge tone="slate">{weight}</Badge>
      </div>
      <p className="text-xs text-slate-400">{hint}</p>
      {onDisplay && (
        <div>
          <Label>Shown to job seekers</Label>
          <Textarea rows={3} value={display ?? ''} onChange={(e) => onDisplay(e.target.value)} />
        </div>
      )}
      <div>
        <Label>Used to score answers</Label>
        <Textarea rows={4} value={guide} onChange={(e) => onGuide(e.target.value)} />
      </div>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">Review before use</h3>
              <Badge tone="amber">AI-generated</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {d.topic} · {d.difficulty} · {d.type}
              {d.domain ? ` · ${d.domain}` : ''} — approving saves it to your bank as vetted.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-300 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <Label>Question</Label>
            <Textarea rows={4} value={d.text} onChange={(e) => set('text', e.target.value)} />
          </div>

          <RubricField
            title="Core answer"
            weight="25%"
            hint="What any correct answer must cover."
            display={d.core_answer_display}
            guide={d.core_answer_guide}
            onDisplay={(v) => set('core_answer_display', v)}
            onGuide={(v) => set('core_answer_guide', v)}
          />
          <RubricField
            title="Senior signal"
            weight="35%"
            hint="What a senior answer adds beyond correct — the tradeoff, the edge case, the 'when not to'. Weighted highest."
            display={d.senior_signal_display}
            guide={d.senior_signal_guide}
            onDisplay={(v) => set('senior_signal_display', v)}
            onGuide={(v) => set('senior_signal_guide', v)}
          />
          <RubricField
            title="Trap avoidance"
            weight="25%"
            hint="The plausible-but-wrong answer to watch for."
            display={d.trap_display}
            guide={d.trap_guide}
            onDisplay={(v) => set('trap_display', v)}
            onGuide={(v) => set('trap_guide', v)}
          />
          {/* Evidence has no _display counterpart in the data model — scoring only. */}
          <RubricField
            title="Evidence / example"
            weight="15%"
            hint="What a grounded, concrete example looks like. Scoring-only — job seekers never see this one."
            guide={d.evidence_guide}
            onGuide={(v) => set('evidence_guide', v)}
          />

          <div className="rounded-lg border border-brand-100 bg-brand-soft p-4">
            <Label>Refine with AI</Label>
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
              <Button
                variant="secondary"
                onClick={refine}
                disabled={disabled || !instruction.trim()}
              >
                {busy === 'refine' ? <Spinner /> : <Wand2 size={16} />}
                Refine
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Revises this question — it keeps what works rather than starting over.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="secondary" onClick={reject} disabled={disabled}>
            {busy === 'reject' ? <Spinner /> : <Trash2 size={16} />}
            Reject
          </Button>
          <div className="flex items-center gap-2">
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
        </div>
      </div>
    </div>
  );
}
