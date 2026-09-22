import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
} from '../services/template.service.js';

export const templatesRouter = Router();

// GET /templates — built-ins plus the manager's own
templatesRouter.get(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json(await listTemplates(req.interviewer!.id));
  }),
);

// GET /templates/:id — resolved against the bank as it is now, with a count of
// anything that has since become unusable
templatesRouter.get(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'template id is required');
    res.json(await getTemplate(req.interviewer!.id, id));
  }),
);

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  question_ids: z.array(z.string().min(1)).min(1),
  timer_minutes: z.number().int().positive().nullable().optional(),
  probes_mode: z.enum(['off', 'flagged_only', 'all']).optional(),
  probe_time_seconds: z.number().int().positive().optional(),
});

// POST /templates — save a recipe of your own
templatesRouter.post(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'A title and at least one question are required');
    }
    res.status(201).json(await createTemplate(req.interviewer!.id, parsed.data));
  }),
);

// DELETE /templates/:id — own templates only; a built-in has no owner and can
// never match
templatesRouter.delete(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'template id is required');
    res.json(await deleteTemplate(req.interviewer!.id, id));
  }),
);
