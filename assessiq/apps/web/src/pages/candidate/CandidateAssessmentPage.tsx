import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Send, TimerOff } from 'lucide-react';
import type { BehaviorEventInput, CandidateQuestion } from '@assessiq/types';
import { Badge, Button, ProgressBar, Textarea, Spinner } from '../../components/ui';
import { cn } from '../../lib/cn';
import { sessionsApi } from '../../api/sessions.api';
import { ApiRequestError } from '../../api/client';
import { useCandidateSession } from '../../store/candidateSession';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CandidateAssessmentPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const s = useCandidateSession();

  const [position, setPosition] = useState(s.firstQuestion?.position ?? 0);
  const [question, setQuestion] = useState<CandidateQuestion | null>(s.firstQuestion?.question ?? null);
  const [draft, setDraft] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while the timer is running; then the two stages of expiry.
  const [timeUp, setTimeUp] = useState<null | 'submitting' | 'done'>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(
    s.expiresAt ? Math.max(0, new Date(s.expiresAt).getTime() - Date.now()) : null,
  );

  // Refs for stable access inside listeners/timers.
  const positionRef = useRef(position);
  positionRef.current = position;
  const shownAt = useRef(Date.now());
  const events = useRef<BehaviorEventInput[]>([]);
  const lastActivity = useRef(Date.now());
  const finished = useRef(false);

  const { sessionId, sessionToken, total, confidenceEnabled, expiresAt } = s;

  // No active session (e.g. page refresh) → back to the landing page.
  useEffect(() => {
    if (!sessionId || !sessionToken || !question) {
      navigate(`/a/${token}`, { replace: true });
    }
  }, [sessionId, sessionToken, question, navigate, token]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    navigate(`/a/${token}/done`);
  };

  const flushEvents = async () => {
    if (!sessionId || !sessionToken || events.current.length === 0) return;
    const batch = events.current.splice(0, events.current.length);
    try {
      await sessionsApi.sendEvents(sessionId, batch, sessionToken);
    } catch {
      /* proctoring is best-effort — drop on failure */
    }
  };

  const pushEvent = (type: BehaviorEventInput['type'], extra?: Partial<BehaviorEventInput>) => {
    events.current.push({
      type,
      timestamp: Date.now(),
      question_index: positionRef.current,
      ...extra,
    });
  };

  // Proctoring listeners + periodic flush + idle detection.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) pushEvent('tab_switch');
    };
    const onBlur = () => pushEvent('focus_loss');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);

    const idle = setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor > 30_000) {
        pushEvent('idle', { idle_duration_ms: idleFor });
        lastActivity.current = Date.now();
      }
    }, 10_000);
    const flush = setInterval(() => {
      void flushEvents();
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      clearInterval(idle);
      clearInterval(flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sessionToken]);

  // Countdown from the server-issued expiry; auto-submit at zero.
  // The candidate is TOLD what happened before we navigate — previously the
  // page just jumped to the submitted screen, which is indistinguishable from
  // having pressed submit yourself.
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      const rem = new Date(expiresAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, rem));
      if (rem <= 0) {
        clearInterval(id);
        setTimeUp('submitting');
        void (async () => {
          await flushEvents();
          if (sessionId && sessionToken) await sessionsApi.submit(sessionId, sessionToken).catch(() => {});
          setTimeUp('done');
          // Let the message land before leaving the page.
          setTimeout(finish, 2500);
        })();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, sessionId, sessionToken]);

  // Blocking overlay: the assessment is over, so there is nothing useful the
  // candidate could do underneath it.
  if (timeUp) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <TimerOff size={22} />
          </span>
          <h2 className="text-lg font-bold text-slate-800">Time's up</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {timeUp === 'submitting'
              ? 'Your time limit has been reached. Submitting your assessment now…'
              : 'Your assessment has been submitted. Any questions you did not reach are marked as unanswered.'}
          </p>
          <div className="mt-5 flex justify-center">
            {timeUp === 'submitting' ? (
              <Spinner />
            ) : (
              <Button onClick={finish}>
                Continue <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!sessionId || !sessionToken || !question) return null;

  const low = remainingMs !== null && remainingMs <= 60_000;
  const isLast = position >= total - 1;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    await flushEvents();
    try {
      const res = await sessionsApi.submitAnswer(
        sessionId,
        {
          question_id: question.id,
          position,
          text: draft.trim(),
          ...(confidenceEnabled && confidence ? { confidence_rating: confidence } : {}),
          time_spent_ms: Date.now() - shownAt.current,
        },
        sessionToken,
      );

      if (res.next_position === null) {
        await sessionsApi.submit(sessionId, sessionToken);
        finish();
        return;
      }

      const next = await sessionsApi.getQuestion(sessionId, res.next_position, sessionToken);
      setPosition(next.position);
      setQuestion(next.question);
      setDraft('');
      setConfidence(null);
      shownAt.current = Date.now();
      lastActivity.current = Date.now();
      setSubmitting(false);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        (err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_CLOSED')
      ) {
        // The server closed the session while they were answering. Same
        // explanation as a client-side expiry rather than a silent jump.
        setTimeUp('done');
        setTimeout(finish, 2500);
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : 'Could not submit your answer.');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-slate-500 tabular">
              Question {position + 1} of {total}
            </p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Monitoring
              </span>
              {remainingMs !== null && (
                <span
                  className={cn(
                    'font-mono tabular text-sm font-semibold',
                    low ? 'text-rose-600' : 'text-slate-700',
                  )}
                >
                  {fmt(remainingMs)}
                </span>
              )}
            </div>
          </div>
          <ProgressBar value={((position + 1) / total) * 100} tone="bg-brand-500" className="mt-2.5 h-1.5" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <Badge tone="brand">{question.topic}</Badge>
          <h1 className="text-xl font-semibold leading-snug text-slate-800">{question.text}</h1>

          <Textarea
            rows={8}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              lastActivity.current = Date.now();
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text) pushEvent('paste', { char_count: text.length });
              lastActivity.current = Date.now();
            }}
            placeholder="Type your answer here…"
            className="min-h-[16rem]"
            autoFocus
          />

          {confidenceEnabled && (
            <div>
              <p className="text-sm font-medium text-slate-700">How confident are you?</p>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = confidence !== null && n <= confidence;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfidence(n)}
                      aria-label={`Confidence ${n} of 5`}
                      className={cn(
                        'h-10 flex-1 rounded-lg border text-sm font-semibold tabular transition-all',
                        active
                          ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600',
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-medium text-slate-400">
                <span>Not confident</span>
                <span>Very confident</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="border-t border-slate-100 pt-6">
            <Button size="lg" onClick={submit} disabled={submitting} className="w-full">
              {submitting ? (
                <Spinner className="border-white/40 border-t-white" />
              ) : isLast ? (
                <>
                  Submit assessment <Send size={17} />
                </>
              ) : (
                <>
                  Submit &amp; continue <ArrowRight size={18} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
