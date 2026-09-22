import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { sendManualReminder } from '../services/reminder.service.js';
import {
  createAssessment,
  createLink,
  getAssessmentDetail,
  listAssessments,
  updateLink,
} from '../services/assessment.service.js';

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
  auto_reminder_days: z.number().int().positive().max(30).nullable().optional(),
  probes_mode: z.enum(['off', 'flagged_only', 'all']).optional(),
  // Clamped in the service rather than rejected here — see clampProbeSeconds.
  probe_time_seconds: z.number().int().positive().optional(),
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

// GET /assessments — list assessments owned by the interviewer
assessmentsRouter.get(
  '/',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json(await listAssessments(req.interviewer!.id));
  }),
);

// GET /assessments/:id — full detail (ownership enforced in the service)
assessmentsRouter.get(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'assessment id is required');
    res.json(await getAssessmentDetail(req.interviewer!.id, id));
  }),
);

const createLinkSchema = z.object({
  // Both stay optional — the quick "just send me a link" path must survive.
  candidate_label: z.string().min(1).optional(),
  candidate_email: z.string().email().optional(),
  // Explicit null is meaningful: "no expiry", as opposed to "didn't say".
  expires_in_days: z.number().int().positive().max(365).nullable().optional(),
  confirm_duplicate: z.boolean().optional(),
});

// POST /assessments/:id/links — generate a shareable candidate link
assessmentsRouter.post(
  '/:id/links',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'assessment id is required');
    const parsed = createLinkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const link = await createLink(req.interviewer!.id, id, parsed.data);
    res.status(201).json(link);
  }),
);

// PATCH /assessments/:id/links/:linkId — rename a candidate link, or change
// when it closes. The label is the only thing identifying a candidate (they
// have no account), so it has to be fixable after the link is minted; the
// expiry has to be extendable because an invitation that ran out is a normal
// thing to want to re-open.
const updateLinkSchema = z.object({
  candidate_label: z.string().nullable().optional(),
  expires_in_days: z.number().int().positive().max(365).nullable().optional(),
});

assessmentsRouter.patch(
  '/:id/links/:linkId',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id, linkId } = req.params;
    if (!id || !linkId) throw new AppError(400, 'VALIDATION', 'assessment and link id are required');
    const parsed = updateLinkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'candidate_label or expires_in_days is required');
    }
    res.json(await updateLink(req.interviewer!.id, id, linkId, parsed.data));
  }),
);

// POST /assessments/:id/links/:linkId/reminder — nudge a candidate who hasn't
// started. Manual: the manager decides, and the result says what happened.
assessmentsRouter.post(
  '/:id/links/:linkId/reminder',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id, linkId } = req.params;
    if (!id || !linkId) throw new AppError(400, 'VALIDATION', 'assessment and link id are required');
    res.json(await sendManualReminder(req.interviewer!.id, id, linkId));
  }),
);
