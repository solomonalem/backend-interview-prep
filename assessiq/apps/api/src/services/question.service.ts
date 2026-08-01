import type { Prisma } from '@prisma/client';
import type {
  Difficulty,
  QuestionFilters,
  QuestionListItem,
  QuestionListResponse,
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

export async function getQuestionById(id: string): Promise<QuestionListItem> {
  const row = await prisma.question.findFirst({
    where: { id, is_active: true },
    select: PUBLIC_SELECT,
  });
  if (!row) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');
  return row as QuestionListItem;
}
