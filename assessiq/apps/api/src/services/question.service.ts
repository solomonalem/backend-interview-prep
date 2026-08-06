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
  core_answer_display: true,
  senior_signal_display: true,
  trap_display: true,
} satisfies Prisma.QuestionSelect;

function buildWhere(f: QuestionFilters): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { is_active: true };
  if (f.topic) where.topic = f.topic;
  if (f.difficulty) where.difficulty = f.difficulty as Difficulty;
  if (f.type) where.type = f.type as QuestionType;
  if (f.domain) where.domain = f.domain;
  if (f.search) where.text = { contains: f.search, mode: 'insensitive' };
  return where;
}

export async function listQuestions(f: QuestionFilters): Promise<QuestionListResponse> {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(100, Math.max(1, f.limit ?? 20));
  const where = buildWhere(f);

  const [rows, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select: PUBLIC_SELECT,
      orderBy: { created_at: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return {
    questions: rows as QuestionListItem[],
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
    return { ...(q as QuestionListItem), matched_on, match_score: matched_on.length };
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

export async function getQuestionById(id: string): Promise<QuestionListItem> {
  const row = await prisma.question.findFirst({
    where: { id, is_active: true },
    select: PUBLIC_SELECT,
  });
  if (!row) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');
  return row as QuestionListItem;
}
