import type { Difficulty, ReportResponse, ReportScore } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { verdictFor } from '../utils/score-calc.js';
import { sendReportReady } from './email.service.js';

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
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
          score: true,
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
