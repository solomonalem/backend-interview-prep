import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { getQuestionById, listQuestions, matchQuestions } from '../services/question.service.js';

export const questionsRouter = Router();

const filterSchema = z.object({
  topic: z.string().optional(),
  difficulty: z.enum(['junior', 'mid', 'senior', 'staff']).optional(),
  type: z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral']).optional(),
  domain: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// GET /questions — list with optional filters + pagination
questionsRouter.get(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid query parameters');
    res.json(await listQuestions(parsed.data));
  }),
);

// Accepts either repeated params (?type=a&type=b) or a comma-separated list.
const csv = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((s) => String(s).trim())
    .filter(Boolean);

const matchSchema = z.object({
  technology: z.preprocess(csv, z.array(z.string().min(1)).min(1)),
  seniority: z.enum(['junior', 'mid', 'senior', 'staff']),
  type: z.preprocess(
    csv,
    z.array(z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral'])),
  ),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// GET /questions/match — loose builder retrieval, ranked by keys matched.
// MUST be declared before '/:id', or Express routes "match" into that param.
questionsRouter.get(
  '/match',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = matchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'technology and seniority are required');
    }
    const { type, ...rest } = parsed.data;
    res.json(await matchQuestions({ ...rest, ...(type.length ? { type } : {}) }));
  }),
);

// GET /questions/:id — single question (public display fields only)
questionsRouter.get(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    res.json(await getQuestionById(id));
  }),
);
