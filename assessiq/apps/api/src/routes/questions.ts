import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { getQuestionById, listQuestions } from '../services/question.service.js';

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
