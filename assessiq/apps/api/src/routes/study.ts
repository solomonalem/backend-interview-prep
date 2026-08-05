import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  createStory,
  decodeJd,
  deleteStory,
  getDeck,
  listStories,
  practice,
  recordProgress,
  updateStory,
} from '../services/study.service.js';

// Study mode uses the same interviewer account (job-seeker mode). All auth: authInterviewer.
export const studyRouter = Router();

studyRouter.get(
  '/deck',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json(await getDeck(req.interviewer!.id));
  }),
);

const progressSchema = z.object({
  question_id: z.string().min(1),
  rating: z.enum(['missed', 'partial', 'got_it']),
});
studyRouter.post(
  '/progress',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'question_id and rating are required');
    res.json(await recordProgress(req.interviewer!.id, parsed.data.question_id, parsed.data.rating));
  }),
);

const practiceSchema = z.object({ question_id: z.string().min(1), answer_text: z.string() });
studyRouter.post(
  '/practice',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = practiceSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'question_id and answer_text are required');
    res.json(await practice(parsed.data.question_id, parsed.data.answer_text));
  }),
);

const decodeSchema = z.object({ jd_text: z.string().min(1) });
studyRouter.post(
  '/decode-jd',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = decodeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'jd_text is required');
    res.json(await decodeJd(parsed.data.jd_text));
  }),
);

const storyBody = z.object({
  title: z.string().min(1),
  type: z.enum(['bug_fix', 'feature', 'incident', 'architecture']),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
});

studyRouter.get(
  '/stories',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json({ stories: await listStories(req.interviewer!.id) });
  }),
);

studyRouter.post(
  '/stories',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = storyBody.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid story');
    res.status(201).json(await createStory(req.interviewer!.id, parsed.data));
  }),
);

studyRouter.put(
  '/stories/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'story id is required');
    const parsed = storyBody.partial().extend({ tags: z.array(z.string()).optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid story update');
    res.json(await updateStory(req.interviewer!.id, id, parsed.data));
  }),
);

studyRouter.delete(
  '/stories/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'story id is required');
    await deleteStory(req.interviewer!.id, id);
    res.status(204).end();
  }),
);
