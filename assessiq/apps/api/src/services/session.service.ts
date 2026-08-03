import { BehaviorEventType as DbBehaviorEventType } from '@prisma/client';
import type {
  BehaviorEventInput,
  LinkValidateResponse,
  ProctoringConfig,
  QuestionViewResponse,
  StartSessionResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  SubmitSessionResponse,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { signCandidateToken } from '../lib/jwt.js';
import { AppError } from '../middleware/error.middleware.js';
import { scoringQueue } from '../queues/scoring.queue.js';

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
  if (link.session_id) throw new AppError(409, 'LINK_USED', 'This link has already been used');

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
    },
  };
}

// ── POST /sessions/start — create a session from a link (public) ─────────────
export async function startSession(linkToken: string): Promise<StartSessionResponse> {
  const link = await prisma.assessmentLink.findUnique({
    where: { token: linkToken },
    include: {
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
  if (link.session_id) throw new AppError(409, 'LINK_USED', 'This link has already been used');

  const a = link.assessment;
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

// Throws if the session is closed. Auto-submits (once) if the timer has elapsed.
async function ensureActive(s: LoadedSession): Promise<void> {
  if (s.status === 'submitted' || s.status === 'expired') {
    throw new AppError(400, 'SESSION_CLOSED', 'This session has already been submitted');
  }
  const deadline = sessionDeadlineMs(s);
  if (deadline !== null && Date.now() > deadline) {
    await prisma.session.update({
      where: { id: s.id },
      data: { status: 'submitted', submitted_at: new Date(), auto_submitted: true },
    });
    throw new AppError(400, 'SESSION_EXPIRED', 'Time is up — your assessment has been submitted');
  }
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

  const deadline = sessionDeadlineMs(s);
  return {
    position,
    total,
    question: aq.question,
    time_remaining_ms: deadline !== null ? Math.max(0, deadline - Date.now()) : null,
  };
}

// ── POST /sessions/:id/answers ───────────────────────────────────────────────
export async function submitAnswer(
  sessionId: string,
  body: SubmitAnswerRequest,
): Promise<SubmitAnswerResponse> {
  const s = await loadSessionWithAssessment(sessionId);
  await ensureActive(s);

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

  const answer = await prisma.answer.create({
    data: {
      session_id: sessionId,
      question_id: body.question_id,
      position: body.position,
      text: body.text,
      confidence_rating: body.confidence_rating ?? null,
      time_spent_ms: body.time_spent_ms,
      scoring_status: 'pending',
    },
  });

  const next_position = body.position + 1 < total ? body.position + 1 : null;
  return { answer_id: answer.id, next_position };
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
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'submitted', submitted_at: new Date() },
    });
  }
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
