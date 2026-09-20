import { Router } from 'express';
import { z } from 'zod';
import { SNIPPET_LANGUAGES, SNIPPET_MAX_CHARS } from '@assessiq/types';
import { authCandidate } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  answerProbe,
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
  // The optional code sketch. Validated for exactly two things — that it fits,
  // and that the language is one we actually offer — because those are the
  // only two claims the server makes about it. It is never parsed, linted,
  // compiled or run; it is text a model will read.
  //
  // The cap is enforced here as well as in the browser: a client-side limit is
  // a courtesy to the person typing, not a rule about what may be stored.
  snippet_code: z
    .string()
    .max(SNIPPET_MAX_CHARS, `Your code snippet is too long — the limit is ${SNIPPET_MAX_CHARS} characters.`)
    .optional(),
  snippet_language: z.enum(SNIPPET_LANGUAGES).optional(),
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

const probeAnswerSchema = z.object({
  text: z.string(),
  time_spent_ms: z.number().int().nonnegative(),
});

// POST /sessions/:id/probes/:probeId/answer — the defense.
// An empty body is valid and expected: the probe timer auto-submits whatever is
// in the box, and leaving it empty is a legitimate outcome rather than an error.
sessionsRouter.post(
  '/:id/probes/:probeId/answer',
  authCandidate,
  asyncHandler(async (req, res) => {
    const parsed = probeAnswerSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid follow-up answer');
    const { probeId } = req.params;
    if (!probeId) throw new AppError(400, 'VALIDATION', 'probeId is required');
    res.json(await answerProbe(req.candidate!.sessionId, probeId, parsed.data));
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
