import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { createAssessment } from '../services/assessment.service.js';

export const assessmentsRouter = Router();

const proctoringSchema = z.object({
  track_tab_switches: z.boolean(),
  track_focus_loss: z.boolean(),
  detect_paste: z.boolean(),
  detect_idle: z.boolean(),
  tab_switch_flag_threshold: z.number().int().nonnegative(),
});

const createSchema = z.object({
  title: z.string().min(1),
  question_ids: z.array(z.string().min(1)).min(1),
  timer_enabled: z.boolean(),
  timer_seconds: z.number().int().positive().optional(),
  proctoring_config: proctoringSchema.optional(),
  confidence_rating_enabled: z.boolean(),
});

// POST /assessments — create a new assessment
assessmentsRouter.post(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const assessment = await createAssessment(req.interviewer!.id, parsed.data);
    res.status(201).json(assessment);
  }),
);
