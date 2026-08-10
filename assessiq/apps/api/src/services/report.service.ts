import type {
  Difficulty,
  ReportOverallOverride,
  ReportResponse,
  ReportScore,
  ReportView,
  ScoreOverride,
  SetScoreOverrideRequest,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { verdictFor, weightedTotal } from '../utils/score-calc.js';
import { sendReportReady } from './email.service.js';

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// The shape getReport reads an override off. Only the columns it needs.
type OverridableScore = {
  core_pct: number;
  senior_signal_pct: number;
  trap_pct: number;
  evidence_pct: number;
  total_pct: number;
  override_flag: 'adjusted' | 'disagree' | null;
  override_note: string | null;
  overridden_total_pct: number | null;
  overridden_core_pct: number | null;
  overridden_senior_signal_pct: number | null;
  overridden_trap_pct: number | null;
  overridden_evidence_pct: number | null;
  overridden_at: Date | null;
  overridden_by_user: { name: string | null; email: string } | null;
};

// An override is present only when a flag was set. Note and timestamp are
// written together with it, so they are non-null in practice; the fallbacks
// keep a hand-edited row from throwing.
function overrideOf(s: OverridableScore): ScoreOverride | null {
  if (!s.override_flag) return null;
  return {
    flag: s.override_flag,
    note: s.override_note ?? '',
    total_pct: s.overridden_total_pct,
    core_pct: s.overridden_core_pct,
    senior_signal_pct: s.overridden_senior_signal_pct,
    trap_pct: s.overridden_trap_pct,
    evidence_pct: s.overridden_evidence_pct,
    by: s.overridden_by_user?.name ?? s.overridden_by_user?.email ?? null,
    at: (s.overridden_at ?? new Date(0)).toISOString(),
  };
}

// What a number resolves to once the override is taken into account. A null
// override component means "the interviewer did not touch this one", so the
// AI's value stands.
const effective = (overridden: number | null, ai: number): number => overridden ?? ai;

// Session figures recomputed with every override applied. Returns null when
// nothing is overridden, which is what tells the UI to show the AI block alone.
function overallOverride(scores: OverridableScore[]): ReportOverallOverride | null {
  const overridden = scores.filter((s) => s.override_flag);
  if (overridden.length === 0) return null;

  const core = avg(scores.map((s) => effective(s.overridden_core_pct, s.core_pct)));
  const senior = avg(
    scores.map((s) => effective(s.overridden_senior_signal_pct, s.senior_signal_pct)),
  );
  const trap = avg(scores.map((s) => effective(s.overridden_trap_pct, s.trap_pct)));
  const evidence = avg(scores.map((s) => effective(s.overridden_evidence_pct, s.evidence_pct)));
  const total = avg(scores.map((s) => effective(s.overridden_total_pct, s.total_pct)));

  return {
    total_pct: total,
    // Same rule as the AI verdict (docs/04) — senior signal leads. Overriding
    // senior signal is therefore the thing that can actually move a verdict,
    // which is why per-component override exists at all.
    verdict: verdictFor(senior, total),
    core_avg: core,
    senior_signal_avg: senior,
    trap_avg: trap,
    evidence_avg: evidence,
    adjusted_count: overridden.filter((s) => s.override_flag === 'adjusted').length,
    disagreed_count: overridden.filter((s) => s.override_flag === 'disagree').length,
  };
}

function proctoringNote(counts: {
  tab: number;
  focus: number;
  paste: number;
  idle: number;
}): string {
  const flags: string[] = [];
  if (counts.tab > 0) flags.push(`${counts.tab} tab switch${counts.tab === 1 ? '' : 'es'}`);
  if (counts.focus > 0) flags.push(`${counts.focus} focus loss${counts.focus === 1 ? '' : 'es'}`);
  if (counts.paste > 0) flags.push(`${counts.paste} paste event${counts.paste === 1 ? '' : 's'}`);
  if (counts.idle > 0) flags.push(`${counts.idle} idle period${counts.idle === 1 ? '' : 's'}`);
  if (flags.length === 0) {
    return 'Clean session — no tab switches, focus loss, paste, or idle events were logged.';
  }
  return `Logged ${flags.join(', ')}. Surfaced as context for the interviewer, not as an automatic flag.`;
}

// Compile the Report once every answer in the session is scored (or failed).
export async function compileReport(sessionId: string): Promise<void> {
  const existing = await prisma.report.findUnique({ where: { session_id: sessionId } });
  if (existing) return;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      answers: { include: { score: true } },
      behavior_events: { select: { type: true } },
      assessment: { select: { title: true, owner: { select: { email: true } } } },
    },
  });
  if (!session) return;

  const scores = session.answers.map((a) => a.score).filter((s): s is NonNullable<typeof s> => !!s);
  const overall = avg(scores.map((s) => s.total_pct));
  const seniorAvg = avg(scores.map((s) => s.senior_signal_pct));
  const verdict = verdictFor(seniorAvg, overall);

  const counts = {
    tab: session.behavior_events.filter((e) => e.type === 'tab_switch').length,
    focus: session.behavior_events.filter((e) => e.type === 'focus_loss').length,
    paste: session.behavior_events.filter((e) => e.type === 'paste').length,
    idle: session.behavior_events.filter((e) => e.type === 'idle').length,
  };

  await prisma.report.create({
    data: {
      session_id: sessionId,
      overall_pct: overall,
      verdict,
      tab_switch_count: counts.tab,
      focus_loss_count: counts.focus,
      paste_count: counts.paste,
      idle_count: counts.idle,
      proctoring_context: proctoringNote(counts),
    },
  });

  // Notify the interviewer (guarded — logs when no email key). Never block on it.
  try {
    const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    await sendReportReady(session.assessment.owner.email, {
      candidateLabel: session.candidate_label ?? 'Candidate',
      overallPct: overall,
      verdict,
      reportUrl: `${baseUrl}/reports/${sessionId}`,
    });
  } catch (err) {
    console.error('[report] email notification failed (non-fatal):', err);
  }
  // TODO (later): render PDF (Puppeteer → R2) and attach to the report.
}

// ── GET /reports/session/:id ─────────────────────────────────────────────────
export async function getReport(
  ownerId: string,
  sessionId: string,
): Promise<{ code: number; body: ReportResponse }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      assessment: {
        select: {
          title: true,
          timer_seconds: true,
          owner_id: true,
          // The report is driven by what the assessment ASKED, not by what came
          // back — otherwise a question the candidate never answered vanishes
          // and the manager cannot tell they didn't finish.
          questions: {
            orderBy: { position: 'asc' },
            select: {
              position: true,
              question: { select: { id: true, text: true, topic: true, difficulty: true } },
            },
          },
        },
      },
      answers: {
        orderBy: { position: 'asc' },
        include: {
          question: { select: { id: true, text: true, topic: true, difficulty: true } },
          score: {
            include: {
              // Attribution for an override — the report names who disagreed.
              overridden_by_user: { select: { name: true, email: true } },
            },
          },
        },
      },
      behavior_events: true,
      report: true,
    },
  });
  // Not found OR not owned → 404 (don't leak existence of others' sessions).
  if (!session || session.assessment.owner_id !== ownerId) {
    throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
  }

  const totalAnswers = session.answers.length;
  const scoredCount = session.answers.filter((a) => a.score).length;

  if (!session.report) {
    return {
      code: 202,
      body: { status: 'scoring_in_progress', answers_scored: scoredCount, total_answers: totalAnswers },
    };
  }

  const scores = session.answers.map((a) => a.score).filter((s): s is NonNullable<typeof s> => !!s);
  const timeUsed =
    session.submitted_at && session.started_at
      ? session.submitted_at.getTime() - session.started_at.getTime()
      : 0;

  const pastedPositions = new Set(
    session.behavior_events.filter((e) => e.type === 'paste').map((e) => e.question_index),
  );

  const answersByQuestion = new Map(session.answers.map((a) => [a.question_id, a]));

  return {
    code: 200,
    body: {
      session: {
        id: session.id,
        candidate_label: session.candidate_label,
        started_at: session.started_at?.toISOString() ?? null,
        submitted_at: session.submitted_at?.toISOString() ?? null,
        time_used_ms: timeUsed,
        auto_submitted: session.auto_submitted,
      },
      assessment: { title: session.assessment.title, timer_seconds: session.assessment.timer_seconds },
      overall: {
        total_pct: session.report.overall_pct,
        verdict: session.report.verdict,
        core_avg: avg(scores.map((s) => s.core_pct)),
        senior_signal_avg: avg(scores.map((s) => s.senior_signal_pct)),
        trap_avg: avg(scores.map((s) => s.trap_pct)),
        evidence_avg: avg(scores.map((s) => s.evidence_pct)),
        // Sits beside the AI figures above, which stay exactly as scored.
        override: overallOverride(scores),
      },
      proctoring: {
        tab_switch_count: session.report.tab_switch_count,
        tab_switch_timestamps: session.behavior_events
          .filter((e) => e.type === 'tab_switch')
          .map((e) => ({ timestamp: Number(e.timestamp), question_index: e.question_index })),
        focus_loss_count: session.report.focus_loss_count,
        paste_events: session.behavior_events
          .filter((e) => e.type === 'paste')
          .map((e) => ({
            timestamp: Number(e.timestamp),
            question_index: e.question_index,
            char_count: e.char_count ?? 0,
          })),
        idle_count: session.report.idle_count,
        context_note: session.report.proctoring_context,
      },
      // Walk the assessment's questions, not the answers, so unanswered ones
      // are present with answer: null. Falls back to the answer list if the
      // assessment has no question rows (shouldn't happen, but a report that
      // renders beats one that throws).
      questions: (session.assessment.questions.length
        ? session.assessment.questions.map((aq) => ({
            position: aq.position,
            question: aq.question,
            answer: answersByQuestion.get(aq.question.id) ?? null,
          }))
        : session.answers.map((a) => ({
            position: a.position,
            question: a.question,
            answer: a,
          }))
      ).map(({ position, question, answer: a }) => {
        const score: ReportScore | null = a?.score
          ? {
              total_pct: a.score.total_pct,
              core_pct: a.score.core_pct,
              core_reasoning: a.score.core_reasoning,
              senior_signal_pct: a.score.senior_signal_pct,
              senior_signal_reasoning: a.score.senior_signal_reasoning,
              trap_pct: a.score.trap_pct,
              trap_reasoning: a.score.trap_reasoning,
              evidence_pct: a.score.evidence_pct,
              evidence_reasoning: a.score.evidence_reasoning,
              what_was_hit: a.score.what_was_hit,
              what_was_missed: a.score.what_was_missed,
              recommended_probe: a.score.recommended_probe,
              override: overrideOf(a.score),
            }
          : null;
        return {
          position,
          question: {
            id: question.id,
            text: question.text,
            topic: question.topic,
            difficulty: question.difficulty as Difficulty,
          },
          // null means the candidate never submitted this one — the UI renders
          // it as "Not answered" rather than dropping the row.
          answer: a
            ? {
                text: a.text,
                time_spent_ms: a.time_spent_ms,
                paste_detected: pastedPositions.has(a.position),
              }
            : null,
          score,
          confidence_rating: a?.confidence_rating ?? null,
          confidence_flag: a?.score?.confidence_flag ?? null,
        };
      }),
      pdf_url: session.report.pdf_url,
    },
  };
}

// ── Score override ───────────────────────────────────────────────────────────
// The interviewer has the final say over a score, but the AI's own numbers are
// the evidence of how the rubric was applied — so nothing here writes to the
// scorer's columns. Every mutation below touches `override*`/`overridden*` only.

// Locate the score for one question of one session, refusing anything this
// interviewer doesn't own. 404 rather than 403 throughout, so the endpoint
// never confirms that someone else's session exists.
async function findOwnedScore(ownerId: string, sessionId: string, questionId: string) {
  const answer = await prisma.answer.findFirst({
    where: { session_id: sessionId, question_id: questionId },
    select: {
      score: { select: { id: true } },
      session: { select: { assessment: { select: { owner_id: true } } } },
    },
  });
  if (!answer || answer.session.assessment.owner_id !== ownerId) {
    throw new AppError(404, 'ANSWER_NOT_FOUND', 'No answer for that question in this session');
  }
  if (!answer.score) {
    // An unanswered or still-scoring question has nothing to disagree with yet.
    throw new AppError(409, 'NOT_SCORED', 'This answer has not been scored yet');
  }
  return answer.score.id;
}

export async function setScoreOverride(
  ownerId: string,
  sessionId: string,
  questionId: string,
  input: SetScoreOverrideRequest,
): Promise<ReportView> {
  const scoreId = await findOwnedScore(ownerId, sessionId, questionId);
  const ai = await prisma.score.findUniqueOrThrow({
    where: { id: scoreId },
    select: { core_pct: true, senior_signal_pct: true, trap_pct: true, evidence_pct: true },
  });

  const components = {
    core: input.core_pct ?? null,
    senior: input.senior_signal_pct ?? null,
    trap: input.trap_pct ?? null,
    evidence: input.evidence_pct ?? null,
  };
  const touchedComponent = Object.values(components).some((v) => v !== null);
  const hasNumbers = input.total_pct !== undefined || touchedComponent;

  // 'adjusted' claims a correction, so it must carry one. 'disagree' need not —
  // registering "this is wrong" without inventing a figure is the whole point.
  if (input.flag === 'adjusted' && !hasNumbers) {
    throw new AppError(
      400,
      'VALIDATION',
      'An adjusted score needs a corrected total or at least one component',
    );
  }

  // An explicit total wins verbatim: a manager may judge an answer a 65 overall
  // regardless of what the weighting produces. Otherwise, when a component was
  // corrected, the total is recomputed under the same weighting the scorer uses
  // (docs/04) — leaving the AI total standing beside a changed component would
  // be internally inconsistent.
  const overriddenTotal =
    input.total_pct !== undefined
      ? input.total_pct
      : touchedComponent
        ? weightedTotal(
            effective(components.core, ai.core_pct),
            effective(components.senior, ai.senior_signal_pct),
            effective(components.trap, ai.trap_pct),
            effective(components.evidence, ai.evidence_pct),
          )
        : null;

  await prisma.score.update({
    where: { id: scoreId },
    data: {
      override_flag: input.flag,
      override_note: input.note.trim(),
      overridden_total_pct: overriddenTotal,
      overridden_core_pct: components.core,
      overridden_senior_signal_pct: components.senior,
      overridden_trap_pct: components.trap,
      overridden_evidence_pct: components.evidence,
      overridden_by: ownerId,
      overridden_at: new Date(),
    },
  });

  // Return the whole report: an override moves the session totals and verdict
  // too, and a client that re-derived those itself would drift from the server.
  return (await getReport(ownerId, sessionId)).body as ReportView;
}

// Undo. Clears the override columns and leaves the AI score exactly as it was —
// which it always was, since nothing here ever wrote to it.
export async function clearScoreOverride(
  ownerId: string,
  sessionId: string,
  questionId: string,
): Promise<ReportView> {
  const scoreId = await findOwnedScore(ownerId, sessionId, questionId);
  await prisma.score.update({
    where: { id: scoreId },
    data: {
      override_flag: null,
      override_note: null,
      overridden_total_pct: null,
      overridden_core_pct: null,
      overridden_senior_signal_pct: null,
      overridden_trap_pct: null,
      overridden_evidence_pct: null,
      overridden_by: null,
      overridden_at: null,
    },
  });
  return (await getReport(ownerId, sessionId)).body as ReportView;
}
