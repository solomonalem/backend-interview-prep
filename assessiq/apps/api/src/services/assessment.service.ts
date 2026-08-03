import type { Prisma } from '@prisma/client';
import type { CreateAssessmentRequest, CreateAssessmentResponse } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

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
