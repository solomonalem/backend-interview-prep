import type {
  LinkValidateResponse,
  ProctoringConfig,
  StartSessionResponse,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { signCandidateToken } from '../lib/jwt.js';
import { AppError } from '../middleware/error.middleware.js';

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
