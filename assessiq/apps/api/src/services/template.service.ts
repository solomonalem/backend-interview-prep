import type {
  CreateTemplateRequest,
  Difficulty,
  ProctoringConfig,
  QuestionType,
  TemplateDetail,
  TemplateListResponse,
  TemplateSummary,
} from '@assessiq/types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

/**
 * Assessment templates.
 *
 * Two kinds, one model: built-ins (owner_id NULL, seeded from the vetted bank,
 * read-only to everyone) and a manager's own. The distinction is enforced on
 * every write path rather than by a flag someone could set.
 */

function toSummary(t: {
  id: string;
  title: string;
  description: string | null;
  question_ids: string[];
  timer_minutes: number | null;
  probes_mode: string;
  owner_id: string | null;
  created_at: Date;
}): TemplateSummary {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    question_count: t.question_ids.length,
    timer_minutes: t.timer_minutes,
    probes_mode: t.probes_mode as TemplateSummary['probes_mode'],
    built_in: t.owner_id === null,
    created_at: t.created_at.toISOString(),
  };
}

// ── GET /templates ───────────────────────────────────────────────────────────
/** Built-ins first — they are the ones a new manager can actually use. */
export async function listTemplates(ownerId: string): Promise<TemplateListResponse> {
  const rows = await prisma.assessmentTemplate.findMany({
    where: { OR: [{ owner_id: null }, { owner_id: ownerId }] },
    orderBy: [{ owner_id: 'asc' }, { created_at: 'asc' }],
  });
  return { templates: rows.map(toSummary) };
}

// ── GET /templates/:id ───────────────────────────────────────────────────────
/**
 * Resolve a template against the bank as it is NOW.
 *
 * A template stores ids, and ids rot: questions get archived, rejected, or
 * replaced. Rather than failing — which would make one archived question
 * destroy a template a manager relies on — the unusable ones are dropped and
 * counted, and the caller is expected to say so out loud before anything is
 * sent to a person.
 */
export async function getTemplate(ownerId: string, id: string): Promise<TemplateDetail> {
  const t = await prisma.assessmentTemplate.findFirst({
    where: { id, OR: [{ owner_id: null }, { owner_id: ownerId }] },
  });
  if (!t) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');

  const found = await prisma.question.findMany({
    where: { id: { in: t.question_ids }, is_active: true, status: 'vetted' },
    select: { id: true, text: true, topic: true, difficulty: true, type: true },
  });
  const byId = new Map(found.map((q) => [q.id, q]));

  // Template order, not database order: the sequence is part of the recipe.
  const questions = t.question_ids
    .map((qid) => byId.get(qid))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => ({
      id: q.id,
      text: q.text,
      topic: q.topic,
      difficulty: q.difficulty as Difficulty,
      type: q.type as QuestionType,
    }));

  return {
    ...toSummary(t),
    questions,
    probe_time_seconds: t.probe_time_seconds,
    proctoring_config: (t.proctoring_config as unknown as ProctoringConfig) ?? null,
    missing_count: t.question_ids.length - questions.length,
  };
}

// ── POST /templates ──────────────────────────────────────────────────────────
export async function createTemplate(
  ownerId: string,
  input: CreateTemplateRequest,
): Promise<TemplateSummary> {
  if (input.question_ids.length === 0) {
    throw new AppError(400, 'VALIDATION', 'A template needs at least one question');
  }
  const t = await prisma.assessmentTemplate.create({
    data: {
      owner_id: ownerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      question_ids: input.question_ids,
      timer_minutes: input.timer_minutes ?? null,
      ...(input.proctoring_config
        ? { proctoring_config: input.proctoring_config as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.probes_mode ? { probes_mode: input.probes_mode } : {}),
      ...(input.probe_time_seconds ? { probe_time_seconds: input.probe_time_seconds } : {}),
    },
  });
  return toSummary(t);
}

// ── DELETE /templates/:id ────────────────────────────────────────────────────
/** Own templates only. A built-in has no owner, so this can never match one. */
export async function deleteTemplate(ownerId: string, id: string): Promise<{ ok: true }> {
  const t = await prisma.assessmentTemplate.findFirst({
    where: { id, owner_id: ownerId },
    select: { id: true },
  });
  if (!t) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
  await prisma.assessmentTemplate.delete({ where: { id } });
  return { ok: true };
}

/**
 * Save an existing assessment as a personal template.
 *
 * Takes the assessment's own settings rather than asking for them again: the
 * manager already made those decisions once, and a "save as template" that
 * made them redo it would not be worth the button.
 */
export async function saveAssessmentAsTemplate(
  ownerId: string,
  assessmentId: string,
  input: { title?: string; description?: string },
): Promise<TemplateSummary> {
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, owner_id: ownerId },
    include: { questions: { orderBy: { position: 'asc' }, select: { question_id: true } } },
  });
  if (!a) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');

  return createTemplate(ownerId, {
    title: input.title?.trim() || a.title,
    ...(input.description ? { description: input.description } : {}),
    question_ids: a.questions.map((q) => q.question_id),
    timer_minutes: a.timer_enabled && a.timer_seconds ? Math.round(a.timer_seconds / 60) : null,
    proctoring_config: a.proctoring_config as unknown as ProctoringConfig,
    probes_mode: a.probes_mode,
    probe_time_seconds: a.probe_time_seconds,
  });
}
