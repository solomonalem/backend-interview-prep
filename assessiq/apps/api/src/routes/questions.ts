import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { getQuestionById, listQuestions, matchQuestions } from '../services/question.service.js';
import {
  approveDraft,
  draftRubricForQuestion,
  generateQuestions,
  refineDraft,
  rejectDraft,
} from '../services/generation.service.js';

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

// ── Generation (Stage B) ─────────────────────────────────────────────────────
// All of these sit before '/:id' for the same reason /match does.
const difficultyEnum = z.enum(['junior', 'mid', 'senior', 'staff']);
const typeEnum = z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral']);

const generateSchema = z.object({
  technology: z.string().min(1),
  seniority: difficultyEnum,
  type: typeEnum.optional(),
  domain: z.string().min(1).optional(),
  concern: z.string().min(1).optional(),
  count: z.number().int().min(1).max(15).optional(),
  exclude: z.array(z.string()).optional(),
});

// POST /questions/generate — propose new questions as drafts. Never vetted,
// never auto-added to an assessment.
questionsRouter.post(
  '/generate',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'technology and seniority are required');
    }
    const questions = await generateQuestions(parsed.data, req.interviewer!.id);
    res.status(201).json({ questions });
  }),
);

const draftRubricSchema = z.object({
  text: z.string().min(1),
  topic: z.string().min(1),
  seniority: difficultyEnum,
  type: typeEnum.optional(),
  domain: z.string().min(1).optional(),
});

// POST /questions/draft-rubric — manager writes the question, AI drafts the
// rubric. Enters the same review flow; a rubric-less question is never usable.
questionsRouter.post(
  '/draft-rubric',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = draftRubricSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'text, topic and seniority are required');
    }
    res.status(201).json(await draftRubricForQuestion(parsed.data, req.interviewer!.id));
  }),
);

const refineSchema = z.object({ instruction: z.string().min(1) });

// POST /questions/:id/refine — revise a draft in place, keeping what works.
questionsRouter.post(
  '/:id/refine',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    const parsed = refineSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'instruction is required');
    res.json(await refineDraft(id, parsed.data, req.interviewer!.id));
  }),
);

const approveSchema = z.object({
  text: z.string().min(1).optional(),
  core_answer_guide: z.string().min(1).optional(),
  senior_signal_guide: z.string().min(1).optional(),
  trap_guide: z.string().min(1).optional(),
  evidence_guide: z.string().min(1).optional(),
  core_answer_display: z.string().min(1).optional(),
  senior_signal_display: z.string().min(1).optional(),
  trap_display: z.string().min(1).optional(),
});

// POST /questions/:id/approve — the only path from draft to vetted.
questionsRouter.post(
  '/:id/approve',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    const parsed = approveSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid edits');
    res.json(await approveDraft(id, parsed.data, req.interviewer!.id));
  }),
);

// POST /questions/:id/reject — deactivate a draft so it leaves retrieval.
questionsRouter.post(
  '/:id/reject',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    await rejectDraft(id, req.interviewer!.id);
    res.status(204).end();
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
