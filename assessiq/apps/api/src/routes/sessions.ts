import { Router } from 'express';
import { z } from 'zod';
import { authCandidate } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  getQuestion,
  recordEvents,
  startSession,
  submitAnswer,
  submitSession,
  validateLink,
} from '../services/session.service.js';

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

// GET /sessions/:id/question/:position — one question at a time
sessionsRouter.get(
  '/:id/question/:position',
  authCandidate,
  asyncHandler(async (req, res) => {
    const position = Number(req.params.position);
    if (!Number.isInteger(position)) throw new AppError(400, 'VALIDATION', 'invalid position');
    res.json(await getQuestion(req.candidate!.sessionId, position));
  }),
);

const answerSchema = z.object({
  question_id: z.string().min(1),
  position: z.number().int().nonnegative(),
  text: z.string(),
  confidence_rating: z.number().int().min(1).max(5).optional(),
  time_spent_ms: z.number().int().nonnegative(),
});

// POST /sessions/:id/answers — submit an answer, advance
sessionsRouter.post(
  '/:id/answers',
  authCandidate,
  asyncHandler(async (req, res) => {
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid answer');
    }
    res.status(201).json(await submitAnswer(req.candidate!.sessionId, parsed.data));
  }),
);

const eventsSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(['tab_switch', 'focus_loss', 'paste', 'idle']),
        timestamp: z.number(),
        question_index: z.number().int().nonnegative(),
        char_count: z.number().int().optional(),
        idle_duration_ms: z.number().int().optional(),
      }),
    )
    .max(500),
});

// POST /sessions/:id/events — batch proctoring events
sessionsRouter.post(
  '/:id/events',
  authCandidate,
  asyncHandler(async (req, res) => {
    const parsed = eventsSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid events payload');
    await recordEvents(req.candidate!.sessionId, parsed.data.events);
    res.status(202).end();
  }),
);

// POST /sessions/:id/submit — finalize the session
sessionsRouter.post(
  '/:id/submit',
  authCandidate,
  asyncHandler(async (req, res) => {
    res.json(await submitSession(req.candidate!.sessionId));
  }),
);
