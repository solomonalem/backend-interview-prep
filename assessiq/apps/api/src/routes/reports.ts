import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  clearScoreOverride,
  getReport,
  setScoreOverride,
} from '../services/report.service.js';

export const reportsRouter = Router();

// GET /reports/session/:sessionId — full report (202 while scoring in progress)
reportsRouter.get(
  '/session/:sessionId',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError(400, 'VALIDATION', 'sessionId is required');
    const { code, body } = await getReport(req.interviewer!.id, sessionId);
    res.status(code).json(body);
  }),
);

const pct = z.number().int().min(0).max(100);

const overrideSchema = z.object({
  flag: z.enum(['adjusted', 'disagree']),
  // Required, and required to say something — an override without a reason is
  // indistinguishable from a mistake when someone reads the report later.
  note: z.string().trim().min(1),
  total_pct: pct.optional(),
  core_pct: pct.optional(),
  senior_signal_pct: pct.optional(),
  trap_pct: pct.optional(),
  evidence_pct: pct.optional(),
});

// PUT /reports/session/:sessionId/questions/:questionId/override — record the
// interviewer's disagreement with an AI score. Stored alongside it; the AI's
// own numbers are never touched. Idempotent: re-sending replaces the override.
reportsRouter.put(
  '/session/:sessionId/questions/:questionId/override',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId, questionId } = req.params;
    if (!sessionId || !questionId) {
      throw new AppError(400, 'VALIDATION', 'sessionId and questionId are required');
    }
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION',
        'flag and a non-empty note are required; scores must be 0–100',
      );
    }
    res.json(await setScoreOverride(req.interviewer!.id, sessionId, questionId, parsed.data));
  }),
);

// DELETE …/override — withdraw the override. The AI score was never modified,
// so this simply stops the override being applied on top of it.
reportsRouter.delete(
  '/session/:sessionId/questions/:questionId/override',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId, questionId } = req.params;
    if (!sessionId || !questionId) {
      throw new AppError(400, 'VALIDATION', 'sessionId and questionId are required');
    }
    res.json(await clearScoreOverride(req.interviewer!.id, sessionId, questionId));
  }),
);
