import { useEffect, useState } from 'react';
import { Check, Copy, Send, X } from 'lucide-react';
import type {
  AssessmentListItem,
  CreateLinkResponse,
  DuplicateCandidate,
} from '@assessiq/types';
import { assessmentsApi } from '../../api/assessments.api';
import { ApiRequestError } from '../../api/client';
import { Button, Spinner } from '../ui';
import { cn } from '../../lib/cn';

/**
 * "Send an assessment" — a shortcut into the invite flow that already exists,
 * with the candidate's identity filled in.
 *
 * Deliberately NOT new link mechanics. It calls the same createLink endpoint,
 * gets the same duplicate warning, sends the same email and produces the same
 * link as inviting from the assessment page does. The only thing it adds is
 * not making the manager retype a name and address they have already stored.
 */
export function SendAssessmentDialog({
  candidate,
  onClose,
  onSent,
}: {
  candidate: { name: string; email: string };
  onClose: () => void;
  /** Fired after a link is created so the caller can refresh its journey. */
  onSent?: () => void;
}) {
  const [assessments, setAssessments] = useState<AssessmentListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CreateLinkResponse | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    assessmentsApi
      .list()
      .then((r) => setAssessments(r.assessments))
      .catch(() => setError('Could not load your assessments'));
  }, []);

  const send = async (confirmDuplicate = false) => {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await assessmentsApi.createLink(selected, {
        candidate_label: candidate.name,
        candidate_email: candidate.email,
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      });
      setDuplicate(null);
      setResult(res);
      onSent?.();
    } catch (err) {
      // Re-sending something they already finished is a question, not a failure.
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_CANDIDATE') {
        setDuplicate((err.body?.duplicate as DuplicateCandidate) ?? null);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not create the link');
      }
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="font-semibold text-slate-800">Send an assessment</h2>
            <p className="text-xs text-slate-500">
              to {candidate.name} · {candidate.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto px-5 py-4">
          {result ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <Check size={16} /> Link created for {result.candidate_label}
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-slate-600">{result.url}</code>
                <Button size="sm" variant="secondary" onClick={copy}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {/* Delivery is never silently assumed — the same rule the
                  assessment page follows. */}
              <p className="text-xs text-slate-500">
                {result.email_status === 'sent'
                  ? `Emailed to ${result.candidate_email}.`
                  : result.email_status === 'failed'
                    ? `The email didn't go out: ${result.email_error ?? 'the provider rejected it'}. Copy the link instead.`
                    : 'Email is not configured here — copy the link and send it yourself.'}
              </p>
            </div>
          ) : duplicate ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                <strong>{duplicate.candidate_label ?? candidate.name}</strong> already completed
                this assessment
                {duplicate.overall_score !== null && (
                  <> and scored <strong>{duplicate.overall_score}%</strong></>
                )}
                . Send it again anyway?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void send(true)} disabled={sending}>
                  Send it again
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDuplicate(null)}>
                  Pick another
                </Button>
              </div>
            </div>
          ) : assessments === null ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-5 w-5" />
            </div>
          ) : assessments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              You haven't built an assessment yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {assessments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition',
                    selected === a.id
                      ? 'border-brand-400 bg-brand-50/60'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <span className="text-sm font-medium text-slate-700">{a.title}</span>
                  <span className="shrink-0 text-xs text-slate-400 tabular">
                    {a.question_count} {a.question_count === 1 ? 'question' : 'questions'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>

        {!result && !duplicate && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={!selected || sending}>
              {sending ? <Spinner className="border-white/40 border-t-white" /> : <Send size={15} />}
              Send invite
            </Button>
          </div>
        )}
        {result && (
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
