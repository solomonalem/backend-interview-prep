import type { Prisma } from '@prisma/client';
import type {
  Difficulty,
  ImportQuestionsRequest,
  ImportQuestionsResponse,
  QuestionDraft,
  QuestionExport,
  QuestionType,
  UpdateQuestionRequest,
} from '@assessiq/types';
import { DIFFICULTIES, QUESTION_TYPES } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { loadQuestionForReview } from './generation.service.js';

/**
 * Managing the bank once it is big enough to need managing: editing what is
 * already vetted, archiving what has stopped earning its place, and moving
 * questions between environments.
 *
 * THE ONE RULE THAT DOES NOT BEND: nothing here creates or promotes a vetted
 * question. Editing leaves status exactly where it was, and import always
 * lands as drafts. The human review gate is the product's main claim about
 * itself, and a file upload must not be a way around it.
 */

const EDITABLE_TEXT_FIELDS = [
  'text',
  'topic',
  'core_answer_guide',
  'senior_signal_guide',
  'trap_guide',
  'evidence_guide',
  'core_answer_display',
  'senior_signal_display',
  'trap_display',
] as const;

// ── PATCH /questions/:id ─────────────────────────────────────────────────────
/**
 * Edit a question in place, or archive/restore it.
 *
 * Works on vetted questions as well as drafts, which is the point — a rubric
 * that turned out to be too harsh should be fixable without deleting the
 * question and losing its history. Status is never touched: a vetted question
 * stays vetted, and a draft edited here still has to go through review.
 *
 * Assessments already built from this question are unaffected: they carry a
 * snapshot of the text and guides taken when they were created (see
 * AssessmentQuestion). That is deliberate — what was asked of someone is a
 * fact about the past.
 */
export async function updateQuestion(
  id: string,
  input: UpdateQuestionRequest,
  interviewerId: string,
): Promise<QuestionDraft> {
  const existing = await prisma.question.findUnique({
    where: { id },
    select: { id: true, created_by: true },
  });
  if (!existing) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');

  const data: Prisma.QuestionUpdateInput = {};
  for (const field of EDITABLE_TEXT_FIELDS) {
    const value = input[field];
    // An empty string is a mistake, not an instruction: a rubric component
    // cannot be blank, and silently accepting it would break scoring later.
    if (typeof value === 'string' && value.trim()) data[field] = value.trim();
  }
  if (input.difficulty && DIFFICULTIES.includes(input.difficulty as Difficulty)) {
    data.difficulty = input.difficulty as Difficulty;
  }
  if (input.type && QUESTION_TYPES.includes(input.type as QuestionType)) {
    data.type = input.type as QuestionType;
  }
  if (input.tags) {
    // Trimmed, de-duplicated, case-insensitively — "Kafka" and "kafka" are one
    // tag, and a filter that misses half its questions is worse than no tag.
    const seen = new Set<string>();
    data.tags = input.tags
      .map((t) => t.trim())
      .filter((t) => {
        const key = t.toLowerCase();
        if (!t || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  if (input.is_active !== undefined) data.is_active = input.is_active;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'VALIDATION', 'Nothing to update');
  }

  await prisma.question.update({ where: { id }, data });
  return loadQuestionForReview(id, interviewerId);
}

// ── GET /questions/export ────────────────────────────────────────────────────
/**
 * The manager's own questions, whole.
 *
 * Own, not the whole bank: the seeded questions are not theirs to take, and a
 * shared bank export would make "my questions" mean something different in
 * every deployment.
 */
export async function exportQuestions(interviewerId: string): Promise<QuestionExport> {
  const rows = await prisma.question.findMany({
    where: { created_by: interviewerId },
    orderBy: { created_at: 'asc' },
    select: {
      text: true,
      topic: true,
      difficulty: true,
      type: true,
      domain: true,
      tags: true,
      core_answer_guide: true,
      senior_signal_guide: true,
      trap_guide: true,
      evidence_guide: true,
      core_answer_display: true,
      senior_signal_display: true,
      trap_display: true,
    },
  });

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    questions: rows.map((r) => ({
      ...r,
      difficulty: r.difficulty as Difficulty,
      type: r.type as QuestionType,
    })),
  };
}

// ── POST /questions/import ───────────────────────────────────────────────────
/**
 * Bring questions in from a file. THEY ARRIVE AS DRAFTS, ALWAYS.
 *
 * Not a compromise or a safety default — it is the same gate every generated
 * question passes through. A question nobody in this account has read must not
 * be sendable to a candidate, and "it was vetted in the bank I exported it
 * from" is a claim this bank cannot check.
 */
export async function importQuestions(
  input: ImportQuestionsRequest,
  interviewerId: string,
): Promise<ImportQuestionsResponse> {
  const notes: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const [i, q] of input.questions.entries()) {
    const label = `#${i + 1}`;
    const required = [
      q.text,
      q.topic,
      q.core_answer_guide,
      q.senior_signal_guide,
      q.trap_guide,
      q.evidence_guide,
    ];
    if (required.some((v) => typeof v !== 'string' || !v.trim())) {
      skipped += 1;
      notes.push(`${label}: missing question text, topic, or a rubric component.`);
      continue;
    }
    if (!DIFFICULTIES.includes(q.difficulty) || !QUESTION_TYPES.includes(q.type)) {
      skipped += 1;
      notes.push(`${label}: unknown difficulty or type.`);
      continue;
    }

    // Same text, same topic, same owner → almost certainly a re-import. Noted
    // rather than silently duplicated; a bank with three copies of a question
    // is a bank nobody wants to search.
    const duplicate = await prisma.question.findFirst({
      where: { created_by: interviewerId, text: q.text.trim(), topic: q.topic.trim() },
      select: { id: true },
    });
    if (duplicate) {
      skipped += 1;
      notes.push(`${label}: you already have this question ("${q.text.slice(0, 40)}…").`);
      continue;
    }

    await prisma.question.create({
      data: {
        text: q.text.trim(),
        topic: q.topic.trim(),
        difficulty: q.difficulty,
        type: q.type,
        domain: q.domain?.trim() || null,
        tags: Array.isArray(q.tags) ? q.tags.map((t) => t.trim()).filter(Boolean) : [],
        core_answer_guide: q.core_answer_guide.trim(),
        senior_signal_guide: q.senior_signal_guide.trim(),
        trap_guide: q.trap_guide.trim(),
        evidence_guide: q.evidence_guide.trim(),
        core_answer_display: q.core_answer_display?.trim() || q.core_answer_guide.trim(),
        senior_signal_display: q.senior_signal_display?.trim() || q.senior_signal_guide.trim(),
        trap_display: q.trap_display?.trim() || q.trap_guide.trim(),
        // The two that matter, and neither is negotiable.
        status: 'draft',
        created_by: interviewerId,
        source: 'manual',
      },
    });
    imported += 1;
  }

  return { imported, skipped, notes };
}
