import { useState } from 'react';
import { ChevronDown, ClipboardList, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import type { InterviewKit as Kit } from '@assessiq/types';
import { reportsApi } from '../../api/reports.api';
import { ApiRequestError } from '../../api/client';
import { Button, Card, CardBody, Spinner } from '../ui';
import { cn } from '../../lib/cn';

/**
 * The bridge from this report to the live round.
 *
 * Collapsible and collapsed by default: it is prepared for a conversation that
 * has not happened yet, and it should not compete with the scores when someone
 * opens the report to read them.
 *
 * Interviewer-only — the shared report never receives a kit from the server,
 * so this component simply never renders there.
 */
export function InterviewKitPanel({
  sessionId,
  kit: initial,
}: {
  sessionId: string;
  kit: Kit | null;
}) {
  const [kit, setKit] = useState<Kit | null>(initial);
  // Collapsed even when a kit already exists. The report is what someone
  // opened this page to read; a guide for a conversation that has not happened
  // yet should not be the first thing between them and the score. Generating
  // one opens it, because that click WAS the request to see it.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setKit(await reportsApi.generateInterviewKit(sessionId));
      setOpen(true);
    } catch (err) {
      // Never a fabricated kit: a failure says so and offers to try again.
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not prepare the interview kit.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-6 border-indigo-200 bg-indigo-50/40">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => kit && setOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <ClipboardList size={16} className="text-indigo-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                Live interview kit
              </span>
              <span className="block text-xs text-slate-500">
                {kit
                  ? 'Questions for the live round, each tied to something in this report.'
                  : 'Turn this report into questions for the live round — what to ask, and why.'}
              </span>
            </span>
            {kit && (
              <ChevronDown
                size={16}
                className={cn('ml-1 text-slate-400 transition-transform', open && 'rotate-180')}
              />
            )}
          </button>

          <Button variant="secondary" onClick={() => void generate()} disabled={busy}>
            {busy ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : kit ? (
              <RefreshCw size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {busy ? 'Preparing…' : kit ? 'Regenerate' : 'Generate interview kit'}
          </Button>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {kit && open && (
          <div className="animate-fade-in space-y-4 border-t border-indigo-100 pt-4">
            <ol className="space-y-3">
              {kit.questions.map((q, i) => (
                <li key={i} className="rounded-lg bg-white p-3.5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">
                    {i + 1}. {q.question}
                  </p>
                  {q.why && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Why:</span> {q.why}
                    </p>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {q.strong_answer && (
                      <p className="rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
                        <span className="font-semibold">Strong:</span> {q.strong_answer}
                      </p>
                    )}
                    {q.weak_answer && (
                      <p className="rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-800">
                        <span className="font-semibold">Weak:</span> {q.weak_answer}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {kit.red_flags.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Listen for
                </p>
                <ul className="space-y-1">
                  {kit.red_flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <TriangleAlert size={13} className="mt-1 shrink-0 text-amber-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {kit.agenda.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Suggested 30 minutes
                </p>
                <ul className="space-y-1">
                  {kit.agenda.map((a, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-600">
                      <span className="w-14 shrink-0 font-semibold text-slate-700 tabular">
                        {a.minutes} min
                      </span>
                      {a.item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Prepared {new Date(kit.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {' · '}Yours only — a shared link to this report never includes it.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
