import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  createCandidate,
  deleteCandidate,
  getCandidate,
  listCandidates,
  updateCandidate,
} from '../services/candidate.service.js';

/**
 * Candidate records. Every route here is the MANAGER's — authInterviewer,
 * scoped to their own rows. There is no candidate-facing route in this file
 * and there is not meant to be one: candidates click links, managers keep
 * records.
 */
export const candidatesRouter = Router();

// GET /candidates?search= — the manager's people
candidatesRouter.get(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json(await listCandidates(req.interviewer!.id, search));
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  notes: z.string().optional(),
});

// POST /candidates — add one by hand
candidatesRouter.post(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'A name and a valid email address are required');
    }
    res.status(201).json(await createCandidate(req.interviewer!.id, parsed.data));
  }),
);

// GET /candidates/:id — the record and its journey
candidatesRouter.get(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'candidate id is required');
    res.json(await getCandidate(req.interviewer!.id, id));
  }),
);

// Every field optional — the detail page saves one at a time. `notes: null`
// is meaningful (clear them), so nullable rather than merely optional.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /candidates/:id — rename, re-address, or take notes
candidatesRouter.patch(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'candidate id is required');
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid update');
    }
    res.json(await updateCandidate(req.interviewer!.id, id, parsed.data));
  }),
);

// DELETE /candidates/:id — removes the record ONLY. Links, sessions, scores
// and reports all survive; the links revert to standing alone.
candidatesRouter.delete(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'candidate id is required');
    res.json(await deleteCandidate(req.interviewer!.id, id));
  }),
);
