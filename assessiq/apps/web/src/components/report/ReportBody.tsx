import type { ReactNode } from 'react';
import {
  ShieldCheck,
  MonitorSmartphone,
  EyeOff,
  ClipboardPaste,
  Clock,
  Check,
  AlertTriangle,
  MessageSquare,
  Gauge,
  UserCheck,
  MessageCircleQuestion,
} from 'lucide-react';
import type {
  ReportProbe,
  ReportScore,
  ReportView,
  SetScoreOverrideRequest,
} from '@assessiq/types';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  ScoreRing,
  difficultyTone,
  verdictTone,
  verdictLabel,
} from '../ui';
import { OverrideBadge, OverrideBanner, ScoreOverrideEditor } from '../ScoreOverride';
import { CodeSnippet } from './CodeSnippet';
import { cn } from '../../lib/cn';


// What the delta bands are called on screen. The band names what happened to
// the defense and stops there: the report is context for a hiring decision, not
// a verdict about the person, and a label that reached for a cause would be
// asserting something the number cannot support.
const probeFlagMeta: Record<
  NonNullable<ReportProbe['flag']>,
  { label: string; ring: string; text: string; bg: string }
> = {
  defended: {
    label: 'Defended their answer',
    ring: 'ring-emerald-200',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
  },
  partially_defended: {
    label: 'Partially defended',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  not_defended: {
    label: 'Could not defend',
    ring: 'ring-rose-200',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
  },
};

/**
 * The follow-up, its answer, and the distance between the two.
 *
 * Presentation rule: everything here is what happened, and nothing here is what
 * it means. A large gap between an answer and its defense is a fact worth
 * putting in front of an interviewer and worth nothing at all as an automated
 * conclusion — so the block shows both numbers, names the band, and leaves the
 * reading to the person who will do the hiring.
 */
function ProbeBlock({ probe, answerTotal }: { probe: ReportProbe; answerTotal: number | null }) {
  // Nothing was ever asked. Said plainly and neutrally: this is our failure,
  // and a candidate must never be read as having dodged a question they were
  // not given.
  if (probe.status === 'generation_failed') {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500">
        A follow-up couldn't be generated for this answer.
      </p>
    );
  }

  const meta = probe.flag ? probeFlagMeta[probe.flag] : null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
          <MessageCircleQuestion size={13} /> Follow-up
        </p>
        {meta && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
              meta.bg,
              meta.text,
              meta.ring,
            )}
          >
            {meta.label}
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-slate-800">{probe.text}</p>

      <div className="mt-2.5 rounded-md bg-white/70 px-3 py-2.5">
        {probe.status === 'unanswered' || !probe.candidate_answer ? (
          <p className="text-sm italic text-slate-400">
            No response was given in the time allowed.
          </p>
        ) : (
          <p className="max-w-[95ch] whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {probe.candidate_answer}
          </p>
        )}
      </div>

      {probe.defense_pct !== null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {answerTotal !== null && (
            <span>
              Answer <span className="font-semibold tabular text-slate-700">{answerTotal}%</span>
            </span>
          )}
          <span>
            Follow-up{' '}
            <span className="font-semibold tabular text-slate-700">{probe.defense_pct}%</span>
          </span>
          {probe.delta !== null && (
            <span>
              Difference{' '}
              <span className="font-semibold tabular text-slate-700">
                {probe.delta > 0 ? '−' : probe.delta < 0 ? '+' : ''}
                {Math.abs(probe.delta)}
              </span>
            </span>
          )}
          <span className="text-slate-400">
            scored on core and senior signal only — a timed reply isn't asked for worked examples
          </span>
        </div>
      )}
    </div>
  );
}

const confidenceMeta: Record<string, { tone: 'emerald' | 'rose' | 'sky'; label: string }> = {
  well_calibrated: { tone: 'emerald', label: 'Well calibrated' },
  overconfident: { tone: 'rose', label: 'Overconfident' },
  underconfident: { tone: 'sky', label: 'Underconfident' },
};

// The number a reader should act on. An override with no figure ('disagree')
// leaves the AI's total standing — that is the point of that flag.
function effectiveTotal(s: ReportScore): number {
  return s.override?.total_pct ?? s.total_pct;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// `aiValue` is the AI's own figure when `value` has been overridden. Both are
// always shown — the bar reflects the operative number, the caption keeps the
// machine's.
function ComponentBar({
  label,
  value,
  emphasis,
  aiValue,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  aiValue?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn('text-xs font-medium', emphasis ? 'text-brand-700 font-semibold' : 'text-slate-500')}>
          {label}
          {emphasis && <span className="ml-1.5 text-[10px] font-semibold text-brand-500">35%</span>}
        </span>
        <span className="text-xs font-bold text-slate-700 tabular">
          {value}%
          {aiValue !== undefined && aiValue !== value && (
            <span className="ml-1.5 font-medium text-slate-400">AI {aiValue}%</span>
          )}
        </span>
      </div>
      <ProgressBar value={value} tone={emphasis ? 'bg-brand-500' : undefined} />
    </div>
  );
}

function StatChip({ icon, label, value, alert }: { icon: ReactNode; label: string; value: number; alert: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border px-3.5 py-3', alert ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
      <span className={cn('h-9 w-9 rounded-lg flex items-center justify-center', alert ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500')}>
        {icon}
      </span>
      <div>
        <p className="text-lg font-bold text-slate-800 tabular leading-none">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/**
 * Everything a report SHOWS — scores, proctoring, per-question breakdown,
 * follow-up deltas, code sketches.
 *
 * Extracted because the same report is now read in two places: by the manager
 * who owns it, and by whoever they handed a share link to. Two copies of this
 * would drift, and the day they did, a shared report would quietly stop
 * matching the one the hiring decision was made from.
 *
 * `readOnly` is the whole of the difference. It withholds the override EDITOR
 * and nothing else — an override that already exists is still shown, with both
 * numbers, because the transparency rule does not weaken just because the
 * reader is a guest.
 */
export interface ReportBodyProps {
  report: ReportView;
  /** A shared view: no editing affordances of any kind. */
  readOnly?: boolean;
  onSaveOverride?: (questionId: string, body: SetScoreOverrideRequest) => Promise<void>;
  onClearOverride?: (questionId: string) => Promise<void>;
}

export function ReportBody({
  report,
  readOnly = false,
  onSaveOverride,
  onClearOverride,
}: ReportBodyProps) {
  const { session, overall, proctoring, questions } = report;
  // Overrides move the headline figures; the AI's own stay on screen beside
  // them. `ov` is null until someone disagrees with something.
  const ov = overall.override;
  // answer === null means the candidate never submitted that question.
  const unansweredCount = questions.filter((q) => q.answer === null).length;
  const timeUsedMin = Math.round(session.time_used_ms / 60_000);
  const pasteCount = proctoring.paste_events.length;
  const clean =
    proctoring.tab_switch_count <= 1 &&
    proctoring.focus_loss_count === 0 &&
    pasteCount === 0 &&
    proctoring.idle_count <= 1;

  return (
    <>
      {/* HERO */}
      <Card className="mb-6">
        <CardBody className="grid gap-8 md:grid-cols-[auto_1fr_1.2fr] md:items-center">
          <div className="flex flex-col items-center gap-3">
            <ScoreRing value={ov?.total_pct ?? overall.total_pct} size={120} />
            <span className="text-xs font-medium text-slate-400">Overall</span>
            {ov && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 tabular">
                AI scored {overall.total_pct}%
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">Verdict</p>
              <Badge
                tone={verdictTone[ov?.verdict ?? overall.verdict] ?? 'slate'}
                className="text-sm px-3 py-1"
              >
                {verdictLabel(ov?.verdict ?? overall.verdict)}
              </Badge>
              {ov && ov.verdict !== overall.verdict && (
                <p className="mt-1.5 text-xs text-slate-400">
                  AI verdict: {verdictLabel(overall.verdict)}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Started</dt>
                <dd className="font-medium text-slate-700">{fmtDate(session.started_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Submitted</dt>
                <dd className="font-medium text-slate-700">{fmtDate(session.submitted_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Time used</dt>
                <dd className="font-medium text-slate-700 tabular">{timeUsedMin} min</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Submission</dt>
                <dd className="font-medium text-slate-700">{session.auto_submitted ? 'Auto-submitted' : 'Manual'}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl bg-slate-50/70 p-5 space-y-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Score components</p>
            <ComponentBar
              label="Senior signal"
              value={ov?.senior_signal_avg ?? overall.senior_signal_avg}
              aiValue={overall.senior_signal_avg}
              emphasis
            />
            <ComponentBar
              label="Core"
              value={ov?.core_avg ?? overall.core_avg}
              aiValue={overall.core_avg}
            />
            <ComponentBar
              label="Trap"
              value={ov?.trap_avg ?? overall.trap_avg}
              aiValue={overall.trap_avg}
            />
            <ComponentBar
              label="Evidence"
              value={ov?.evidence_avg ?? overall.evidence_avg}
              aiValue={overall.evidence_avg}
            />
          </div>
        </CardBody>
      </Card>

      {/* What the headline figures above are actually showing, stated plainly.
          A reader who doesn't know a human intervened would otherwise read the
          overridden numbers as the AI's. */}
      {ov && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
          <UserCheck size={16} className="mt-0.5 shrink-0 text-violet-600" />
          <span>
            <span className="font-medium">
              Showing your overrides: {ov.adjusted_count > 0 && `${ov.adjusted_count} score`}
              {ov.adjusted_count > 0 && ov.adjusted_count !== 1 && 's'}
              {ov.adjusted_count > 0 && ' corrected'}
              {ov.adjusted_count > 0 && ov.disagreed_count > 0 && ', '}
              {ov.disagreed_count > 0 && `${ov.disagreed_count} flagged as disagreed`}.
            </span>{' '}
            The AI scored this session {overall.total_pct}% ·{' '}
            {verdictLabel(overall.verdict)}, and every original score and reasoning is kept
            below.
          </span>
        </div>
      )}

      {/* PROCTORING */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <ShieldCheck size={16} className="text-brand-500" /> Proctoring
          </h3>
          {clean && <Badge tone="emerald">Clean session</Badge>}
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatChip icon={<MonitorSmartphone size={18} />} label="Tab switches" value={proctoring.tab_switch_count} alert={proctoring.tab_switch_count > 2} />
            <StatChip icon={<EyeOff size={18} />} label="Focus loss" value={proctoring.focus_loss_count} alert={proctoring.focus_loss_count > 2} />
            <StatChip icon={<ClipboardPaste size={18} />} label="Paste events" value={pasteCount} alert={pasteCount > 0} />
            <StatChip icon={<Clock size={18} />} label="Idle periods" value={proctoring.idle_count} alert={proctoring.idle_count > 2} />
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="max-w-[95ch] text-sm text-slate-600 leading-relaxed">{proctoring.context_note}</p>
          </div>
        </CardBody>
      </Card>

      {/* PER-QUESTION */}
      {unansweredCount > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">
              {unansweredCount} of {questions.length} question{questions.length === 1 ? '' : 's'} not
              answered.
            </span>{' '}
            {session.auto_submitted
              ? 'The timer expired before the candidate finished.'
              : 'The candidate submitted without answering everything.'}{' '}
            Scores above are averaged over answered questions only.
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-semibold text-slate-700">Question breakdown</h2>
        <span className="text-xs text-slate-400">
          {questions.length} question{questions.length === 1 ? '' : 's'}
          {unansweredCount > 0 && ` · ${questions.length - unansweredCount} answered`}
        </span>
      </div>

      <div className="space-y-5">
        {questions.map((q) => {
          const s = q.score;
          const conf = q.confidence_flag ? confidenceMeta[q.confidence_flag] : null;
          return (
            <Card key={q.position}>
              <CardBody className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge tone="slate">Q{q.position + 1}</Badge>
                      <Badge tone="brand">{q.question.topic}</Badge>
                      <Badge tone={difficultyTone[q.question.difficulty] ?? 'slate'}>{q.question.difficulty}</Badge>
                    </div>
                    <p className="text-[15px] font-medium text-slate-800 leading-snug">{q.question.text}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {/* Three distinct states: unanswered, answered-but-unscored,
                        and scored. Collapsing the first two would hide that the
                        candidate never got to this question. */}
                    {q.answer === null ? (
                      <Badge tone="amber">Not answered</Badge>
                    ) : s ? (
                      <>
                        {/* The operative number leads; the AI's sits under it
                            whenever a human changed it. Never one without the
                            other. */}
                        <p className={cn('text-2xl font-bold tabular leading-none', effectiveTotal(s) >= 70 ? 'text-emerald-600' : effectiveTotal(s) >= 45 ? 'text-amber-600' : 'text-rose-600')}>
                          {effectiveTotal(s)}%
                        </p>
                        {s.override?.total_pct != null ? (
                          <p className="mt-1 text-xs text-slate-400 tabular">
                            AI: {s.total_pct}%
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">score</p>
                        )}
                        {s.override && (
                          <div className="mt-1.5">
                            <OverrideBadge flag={s.override.flag} />
                          </div>
                        )}
                      </>
                    ) : (
                      <Badge tone="rose">Not scored</Badge>
                    )}
                  </div>
                </div>

                {q.answer === null ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">Not answered.</span> The candidate did not submit
                      a response to this question — it does not count toward the scores above.
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3.5">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer</p>
                      {/* On the question rather than only in the session totals:
                          a paste count at the top of the report tells you it
                          happened, not where. */}
                      {q.answer.paste_detected && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          <ClipboardPaste size={11} /> Pasted into this answer
                        </span>
                      )}
                    </div>
                    <p className="max-w-[95ch] text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {q.answer.text || <span className="italic text-slate-400">No answer provided</span>}
                    </p>
                    {/* Beneath the prose, inside the same block: the sketch is
                        part of this answer and was scored as part of it, so
                        reading it as a separate artifact would misrepresent
                        what the numbers below are about. */}
                    {q.answer.snippet_code && (
                      <div className="mt-3">
                        <CodeSnippet
                          code={q.answer.snippet_code}
                          language={q.answer.snippet_language}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Directly under the answer and its paste mark — the three
                    belong together, and reading them apart is what turns
                    context into a guess. */}
                {q.probe && <ProbeBlock probe={q.probe} answerTotal={s?.total_pct ?? null} />}

                {s && (
                  <>
                    <OverrideBanner score={s} />

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
                      <ComponentBar
                        label="Senior signal"
                        value={s.override?.senior_signal_pct ?? s.senior_signal_pct}
                        aiValue={s.senior_signal_pct}
                        emphasis
                      />
                      <ComponentBar
                        label="Core"
                        value={s.override?.core_pct ?? s.core_pct}
                        aiValue={s.core_pct}
                      />
                      <ComponentBar
                        label="Trap"
                        value={s.override?.trap_pct ?? s.trap_pct}
                        aiValue={s.trap_pct}
                      />
                      <ComponentBar
                        label="Evidence"
                        value={s.override?.evidence_pct ?? s.evidence_pct}
                        aiValue={s.evidence_pct}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="rounded-lg bg-emerald-50/60 p-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2.5">
                          <Check size={14} /> What they demonstrated
                        </p>
                        <ul className="space-y-2">
                          {s.what_was_hit.length === 0 && <li className="text-sm text-slate-400">—</li>}
                          {s.what_was_hit.map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                              <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                              <span className="leading-snug">{h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg bg-amber-50/60 p-4">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2.5">
                          <AlertTriangle size={14} /> What they missed
                        </p>
                        <ul className="space-y-2">
                          {s.what_was_missed.length === 0 && <li className="text-sm text-slate-400">—</li>}
                          {s.what_was_missed.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                              <span className="leading-snug">{m}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-lg bg-brand-soft border border-brand-100 p-4">
                      <MessageSquare size={18} className="mt-0.5 shrink-0 text-brand-600" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-0.5">Recommended live probe</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{s.recommended_probe}</p>
                      </div>
                    </div>

                    {/* The only thing `readOnly` removes. An override that
                        already exists is still rendered above, with both
                        numbers — a guest reads the same truth the owner does,
                        they just cannot change it. */}
                    {!readOnly && onSaveOverride && onClearOverride && (
                      <ScoreOverrideEditor
                        score={s}
                        onSave={(body) => onSaveOverride(q.question.id, body)}
                        onClear={() => onClearOverride(q.question.id)}
                      />
                    )}
                  </>
                )}

                {q.confidence_rating != null && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-2 text-sm text-slate-500">
                      <Gauge size={15} className="text-slate-400" />
                      Self-rated <span className="font-semibold text-slate-700 tabular">{q.confidence_rating}/5</span>
                    </span>
                    {conf && <Badge tone={conf.tone}>{conf.label}</Badge>}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
