import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { startSession, validateLink } from '../services/session.service.js';

export const sessionsRouter = Router();

// GET /sessions/link/:token — validate a link before starting (public)
sessionsRouter.get(
  '/link/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new AppError(400, 'VALIDATION', 'token is required');
    res.json(await validateLink(token));
  }),
);

const startSchema = z.object({ link_token: z.string().min(1) });

// POST /sessions/start — create a session, issue a candidate JWT (public)
sessionsRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'link_token is required');
    res.status(201).json(await startSession(parsed.data.link_token));
  }),
);
