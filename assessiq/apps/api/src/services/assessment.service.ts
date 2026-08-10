import type { Prisma } from '@prisma/client';
import type {
  AssessmentDetail,
  AssessmentDetailLink,
  AssessmentListResponse,
  CreateAssessmentRequest,
  CreateAssessmentResponse,
  CreateLinkRequest,
  CreateLinkResponse,
  DuplicateCandidate,
  InviteEmailStatus,
  Difficulty,
  LinkStatus,
  ProctoringConfig,
  QuestionType,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateToken } from '../utils/token.js';
import { sendCandidateInvite } from './email.service.js';

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
        candidate_email: link.candidate_email,
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
        candidate_email: link.candidate_email,
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
/**
 * "Candidate 1", "Candidate 2", … scoped to the assessment.
 *
 * A candidate has no account — the label is the only thing distinguishing one
 * link from another — so an unnamed link used to be indistinguishable from
 * every other unnamed link. This gives it a handle without making the field
 * mandatory, since the quick "just send me a link" path depends on being able
 * to skip it. The manager can rename it afterwards.
 *
 * Counts upward past names already in use, so it never collides with a manual
 * label or a gap left by a deleted link.
 */
async function nextDefaultLabel(assessmentId: string): Promise<string> {
  const existing = await prisma.assessmentLink.findMany({
    where: { assessment_id: assessmentId },
    select: { candidate_label: true },
  });
  const taken = new Set(
    existing.map((l) => l.candidate_label?.trim().toLowerCase()).filter(Boolean) as string[],
  );
  for (let n = existing.length + 1; ; n++) {
    const candidate = `Candidate ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Rename a candidate link. Passing null clears the label back to the
 * unlabelled fallback — the ~10 links created before defaults existed can be
 * given real names this way.
 */
export async function updateLinkLabel(
  ownerId: string,
  assessmentId: string,
  linkId: string,
  candidateLabel: string | null,
): Promise<AssessmentDetailLink> {
  const link = await prisma.assessmentLink.findFirst({
    where: { id: linkId, assessment_id: assessmentId, assessment: { owner_id: ownerId } },
    select: { id: true },
  });
  if (!link) throw new AppError(404, 'LINK_NOT_FOUND', 'Candidate link not found');

  const trimmed = candidateLabel?.trim();
  await prisma.assessmentLink.update({
    where: { id: linkId },
    data: { candidate_label: trimmed ? trimmed : null },
  });

  // Re-read through the detail path so the caller gets the same shape (and
  // derived status) as everywhere else rather than a hand-built object.
  const detail = await getAssessmentDetail(ownerId, assessmentId);
  const updated = detail.links.find((l) => l.id === linkId);
  if (!updated) throw new AppError(404, 'LINK_NOT_FOUND', 'Candidate link not found');
  return updated;
}

/**
 * Has this email already COMPLETED this assessment?
 *
 * Only a submitted session counts — an invite that was never opened, or one
 * still in progress, is not a reason to warn. Matching is case-insensitive
 * because a manager retyping an address will not reproduce its casing.
 *
 * Returns null when there is nothing to warn about, including when no email
 * was given: without one there is no reliable identity to match on, since
 * candidates have no accounts.
 */
async function findCompletedByEmail(
  assessmentId: string,
  email: string | undefined,
): Promise<DuplicateCandidate | null> {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return null;

  const prior = await prisma.assessmentLink.findFirst({
    where: {
      assessment_id: assessmentId,
      candidate_email: { equals: normalised, mode: 'insensitive' },
      session: { status: 'submitted' },
    },
    orderBy: { created_at: 'desc' },
    include: { session: { include: { report: { select: { overall_pct: true } } } } },
  });
  if (!prior?.session) return null;

  return {
    candidate_email: prior.candidate_email ?? normalised,
    candidate_label: prior.candidate_label,
    completed_at: (prior.session.submitted_at ?? prior.session.started_at ?? prior.created_at).toISOString(),
    overall_score: prior.session.report?.overall_pct ?? null,
  };
}

export async function createLink(
  ownerId: string,
  assessmentId: string,
  input: CreateLinkRequest,
): Promise<CreateLinkResponse> {
  // Verify the interviewer owns this assessment before minting a link.
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, owner_id: ownerId },
    select: { id: true, title: true, owner: { select: { name: true, email: true } } },
  });
  if (!assessment) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');

  // Warn before creating, not after — but only once. `confirm_duplicate` is the
  // manager saying "yes, send it again anyway".
  if (!input.confirm_duplicate) {
    const duplicate = await findCompletedByEmail(assessmentId, input.candidate_email);
    if (duplicate) {
      throw new AppError(
        409,
        'DUPLICATE_CANDIDATE',
        'This candidate has already completed this assessment.',
        { duplicate },
      );
    }
  }

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
      candidate_label: input.candidate_label?.trim()
        ? input.candidate_label.trim()
        : await nextDefaultLabel(assessmentId),
      candidate_email: input.candidate_email?.trim().toLowerCase() || null,
      expires_at: expiresAt,
    },
  });

  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';

  // Email is best-effort: the link exists either way, and the status is
  // returned so the manager sees whether it actually went out.
  let email: { status: InviteEmailStatus; error?: string } = { status: 'skipped_no_email' };
  if (link.candidate_email) {
    email = await sendCandidateInvite(link.candidate_email, {
      assessmentTitle: assessment.title,
      fromName: assessment.owner.name || assessment.owner.email,
      url: `${baseUrl}/a/${link.token}`,
      expiresAt: link.expires_at.toISOString(),
    });
  }

  return {
    id: link.id,
    token: link.token,
    candidate_label: link.candidate_label,
    candidate_email: link.candidate_email,
    email_status: email.status,
    ...(email.error ? { email_error: email.error } : {}),
    url: `${baseUrl}/a/${link.token}`,
    expires_at: link.expires_at.toISOString(),
  };
}
