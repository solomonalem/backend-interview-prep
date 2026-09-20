import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, MessageCircleQuestion, Send, TimerOff } from 'lucide-react';
import type { BehaviorEventInput, CandidateProbe, CandidateQuestion, SnippetLanguage } from '@assessiq/types';
import { SNIPPET_DEFAULT_LANGUAGE, SNIPPET_MAX_CHARS } from '@assessiq/types';
import { Badge, Button, ProgressBar, Textarea, Spinner } from '../../components/ui';
import { CodeSketchField } from '../../components/session/CodeSketchField';
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
  // The optional code sketch. Part of the answer, not a second submission:
  // it is cleared when the answer is, sent when the answer is sent, and — if
  // the box was never opened — never mentioned to the server at all.
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sketch, setSketch] = useState('');
  const [sketchLang, setSketchLang] = useState<SnippetLanguage>(SNIPPET_DEFAULT_LANGUAGE);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while the timer is running; then the two stages of expiry.
  const [timeUp, setTimeUp] = useState<null | 'submitting' | 'done'>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(
    s.expiresAt ? Math.max(0, new Date(s.expiresAt).getTime() - Date.now()) : null,
  );

  // ── Follow-up probe ────────────────────────────────────────────────────────
  // Set when a submitted answer comes back with one. While it is set, the probe
  // screen replaces the question: there is no path forward around it, though
  // leaving the box empty is a legitimate way through.
  const [probe, setProbe] = useState<CandidateProbe | null>(null);
  const [probeDraft, setProbeDraft] = useState('');
  const [probeRemainingMs, setProbeRemainingMs] = useState(0);
  const [probeSubmitting, setProbeSubmitting] = useState(false);

  // Refs for stable access inside listeners/timers.
  const positionRef = useRef(position);
  positionRef.current = position;
  const shownAt = useRef(Date.now());
  const probeShownAt = useRef(0);
  // Where to go once the probe is dealt with: the next position, or null for
  // "that was the last question, finish".
  const pendingNext = useRef<number | null>(null);
  // Latest submitProbe, so the countdown effect (which must be declared above
  // the early returns) can fire the same function the button does.
  const submitProbeRef = useRef<(() => Promise<void>) | null>(null);
  const events = useRef<BehaviorEventInput[]>([]);
  const lastActivity = useRef(Date.now());
  const finished = useRef(false);

  const { sessionId, sessionToken, total, confidenceEnabled, probesEnabled, expiresAt } = s;

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

  // The probe's own clock, independent of the session timer above it. At zero
  // it submits whatever is in the box — the same contract as the session timer,
  // so nothing about expiry is a surprise the second time it happens.
  useEffect(() => {
    if (!probe) return;
    const deadline = probeShownAt.current + probe.time_seconds * 1000;
    setProbeRemainingMs(Math.max(0, deadline - Date.now()));
    const id = setInterval(() => {
      const rem = deadline - Date.now();
      setProbeRemainingMs(Math.max(0, rem));
      if (rem <= 0) {
        clearInterval(id);
        void submitProbeRef.current?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [probe]);

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

  // The server closed the session under them. Same explanation as a
  // client-side expiry rather than a silent jump — and now shared by the
  // answer and the probe, so a session that dies during a follow-up ends
  // exactly the way one that dies during an answer does.
  const handleSessionClosed = (err: unknown): boolean => {
    if (
      err instanceof ApiRequestError &&
      (err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_CLOSED')
    ) {
      setTimeUp('done');
      setTimeout(finish, 2500);
      return true;
    }
    return false;
  };

  // Move to the next question, or finish. Extracted because the probe screen
  // resumes the assessment at exactly the same point the answer would have.
  const advance = async (next: number | null) => {
    if (next === null) {
      await sessionsApi.submit(sessionId, sessionToken);
      finish();
      return;
    }
    const q = await sessionsApi.getQuestion(sessionId, next, sessionToken);
    setPosition(q.position);
    setQuestion(q.question);
    setDraft('');
    setSketchOpen(false);
    setSketch('');
    setSketchLang(SNIPPET_DEFAULT_LANGUAGE);
    setConfidence(null);
    shownAt.current = Date.now();
    lastActivity.current = Date.now();
  };

  const submit = async () => {
    if (submitting) return;
    // The server enforces this too. Stopping here is about the message: a 400
    // after a submit on a timed assessment reads as something breaking, where
    // a count turning red while you type reads as a limit.
    if (sketch.length > SNIPPET_MAX_CHARS) {
      setError(
        `Your code snippet is too long — the limit is ${SNIPPET_MAX_CHARS.toLocaleString()} characters.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    // Before the answer, so the paste events for this question are on the
    // server by the time it decides whether a follow-up is due.
    await flushEvents();
    try {
      const res = await sessionsApi.submitAnswer(
        sessionId,
        {
          question_id: question.id,
          position,
          text: draft.trim(),
          // Omitted entirely when nothing was written — the server stores NULL,
          // and an untouched box never becomes an empty string in the database.
          ...(sketch.trim()
            ? { snippet_code: sketch, snippet_language: sketchLang }
            : {}),
          ...(confidenceEnabled && confidence ? { confidence_rating: confidence } : {}),
          time_spent_ms: Date.now() - shownAt.current,
        },
        sessionToken,
      );

      // A follow-up came back: it goes BEFORE the next question, and the
      // position we were heading to waits until it is dealt with.
      if (res.probe) {
        pendingNext.current = res.next_position;
        probeShownAt.current = Date.now();
        setProbeDraft('');
        setProbe(res.probe);
        setSubmitting(false);
        lastActivity.current = Date.now();
        return;
      }

      await advance(res.next_position);
      setSubmitting(false);
    } catch (err) {
      if (handleSessionClosed(err)) return;
      setError(err instanceof ApiRequestError ? err.message : 'Could not submit your answer.');
      setSubmitting(false);
    }
  };

  const submitProbe = async () => {
    if (!probe || probeSubmitting) return;
    setProbeSubmitting(true);
    setError(null);
    await flushEvents();
    try {
      await sessionsApi.answerProbe(
        sessionId,
        probe.id,
        { text: probeDraft.trim(), time_spent_ms: Date.now() - probeShownAt.current },
        sessionToken,
      );
    } catch (err) {
      if (handleSessionClosed(err)) return;
      // Deliberately swallowed. A follow-up we failed to record must not strand
      // the candidate on a screen with no way forward — the assessment is the
      // thing that matters, and the probe is left unanswered on our side.
      console.error('[probe] could not record the follow-up answer');
    }

    const next = pendingNext.current;
    pendingNext.current = null;
    setProbe(null);
    setProbeDraft('');
    setProbeSubmitting(false);
    try {
      await advance(next);
    } catch (err) {
      if (handleSessionClosed(err)) return;
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the next question.');
    }
  };
  // Read by the countdown effect above, which cannot see this closure directly.
  submitProbeRef.current = submitProbe;

  // ── The probe screen ───────────────────────────────────────────────────────
  // Replaces the question rather than sitting beside it: there is no forward
  // path around a follow-up. Leaving the box empty is the way through, and the
  // screen says so — an unanswered follow-up is a recorded outcome, not a
  // failure state, and a candidate who does not know that will burn their
  // ninety seconds deciding whether they are allowed to move on.
  if (probe) {
    const probeLow = probeRemainingMs <= 15_000;
    return (
      <div className="flex-1 flex flex-col">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto w-full max-w-2xl px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold text-slate-500 tabular">
                Follow-up on question {position + 1}
              </p>
              {remainingMs !== null && (
                <span className="font-mono tabular text-xs font-medium text-slate-400">
                  {fmt(remainingMs)} left overall
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 px-6 py-10">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-sky-700">
                <MessageCircleQuestion size={18} />
                <p className="text-sm font-semibold">One follow-up on your answer:</p>
              </div>
              <span
                className={cn(
                  'font-mono tabular text-lg font-bold leading-none',
                  probeLow ? 'text-rose-600' : 'text-slate-700',
                )}
              >
                {fmt(probeRemainingMs)}
              </span>
            </div>

            <ProgressBar
              value={(probeRemainingMs / (probe.time_seconds * 1000)) * 100}
              tone={probeLow ? 'bg-rose-500' : 'bg-sky-500'}
              className="h-1.5"
            />

            <h1 className="text-lg font-semibold leading-snug text-slate-800">{probe.text}</h1>

            <Textarea
              rows={6}
              value={probeDraft}
              onChange={(e) => {
                setProbeDraft(e.target.value);
                lastActivity.current = Date.now();
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text) pushEvent('paste', { char_count: text.length });
                lastActivity.current = Date.now();
              }}
              placeholder="A couple of sentences is plenty…"
              className="min-h-[10rem]"
              autoFocus
            />

            <p className="text-xs text-slate-400">
              This submits on its own when the timer reaches zero, with whatever you have written.
              Leaving it blank is allowed.
            </p>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="border-t border-slate-100 pt-6">
              <Button size="lg" onClick={submitProbe} disabled={probeSubmitting} className="w-full">
                {probeSubmitting ? (
                  <Spinner className="border-white/40 border-t-white" />
                ) : (
                  <>
                    Submit follow-up <ArrowRight size={18} />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

          {/* Under the answer, above confidence: it belongs to the answer, and
              putting it after the rating would read as a separate task. */}
          <CodeSketchField
            open={sketchOpen}
            code={sketch}
            language={sketchLang}
            onOpen={() => setSketchOpen(true)}
            onRemove={() => {
              setSketchOpen(false);
              setSketch('');
              setSketchLang(SNIPPET_DEFAULT_LANGUAGE);
            }}
            onCodeChange={setSketch}
            onLanguageChange={setSketchLang}
            // The same event type, on the same question index, as the answer
            // box — so a paste into the sketch counts for the report and for
            // the flagged_only probe rule exactly as a paste into the prose does.
            onPaste={(chars) => pushEvent('paste', { char_count: chars })}
            onActivity={() => {
              lastActivity.current = Date.now();
            }}
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
            {/* The pause after submit is where a follow-up gets written. Said
                out loud because a few unexplained seconds on a timed assessment
                reads as something having gone wrong. */}
            {submitting && probesEnabled && (
              <p className="mt-2.5 text-center text-xs text-slate-400">
                Saving your answer — there may be a short follow-up before the next question.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
