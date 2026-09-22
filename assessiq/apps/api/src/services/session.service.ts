import { BehaviorEventType as DbBehaviorEventType } from '@prisma/client';
import type {
  BehaviorEventInput,
  SaveDraftRequest,
  SaveDraftResponse,
  LinkValidateResponse,
  ProctoringConfig,
  QuestionViewResponse,
  StartSessionResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  SubmitProbeAnswerResponse,
  SubmitSessionResponse,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { signCandidateToken } from '../lib/jwt.js';
import { AppError } from '../middleware/error.middleware.js';
import { scoringQueue } from '../queues/scoring.queue.js';
import { isSnippetLanguage } from '@assessiq/types';
import { answerWithSnippet, normalizeSnippet } from '../utils/snippet.js';
import {
  createProbeForAnswer,
  finalizeOpenProbes,
  pasteSignalFor,
  probeIsDue,
  submitProbeAnswer,
} from './probe.service.js';

function proctoringEnabled(config: unknown): boolean {
  const pc = config as ProctoringConfig | null;
  return Boolean(
    pc && (pc.track_tab_switches || pc.track_focus_loss || pc.detect_paste || pc.detect_idle),
  );
}

// ── GET /sessions/link/:token — validate a link (public) ─────────────────────
export async function validateLink(token: string): Promise<LinkValidateResponse> {
  const link = await prisma.assessmentLink.findUnique({
    where: { token },
    include: {
      session: { select: { status: true } },
      assessment: {
        include: {
          owner: { select: { company: true } },
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!link) throw new AppError(404, 'LINK_INVALID', 'Link not found or expired');
  if (link.expires_at.getTime() < Date.now()) {
    throw new AppError(410, 'LINK_INVALID', 'Link not found or expired');
  }

  // An UNFINISHED session on this link is a candidate coming back, not a link
  // being reused. Before drafts existed this was a 409 and a closed door: a
  // reload, a crashed tab or a flat battery ended the assessment. Saving
  // someone's work and then refusing to let them return to it would be a
  // strange kind of robustness.
  const resumable = Boolean(link.session && link.session.status === 'in_progress');
  if (link.session_id && !resumable) {
    throw new AppError(409, 'LINK_USED', 'This link has already been used');
  }

  // First view marks the link opened (idempotent).
  if (!link.opened_at) {
    await prisma.assessmentLink.update({ where: { id: link.id }, data: { opened_at: new Date() } });
  }

  const a = link.assessment;
  return {
    valid: true,
    assessment: {
      title: a.title,
      question_count: a._count.questions,
      timer_seconds: a.timer_seconds,
      proctoring_enabled: proctoringEnabled(a.proctoring_config),
      confidence_rating_enabled: a.confidence_rating_enabled,
      company_name: a.owner.company,
      // Disclosed here and nowhere later: the candidate learns that follow-ups
      // exist BEFORE they agree to start, exactly as they do about proctoring.
      probes_enabled: a.probes_mode !== 'off',
      probe_time_seconds: a.probe_time_seconds,
    },
    resumable,
  };
}

/**
 * Pick an unfinished session back up.
 *
 * The session id and its answers are untouched; all that changes is a new
 * short-lived token and a fresh look at where they had got to. If the timer
 * elapsed while they were away, closing it here is exactly what should happen
 * — including the scoring that closing now queues.
 */
async function resumeSession(sessionId: string): Promise<StartSessionResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  const deadline = sessionDeadlineMs(s);
  if (deadline !== null && Date.now() > deadline) {
    await closeExpiredSession(s.id);
    throw new AppError(410, 'SESSION_EXPIRED', 'Time is up — your assessment has been submitted');
  }

  const position = Math.min(s._count.answers, s.assessment.questions.length - 1);
  const aq = s.assessment.questions[position];
  if (!aq) throw new AppError(400, 'NO_QUESTIONS', 'Assessment has no questions');

  const sessionToken = signCandidateToken(s.id);
  await prisma.session.update({ where: { id: s.id }, data: { session_token: sessionToken } });

  return {
    session_id: s.id,
    session_token: sessionToken,
    expires_at:
      deadline !== null ? new Date(deadline).toISOString() : null,
    first_question: { position: aq.position, question: aq.question },
  };
}

// ── POST /sessions/start — create a session from a link (public) ─────────────
export async function startSession(linkToken: string): Promise<StartSessionResponse> {
  const link = await prisma.assessmentLink.findUnique({
    where: { token: linkToken },
    include: {
      session: { select: { id: true, status: true } },
      assessment: {
        include: {
          questions: {
            orderBy: { position: 'asc' },
            include: { question: { select: { id: true, text: true, topic: true } } },
          },
        },
      },
    },
  });

  if (!link) throw new AppError(404, 'LINK_INVALID', 'Link not found or expired');
  if (link.expires_at.getTime() < Date.now()) {
    throw new AppError(410, 'LINK_INVALID', 'Link not found or expired');
  }

  const a = link.assessment;

  // Coming back to an unfinished session: hand them a fresh token and the
  // question they were on. The timer is unchanged — it has been running the
  // whole time, which is the point of anchoring it to started_at rather than
  // to whether a tab happened to be open.
  if (link.session && link.session.status === 'in_progress') {
    return resumeSession(link.session.id);
  }
  if (link.session_id) throw new AppError(409, 'LINK_USED', 'This link has already been used');

  const first = a.questions[0];
  if (!first) throw new AppError(400, 'NO_QUESTIONS', 'Assessment has no questions');

  const startedAt = new Date();
  const session = await prisma.session.create({
    data: {
      assessment_id: a.id,
      candidate_label: link.candidate_label,
      status: 'in_progress',
      started_at: startedAt,
    },
  });

  const sessionToken = signCandidateToken(session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: { session_token: sessionToken },
  });
  await prisma.assessmentLink.update({
    where: { id: link.id },
    data: { session_id: session.id, opened_at: link.opened_at ?? startedAt },
  });

  const expiresAt =
    a.timer_enabled && a.timer_seconds
      ? new Date(startedAt.getTime() + a.timer_seconds * 1000).toISOString()
      : null;

  return {
    session_id: session.id,
    session_token: sessionToken,
    expires_at: expiresAt,
    first_question: { position: first.position, question: first.question },
  };
}

// ── Shared session loading + guards ──────────────────────────────────────────
async function loadSessionWithAssessment(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      assessment: {
        include: {
          questions: {
            orderBy: { position: 'asc' },
            include: { question: { select: { id: true, text: true, topic: true } } },
          },
        },
      },
      _count: { select: { answers: true } },
    },
  });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  return session;
}

type LoadedSession = Awaited<ReturnType<typeof loadSessionWithAssessment>>;

function sessionDeadlineMs(s: LoadedSession): number | null {
  if (s.assessment.timer_enabled && s.assessment.timer_seconds && s.started_at) {
    return s.started_at.getTime() + s.assessment.timer_seconds * 1000;
  }
  return null;
}

/**
 * How long past the deadline the server still accepts a write.
 *
 * Ten seconds, and it buys exactly two things: the autosave that was in flight
 * when the clock hit zero, and the difference between the candidate's clock and
 * ours. It is NOT extra time — the visible timer still reaches zero when it
 * reaches zero, the UI still closes, and nothing here lets anyone keep typing.
 * What it prevents is losing the last three seconds of someone's answer to a
 * race we created.
 */
export const EXPIRY_GRACE_SECONDS = 10;

/**
 * Close an expired session properly.
 *
 * Three things have to happen and, before this wave, only the first two did:
 * the session is marked submitted, open probes are finalised, AND the answers
 * are queued for scoring. Without the third a candidate whose tab died past the
 * deadline got no report at all — the session sat submitted and unscored
 * forever (follow-up #7).
 *
 * Drafts are promoted first, so what gets scored includes the answer they were
 * in the middle of writing.
 */
async function closeExpiredSession(sessionId: string): Promise<void> {
  await promoteDraftsToAnswers(sessionId);
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'submitted', submitted_at: new Date(), auto_submitted: true },
  });
  // A probe still on screen when the session clock ran out was not answered.
  await finalizeOpenProbes(sessionId);
  await enqueueScoring(sessionId);
}

/**
 * Turn whatever the candidate had typed into answers.
 *
 * Only drafts with no answer behind them and something actually written — an
 * empty box is not an answer, and promoting it would put a 0% on the report for
 * a question they never reached. The source is recorded so the report can say
 * where this came from rather than implying they pressed submit.
 */
async function promoteDraftsToAnswers(sessionId: string): Promise<void> {
  const drafts = await prisma.answerDraft.findMany({ where: { session_id: sessionId } });
  if (drafts.length === 0) return;

  const answered = new Set(
    (
      await prisma.answer.findMany({
        where: { session_id: sessionId },
        select: { question_id: true },
      })
    ).map((a) => a.question_id),
  );

  for (const draft of drafts) {
    if (answered.has(draft.question_id)) continue;
    const snippet = normalizeSnippet(draft.snippet_code, draft.snippet_language);
    if (draft.text.trim().length === 0 && !snippet.code) continue;

    await prisma.answer.create({
      data: {
        session_id: sessionId,
        question_id: draft.question_id,
        position: draft.position,
        text: draft.text,
        snippet_code: snippet.code,
        snippet_language: snippet.language,
        // The clock, not the candidate, ended this one.
        source: 'draft_at_expiry',
        // Unknowable from a draft: it was never "submitted" at a moment we can
        // point to. Zero is the honest answer, and the report reads time from
        // the session anyway.
        time_spent_ms: 0,
        scoring_status: 'pending',
      },
    });
  }

  await prisma.answerDraft.deleteMany({ where: { session_id: sessionId } });
}

/**
 * Throws if the session is closed. Auto-submits (once) if the timer elapsed.
 *
 * `graceAllowed` is for writes that are allowed to land slightly late — a draft
 * autosave, and the final answer riding on it. Everything else sees the
 * deadline exactly where the candidate saw it.
 *
 * Returns how many milliseconds past the deadline the write was, or null when
 * it was inside the timer. Callers record that as a `late_write` event.
 */
async function ensureActive(
  s: LoadedSession,
  opts: { graceAllowed?: boolean } = {},
): Promise<number | null> {
  if (s.status === 'submitted' || s.status === 'expired') {
    throw new AppError(400, 'SESSION_CLOSED', 'This session has already been submitted');
  }
  const deadline = sessionDeadlineMs(s);
  if (deadline === null) return null;

  const pastBy = Date.now() - deadline;
  if (pastBy <= 0) return null;

  if (opts.graceAllowed && pastBy <= EXPIRY_GRACE_SECONDS * 1000) return pastBy;

  await closeExpiredSession(s.id);
  throw new AppError(400, 'SESSION_EXPIRED', 'Time is up — your assessment has been submitted');
}

// ── GET /sessions/:id/question/:position ─────────────────────────────────────
export async function getQuestion(
  sessionId: string,
  position: number,
): Promise<QuestionViewResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  if (s.status === 'submitted' || s.status === 'expired') {
    throw new AppError(409, 'SESSION_CLOSED', 'This session has already been submitted');
  }
  const total = s.assessment.questions.length;
  if (position < 0 || position >= total) {
    throw new AppError(404, 'POSITION_INVALID', 'No question at that position');
  }
  const answered = s._count.answers;
  if (position > answered) {
    throw new AppError(403, 'NOT_REACHED', 'You have not reached this question yet');
  }
  if (position < answered) {
    throw new AppError(409, 'ALREADY_ANSWERED', 'This question has already been answered');
  }
  const aq = s.assessment.questions[position];
  if (!aq) throw new AppError(404, 'POSITION_INVALID', 'No question at that position');

  // Whatever they had typed here before the page went away. This is the whole
  // point of drafts: a reload, a crashed tab or a closed laptop lid returns to
  // the words that were on screen.
  const draft = await prisma.answerDraft.findUnique({
    where: { session_id_question_id: { session_id: sessionId, question_id: aq.question.id } },
  });

  const deadline = sessionDeadlineMs(s);
  return {
    position,
    total,
    question: aq.question,
    time_remaining_ms: deadline !== null ? Math.max(0, deadline - Date.now()) : null,
    draft: draft
      ? {
          text: draft.text,
          snippet_code: draft.snippet_code,
          snippet_language: isSnippetLanguage(draft.snippet_language)
            ? draft.snippet_language
            : null,
          saved_at: draft.saved_at.toISOString(),
        }
      : null,
  };
}

// ── PUT /sessions/:id/questions/:questionId/draft ────────────────────────────
/**
 * Save work in progress. Called on a debounce while typing, on blur, and before
 * leaving a question.
 *
 * Deliberately forgiving: it accepts writes inside the expiry grace window, it
 * never advances anything, and it is the one candidate write that is allowed to
 * be slightly late — the autosave racing the clock is exactly what the grace
 * exists for.
 */
export async function saveDraft(
  sessionId: string,
  questionId: string,
  body: SaveDraftRequest,
): Promise<SaveDraftResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  const lateBy = await ensureActive(s, { graceAllowed: true });

  const aq = s.assessment.questions.find((q) => q.question.id === questionId);
  if (!aq) throw new AppError(400, 'QUESTION_MISMATCH', 'That question is not in this assessment');

  // Already answered: the draft has served its purpose and must not resurrect
  // as a competing version of a question that is closed.
  const existing = await prisma.answer.findUnique({
    where: { session_id_question_id: { session_id: sessionId, question_id: questionId } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'ALREADY_ANSWERED', 'This question has been answered');

  const snippet = normalizeSnippet(body.snippet_code, body.snippet_language);
  const data = {
    text: body.text,
    snippet_code: snippet.code,
    snippet_language: snippet.language,
    position: aq.position,
  };
  const draft = await prisma.answerDraft.upsert({
    where: { session_id_question_id: { session_id: sessionId, question_id: questionId } },
    create: { session_id: sessionId, question_id: questionId, ...data },
    update: data,
  });

  // Recorded rather than hidden: the report is entitled to say a write landed
  // after the bell. It is expected mechanics, not a flag, and the report frames
  // it that way.
  if (lateBy !== null) {
    await prisma.behaviorEvent.create({
      data: {
        session_id: sessionId,
        type: 'late_write',
        timestamp: BigInt(Date.now()),
        question_index: aq.position,
        idle_duration_ms: Math.round(lateBy),
      },
    });
  }

  return { saved_at: draft.saved_at.toISOString(), late_by_ms: lateBy };
}

// ── POST /sessions/:id/answers ───────────────────────────────────────────────
export async function submitAnswer(
  sessionId: string,
  body: SubmitAnswerRequest,
): Promise<SubmitAnswerResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  // The submit that rides on the last autosave gets the same grace the autosave
  // does — otherwise the two disagree about whether the answer exists.
  const lateBy = await ensureActive(s, { graceAllowed: true });

  const total = s.assessment.questions.length;
  const answered = s._count.answers;
  if (body.position !== answered) {
    if (body.position < answered) {
      throw new AppError(400, 'ALREADY_ANSWERED', 'This question has already been answered');
    }
    throw new AppError(400, 'OUT_OF_ORDER', 'Answer questions in order');
  }
  const aq = s.assessment.questions[body.position];
  if (!aq) throw new AppError(400, 'POSITION_INVALID', 'No question at that position');
  if (aq.question.id !== body.question_id) {
    throw new AppError(400, 'QUESTION_MISMATCH', 'question_id does not match this position');
  }

  // The optional code sketch. Normalised once, here, and used everywhere this
  // answer is read afterwards — an empty box becomes NULL rather than '' so
  // that "no sketch" is one fact in the database instead of two.
  const snippet = normalizeSnippet(body.snippet_code, body.snippet_language);

  const mode = s.assessment.probes_mode;
  // Only looked up when probes are on: with mode `off` this function must do
  // exactly what it did before the feature existed, down to the query count.
  const paste =
    mode === 'off'
      ? { detected: false, maxChars: null }
      : await pasteSignalFor(sessionId, body.position);

  const answer = await prisma.answer.create({
    data: {
      session_id: sessionId,
      question_id: body.question_id,
      position: body.position,
      text: body.text,
      snippet_code: snippet.code,
      snippet_language: snippet.language,
      confidence_rating: body.confidence_rating ?? null,
      time_spent_ms: body.time_spent_ms,
      scoring_status: 'pending',
      // The report derives its own paste marks from the behaviour events; this
      // records what the PROBE DECISION was made on, which is not the same
      // thing once you are trying to explain why a follow-up did or didn't fire.
      paste_detected: paste.detected,
      paste_char_count: paste.maxChars,
    },
  });

  // The draft is spent: the answer is the record now, and leaving the draft
  // would let expiry promote a second version of a question already answered.
  await prisma.answerDraft.deleteMany({
    where: { session_id: sessionId, question_id: body.question_id },
  });

  if (lateBy !== null) {
    await prisma.behaviorEvent.create({
      data: {
        session_id: sessionId,
        type: 'late_write',
        timestamp: BigInt(Date.now()),
        question_index: body.position,
        idle_duration_ms: Math.round(lateBy),
      },
    });
  }

  let probe = null;
  if (probeIsDue(mode, paste.detected)) {
    // The rubric guides are needed to judge where "one level deeper" is, and
    // they are private — fetched here rather than widened into the session's
    // question select, which is the shape the candidate receives.
    const guides = await prisma.question.findUnique({
      where: { id: body.question_id },
      select: {
        text: true,
        core_answer_guide: true,
        senior_signal_guide: true,
        trap_guide: true,
      },
    });
    if (guides) {
      probe = await createProbeForAnswer(
        answer.id,
        guides,
        // The sketch goes in with the prose: a follow-up written from a line of
        // the candidate's own code is the strongest defense test available, and
        // it is only available if the generator can see the code.
        answerWithSnippet(body.text, snippet.code, snippet.language),
        s.assessment.probe_time_seconds,
      );
    }
  }

  const next_position = body.position + 1 < total ? body.position + 1 : null;
  return { answer_id: answer.id, next_position, probe };
}

// ── POST /sessions/:id/probes/:probeId/answer ────────────────────────────────
// The defense. Session guards are the same ones an answer goes through, so a
// session that expires under a probe ends the way it always has — with "Time's
// up" rather than a silent jump.
export async function answerProbe(
  sessionId: string,
  probeId: string,
  body: { text: string; time_spent_ms: number },
): Promise<SubmitProbeAnswerResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  await ensureActive(s);
  return submitProbeAnswer(sessionId, probeId, body);
}

// ── POST /sessions/:id/events ────────────────────────────────────────────────
export async function recordEvents(
  sessionId: string,
  events: BehaviorEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  await prisma.behaviorEvent.createMany({
    data: events.map((e) => ({
      session_id: sessionId,
      type: e.type as DbBehaviorEventType,
      timestamp: BigInt(Math.round(e.timestamp)),
      question_index: e.question_index,
      char_count: e.char_count ?? null,
      idle_duration_ms: e.idle_duration_ms ?? null,
    })),
  });
}

// ── POST /sessions/:id/submit ────────────────────────────────────────────────
export async function submitSession(sessionId: string): Promise<SubmitSessionResponse> {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!s) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');

  if (s.status !== 'submitted' && s.status !== 'expired') {
    // Anything typed and not submitted becomes an answer. In the normal flow
    // there is nothing here — answering a question deletes its draft — so this
    // only ever catches the question that was open when the clock ran out.
    await promoteDraftsToAnswers(sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'submitted', submitted_at: new Date() },
    });
  }
  // Before scoring, not after: the scorer reads a probe's status to decide
  // whether there is a defense to score, and `generated` means "still on
  // screen", which nothing is once the session is submitted.
  await finalizeOpenProbes(sessionId);
  await enqueueScoring(sessionId);
  return { ok: true, message: 'Your assessment has been submitted. Thank you.' };
}

// Enqueue a scoring job per answer (idempotent-ish: only queues unscored answers).
async function enqueueScoring(sessionId: string): Promise<void> {
  const answers = await prisma.answer.findMany({
    where: { session_id: sessionId, scoring_status: 'pending' },
    select: { id: true },
  });
  if (answers.length === 0) return;
  await scoringQueue.addBulk(
    answers.map((a) => ({ name: 'score', data: { answerId: a.id, sessionId } })),
  );
}
