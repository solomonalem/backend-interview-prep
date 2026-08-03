import type { Prisma } from '@prisma/client';
import type {
  AssessmentDetail,
  AssessmentListResponse,
  CreateAssessmentRequest,
  CreateAssessmentResponse,
  CreateLinkRequest,
  CreateLinkResponse,
  Difficulty,
  LinkStatus,
  ProctoringConfig,
  QuestionType,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateToken } from '../utils/token.js';

const DEFAULT_EXPIRES_HOURS = 168; // 7 days

// A link's status is derived from its session (if started) and its expiry.
type LinkWithSession = {
  opened_at: Date | null;
  expires_at: Date;
  session: { status: string; report: { overall_pct: number } | null } | null;
};

function deriveLinkStatus(link: LinkWithSession): LinkStatus {
  if (link.session) {
    switch (link.session.status) {
      case 'in_progress':
        return 'in_progress';
      case 'submitted':
        return 'submitted';
      case 'expired':
        return 'expired';
      default:
        return 'opened'; // session exists but not_started
    }
  }
  if (link.expires_at.getTime() < Date.now()) return 'expired';
  if (link.opened_at) return 'opened';
  return 'not_opened';
}

function linkOverallScore(link: LinkWithSession): number | null {
  return link.session?.report?.overall_pct ?? null;
}

// ── POST /assessments ────────────────────────────────────────────────────────
export async function createAssessment(
  ownerId: string,
  input: CreateAssessmentRequest,
): Promise<CreateAssessmentResponse> {
  const { question_ids } = input;

  // Reject duplicate ids (would violate the join's @@unique([assessment_id, question_id])).
  if (new Set(question_ids).size !== question_ids.length) {
    throw new AppError(400, 'INVALID_QUESTIONS', 'question_ids contains duplicates');
  }

  // Validate every question exists before saving.
  const found = await prisma.question.findMany({
    where: { id: { in: question_ids } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((q) => q.id));
  const missing = question_ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(400, 'INVALID_QUESTIONS', `Unknown question id(s): ${missing.join(', ')}`);
  }

  const assessment = await prisma.assessment.create({
    data: {
      title: input.title,
      owner_id: ownerId,
      timer_enabled: input.timer_enabled,
      timer_seconds: input.timer_enabled ? (input.timer_seconds ?? null) : null,
      confidence_rating_enabled: input.confidence_rating_enabled,
      ...(input.proctoring_config
        ? { proctoring_config: input.proctoring_config as unknown as Prisma.InputJsonValue }
        : {}),
      questions: {
        create: question_ids.map((question_id, position) => ({ question_id, position })),
      },
    },
  });

  return {
    id: assessment.id,
    title: assessment.title,
    timer_enabled: assessment.timer_enabled,
    timer_seconds: assessment.timer_seconds,
    confidence_rating_enabled: assessment.confidence_rating_enabled,
    created_at: assessment.created_at.toISOString(),
  };
}

// ── GET /assessments (list) ──────────────────────────────────────────────────
export async function listAssessments(ownerId: string): Promise<AssessmentListResponse> {
  const rows = await prisma.assessment.findMany({
    where: { owner_id: ownerId },
    orderBy: { created_at: 'desc' },
    include: {
      _count: { select: { questions: true } },
      links: {
        orderBy: { created_at: 'asc' },
        include: { session: { include: { report: { select: { overall_pct: true } } } } },
      },
    },
  });

  return {
    assessments: rows.map((a) => ({
      id: a.id,
      title: a.title,
      question_count: a._count.questions,
      timer_enabled: a.timer_enabled,
      timer_seconds: a.timer_seconds,
      created_at: a.created_at.toISOString(),
      links: a.links.map((link) => ({
        id: link.id,
        token: link.token,
        candidate_label: link.candidate_label,
        status: deriveLinkStatus(link),
        overall_score: linkOverallScore(link),
      })),
    })),
  };
}

// ── GET /assessments/:id (detail) ────────────────────────────────────────────
export async function getAssessmentDetail(
  ownerId: string,
  assessmentId: string,
): Promise<AssessmentDetail> {
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, owner_id: ownerId }, // ownership enforced here
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          question: { select: { id: true, text: true, topic: true, difficulty: true, type: true } },
        },
      },
      links: {
        orderBy: { created_at: 'asc' },
        include: { session: { include: { report: { select: { overall_pct: true } } } } },
      },
    },
  });
  if (!a) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');

  return {
    id: a.id,
    title: a.title,
    timer_enabled: a.timer_enabled,
    timer_seconds: a.timer_seconds,
    proctoring_config: a.proctoring_config as unknown as ProctoringConfig,
    confidence_rating_enabled: a.confidence_rating_enabled,
    questions: a.questions.map((aq) => ({
      position: aq.position,
      question: {
        id: aq.question.id,
        text: aq.question.text,
        topic: aq.question.topic,
        difficulty: aq.question.difficulty as Difficulty,
        type: aq.question.type as QuestionType,
      },
    })),
    links: a.links.map((link) => {
      const status = deriveLinkStatus(link);
      return {
        id: link.id,
        token: link.token,
        candidate_label: link.candidate_label,
        expires_at: link.expires_at.toISOString(),
        status,
        ...(link.session
          ? {
              session: {
                id: link.session.id,
                status: link.session.status,
                started_at: link.session.started_at?.toISOString() ?? null,
                submitted_at: link.session.submitted_at?.toISOString() ?? null,
                overall_score: linkOverallScore(link),
              },
            }
          : {}),
      };
    }),
  };
}

// ── POST /assessments/:id/links ──────────────────────────────────────────────
export async function createLink(
  ownerId: string,
  assessmentId: string,
  input: CreateLinkRequest,
): Promise<CreateLinkResponse> {
  // Verify the interviewer owns this assessment before minting a link.
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, owner_id: ownerId },
    select: { id: true },
  });
  if (!assessment) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');

  const hours = input.expires_in_hours ?? DEFAULT_EXPIRES_HOURS;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  // Generate a unique token (retry on the astronomically-unlikely collision).
  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.assessmentLink.findUnique({ where: { token }, select: { id: true } });
    if (!clash) break;
    token = generateToken();
  }

  const link = await prisma.assessmentLink.create({
    data: {
      token,
      assessment_id: assessmentId,
      candidate_label: input.candidate_label ?? null,
      expires_at: expiresAt,
    },
  });

  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
  return {
    id: link.id,
    token: link.token,
    url: `${baseUrl}/a/${link.token}`,
    expires_at: link.expires_at.toISOString(),
  };
}
