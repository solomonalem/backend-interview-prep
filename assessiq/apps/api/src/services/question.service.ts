import type { Prisma } from '@prisma/client';
import type {
  Difficulty,
  QuestionFilters,
  QuestionListItem,
  QuestionListResponse,
  QuestionMatchFilters,
  QuestionMatchItem,
  QuestionMatchKey,
  QuestionMatchResponse,
  QuestionType,
  QuestionUsage,
  PreviouslyUsedQuestion,
  PreviouslyUsedResponse,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';

// Only ever select public fields — the private `_guide` rubric columns must
// never leave the server (docs/07 note 2, docs/08 GET /questions note).
const PUBLIC_SELECT = {
  id: true,
  text: true,
  topic: true,
  difficulty: true,
  type: true,
  domain: true,
  status: true,
  tags: true,
  is_active: true,
  created_at: true,
  // Provenance. Safe on this select: it says a question came from a repo, not
  // which repo — the citation itself lives on the interviewer-only draft shape.
  source: true,
  core_answer_display: true,
  senior_signal_display: true,
  trap_display: true,
} satisfies Prisma.QuestionSelect;

/** A selected row as the API shape — the one place Date becomes string. */
function toListItem(row: {
  created_at: Date;
  [k: string]: unknown;
}): QuestionListItem {
  return { ...(row as unknown as QuestionListItem), created_at: row.created_at.toISOString() };
}

function buildWhere(f: QuestionFilters): Prisma.QuestionWhereInput {
  // Active unless archived was asked for — never both. A list mixing live and
  // archived questions is how an archived question ends up in an assessment.
  const where: Prisma.QuestionWhereInput = { is_active: !f.archived };
  if (f.topic) where.topic = f.topic;
  if (f.source) where.source = f.source as Prisma.QuestionWhereInput['source'];
  if (f.difficulty) where.difficulty = f.difficulty as Difficulty;
  if (f.type) where.type = f.type as QuestionType;
  if (f.domain) where.domain = f.domain;
  if (f.status) where.status = f.status as Prisma.QuestionWhereInput['status'];
  if (f.tag) where.tags = { has: f.tag };
  // Text OR topic: a manager searching "kafka" means both, and making them
  // choose which field they meant is a search box that fights them.
  if (f.search) {
    where.OR = [
      { text: { contains: f.search, mode: 'insensitive' } },
      { topic: { contains: f.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

function buildOrder(sort: QuestionFilters['sort']): Prisma.QuestionOrderByWithRelationInput {
  switch (sort) {
    case 'newest':
      return { created_at: 'desc' };
    case 'most_used':
      return { assessment_questions: { _count: 'desc' } };
    case 'topic':
      return { topic: 'asc' };
    case 'oldest':
    default:
      // The historical default, kept so existing callers (the builder's
      // search, the study deck) see exactly what they saw before.
      return { created_at: 'asc' };
  }
}

/**
 * How each question on this page has actually performed.
 *
 * Computed per page rather than stored: it is two queries over a handful of
 * ids, and a stored counter would be one more thing that can disagree with
 * the rows it counts.
 */
async function usageFor(ids: string[]): Promise<Map<string, QuestionUsage>> {
  if (ids.length === 0) return new Map();

  const [used, answers] = await Promise.all([
    prisma.assessmentQuestion.groupBy({
      by: ['question_id'],
      where: { question_id: { in: ids } },
      _count: { _all: true },
    }),
    prisma.answer.findMany({
      where: { question_id: { in: ids }, score: { isNot: null } },
      select: { question_id: true, score: { select: { total_pct: true } } },
    }),
  ]);

  const usage = new Map<string, QuestionUsage>(
    ids.map((id) => [id, { times_used: 0, avg_score: null, answer_count: 0 }]),
  );
  for (const row of used) {
    const u = usage.get(row.question_id);
    if (u) u.times_used = row._count._all;
  }
  const totals = new Map<string, { sum: number; n: number }>();
  for (const a of answers) {
    if (!a.score) continue;
    const t = totals.get(a.question_id) ?? { sum: 0, n: 0 };
    t.sum += a.score.total_pct;
    t.n += 1;
    totals.set(a.question_id, t);
  }
  for (const [id, t] of totals) {
    const u = usage.get(id);
    if (u && t.n > 0) {
      u.avg_score = Math.round(t.sum / t.n);
      u.answer_count = t.n;
    }
  }
  return usage;
}

export async function listQuestions(
  f: QuestionFilters,
  opts: { withUsage?: boolean } = {},
): Promise<QuestionListResponse> {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(100, Math.max(1, f.limit ?? 20));
  const where = buildWhere(f);

  const [rows, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: buildOrder(f.sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  // Only where it is wanted: the builder's search and the study deck have no
  // use for it and should not pay two extra queries per keystroke.
  const usage = opts.withUsage ? await usageFor(rows.map((r) => r.id)) : null;

  return {
    questions: rows.map((r) => ({
      ...toListItem(r),
      ...(usage ? { usage: usage.get(r.id) } : {}),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

// Loose retrieval for the assessment builder (Stage A). A question surfaces if
// it matches AT LEAST ONE of technology/seniority/type, ranked by how many it
// matched. Strict AND across all three returns nothing useful against a small
// bank, which is the failure mode this route exists to avoid.
//
// Ranking happens in memory because the score is a count of OR-branch hits,
// which Prisma cannot express. Fine at bank scale (tens–hundreds); if the bank
// grows past a few thousand this needs a SQL-side score.
export async function matchQuestions(f: QuestionMatchFilters): Promise<QuestionMatchResponse> {
  const limit = Math.min(100, Math.max(1, f.limit ?? 50));
  const terms = f.technology.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const types = f.type?.length ? f.type : undefined;

  const or: Prisma.QuestionWhereInput[] = [
    ...terms.map((t) => ({ topic: { contains: t, mode: 'insensitive' as const } })),
    { difficulty: f.seniority as Difficulty },
  ];
  if (types) or.push({ type: { in: types as QuestionType[] } });

  const rows = await prisma.question.findMany({
    where: { is_active: true, OR: or },
    select: PUBLIC_SELECT,
    orderBy: { created_at: 'asc' },
  });

  const scored: QuestionMatchItem[] = rows.map((q) => {
    const matched_on: QuestionMatchKey[] = [];
    // Bidirectional contains so "node" matches "Node.js" and vice versa.
    const topic = q.topic.toLowerCase();
    if (terms.some((t) => topic.includes(t) || t.includes(topic))) matched_on.push('topic');
    if (q.difficulty === f.seniority) matched_on.push('difficulty');
    if (types?.includes(q.type as QuestionType)) matched_on.push('type');
    return { ...toListItem(q), matched_on, match_score: matched_on.length };
  });

  // Sort is stable, so equal scores keep the created_at ordering from the query.
  scored.sort((a, b) => b.match_score - a.match_score);

  return {
    questions: scored.slice(0, limit),
    total: scored.length,
    page: 1,
    pages: Math.max(1, Math.ceil(scored.length / limit)),
  };
}

// "Questions I've sent before" — a filtered view of the bank, not a new store.
// A question qualifies when it sits in an AssessmentQuestion belonging to an
// assessment this manager owns. Only vetted, still-active questions surface:
// a draft has never legitimately reached an assessment, and a rejected question
// (is_active: false) has left retrieval everywhere else, so it must leave here.
//
// Recency comes from the assessment that used it, since the join row carries no
// timestamp of its own. Dedup and counting happen in memory for the same reason
// matchQuestions ranks in memory — fine at bank scale; revisit with a SQL
// DISTINCT ON if a single manager's history grows into the thousands.
export async function listPreviouslyUsed(
  ownerId: string,
  limit = 50,
): Promise<PreviouslyUsedResponse> {
  const rows = await prisma.assessmentQuestion.findMany({
    where: {
      assessment: { owner_id: ownerId },
      question: { is_active: true, status: 'vetted' },
    },
    select: {
      assessment: { select: { title: true, created_at: true } },
      question: { select: PUBLIC_SELECT },
    },
    // Most recently used first. The first row seen for a question id is
    // therefore its latest use, which is what the dedup below keeps.
    orderBy: { assessment: { created_at: 'desc' } },
  });

  const byQuestion = new Map<string, PreviouslyUsedQuestion>();
  for (const row of rows) {
    const seen = byQuestion.get(row.question.id);
    if (seen) {
      seen.used_count += 1;
      continue;
    }
    byQuestion.set(row.question.id, {
      ...toListItem(row.question),
      used_count: 1,
      last_used_at: row.assessment.created_at.toISOString(),
      last_used_in: row.assessment.title,
    });
  }

  const questions = [...byQuestion.values()];
  return {
    questions: questions.slice(0, Math.min(100, Math.max(1, limit))),
    total: questions.length,
  };
}

export async function getQuestionById(id: string): Promise<QuestionListItem> {
  const row = await prisma.question.findFirst({
    where: { id, is_active: true },
    select: PUBLIC_SELECT,
  });
  if (!row) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');
  return toListItem(row);
}
