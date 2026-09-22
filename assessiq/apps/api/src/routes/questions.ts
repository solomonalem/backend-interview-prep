import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  getQuestionById,
  listPreviouslyUsed,
  listQuestions,
  matchQuestions,
} from '../services/question.service.js';
import {
  approveDraft,
  buildQuestionPool,
  draftRubricForQuestion,
  generateForFinding,
  listDocumentQuestions,
  listGroundedQuestions,
  queueGenerationFromFindings,
  generateQuestions,
  getDraftForReview,
  refineDraft,
  rejectDraft,
  loadQuestionForReview,
} from '../services/generation.service.js';
import {
  checkDocumentSufficiency,
  queueGenerationFromDocument,
} from '../services/document.service.js';
import { exportQuestions, importQuestions, updateQuestion } from '../services/bank.service.js';
import { extractDocumentText } from '../lib/document-extract.js';
import { DOCUMENT_MAX_CHARS, DOCUMENT_MAX_UPLOAD_BYTES } from '@assessiq/types';

export const questionsRouter = Router();

const filterSchema = z.object({
  topic: z.string().optional(),
  source: z.enum(['manual', 'generated', 'repo_grounded', 'document_grounded']).optional(),
  difficulty: z.enum(['junior', 'mid', 'senior', 'staff']).optional(),
  type: z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral']).optional(),
  domain: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['vetted', 'draft']).optional(),
  tag: z.string().optional(),
  // Query strings carry text, so the flag arrives as "true"/"false".
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(['newest', 'oldest', 'most_used', 'topic']).optional(),
  // Usage stats cost two extra queries per page, so the bank asks for them
  // and the builder's search — which fires on every keystroke — does not.
  usage: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
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
    const { usage, ...filters } = parsed.data;
    res.json(await listQuestions(filters, { withUsage: usage }));
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

const previouslyUsedSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// GET /questions/previously-used — vetted questions this manager has already
// used in an assessment, most-recently-used first. Before '/:id', like /match.
questionsRouter.get(
  '/previously-used',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = previouslyUsedSchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid query parameters');
    res.json(await listPreviouslyUsed(req.interviewer!.id, parsed.data.limit));
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
  rateLimit({ bucket: 'generate', limit: 40, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'technology and seniority are required');
    }
    const questions = await generateQuestions(parsed.data, req.interviewer!.id);
    res.status(201).json({ questions });
  }),
);

const poolSchema = z.object({
  technology: z.array(z.string().min(1)).min(1),
  seniority: difficultyEnum,
  type: z.array(typeEnum).optional(),
  target: z.number().int().min(1).max(30).optional(),
  generate: z.boolean().optional(),
});

// POST /questions/pool — bank matches, topped up with generated drafts if the
// bank cannot fill the target. Populates the pool only; selects nothing.
questionsRouter.post(
  '/pool',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = poolSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'technology and seniority are required');
    }
    res.json(await buildQuestionPool(parsed.data, req.interviewer!.id));
  }),
);

const fromRepoSchema = z.object({
  finding_ids: z.array(z.string().min(1)).min(1).max(20),
  seniority: difficultyEnum,
  type: typeEnum.optional(),
  count_per_finding: z.number().int().min(1).max(3).optional(),
});

// POST /questions/generate-from-repo — questions grounded in the manager's own
// codebase. Output is ordinary drafts: the review gate is unchanged, because
// grounding changes what a question is about, not how it earns approval.
questionsRouter.post(
  '/generate-from-repo',
  authInterviewer,
  // Each request fans out to one Claude call per finding, up to 20 findings.
  rateLimit({ bucket: 'generate-repo', limit: 20, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const parsed = fromRepoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'finding_ids and seniority are required');
    }
    // 202: queued, not done. The drafts arrive via GET /questions/grounded.
    res.status(202).json(await queueGenerationFromFindings(parsed.data, req.interviewer!.id));
  }),
);

const groundedSchema = z.object({ scan_id: z.string().min(1).optional() });

// GET /questions/grounded — repo-grounded questions split into awaiting-review
// and vetted. Backs both the review list and the "where did it go" counts.
// Before '/:id', like the other named routes.
questionsRouter.get(
  '/grounded',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = groundedSchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid query parameters');
    res.json(await listGroundedQuestions(req.interviewer!.id, parsed.data.scan_id));
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

// ── Document grounding (Feature A) ───────────────────────────────────────────
// The middle tier, for teams that will never grant repo access. All of these
// sit before '/:id' for the same reason /match does.

/**
 * Memory storage, not disk. The buffer is parsed and discarded within the
 * request — writing it to disk would create a copy of the manager's document
 * that nothing later reads and nothing later cleans up.
 *
 * The size limit is enforced here as well as in the browser; the named
 * constant is shared so the two cannot drift into a confusing rejection.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_UPLOAD_BYTES, files: 1 },
});

// POST /questions/document/extract — multipart upload of one .pdf/.docx/.txt/.md.
// Returns text, never a question: the extraction lands back in the manager's
// editable box so they can see and fix it before anything is generated.
questionsRouter.post(
  '/document/extract',
  authInterviewer,
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      // Multer's own errors are thrown before any handler runs, and its
      // LIMIT_FILE_SIZE message ("File too large") says nothing about what to
      // do next.
      if (err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        return next(
          new AppError(
            413,
            'DOCUMENT_TOO_LARGE',
            `That file is over ${Math.round(DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024))} MB. Paste the relevant section instead.`,
          ),
        );
      }
      if (err) return next(err);
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, 'VALIDATION', 'Attach one file as `file`');
    res.json(await extractDocumentText(file.originalname, file.mimetype, file.buffer));
  }),
);

const documentCheckSchema = z.object({
  text: z.string().min(1).max(DOCUMENT_MAX_CHARS),
  count: z.number().int().min(1).max(12).optional(),
});

// POST /questions/document/check — the sufficiency gate. One cheap Haiku call
// that either clears the document or returns up to 3 concrete follow-ups.
questionsRouter.post(
  '/document/check',
  authInterviewer,
  // Cheap per call, but it is a model call in front of a textarea, so it is
  // exactly the kind of thing an impatient click can run repeatedly.
  rateLimit({ bucket: 'document-check', limit: 60, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const parsed = documentCheckSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'text is required');
    res.json(await checkDocumentSufficiency(parsed.data));
  }),
);

const fromDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(DOCUMENT_MAX_CHARS),
  elicitation: z
    .array(z.object({ question: z.string().min(1), answer: z.string() }))
    .max(3)
    .optional(),
  seniority: difficultyEnum,
  type: typeEnum.optional(),
  count: z.number().int().min(1).max(12).optional(),
  sufficiency_unmet: z.boolean().optional(),
});

// POST /questions/generate-from-document — questions grounded in a document the
// manager supplied. Output is ordinary drafts: the review gate is unchanged,
// because grounding changes what a question is about, not how it earns approval.
questionsRouter.post(
  '/generate-from-document',
  authInterviewer,
  // Each request fans out to up to four Claude calls.
  rateLimit({ bucket: 'generate-document', limit: 20, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const parsed = fromDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'title, text and seniority are required');
    }
    // 202: queued, not done. The drafts arrive via GET /questions/document-grounded.
    res.status(202).json(await queueGenerationFromDocument(parsed.data, req.interviewer!.id));
  }),
);

const documentGroundedSchema = z.object({ document_id: z.string().min(1).optional() });

// GET /questions/document-grounded — document-grounded questions split into
// awaiting-review and vetted. The mirror of /grounded.
questionsRouter.get(
  '/document-grounded',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = documentGroundedSchema.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid query parameters');
    res.json(await listDocumentQuestions(req.interviewer!.id, parsed.data.document_id));
  }),
);

// GET /questions/:id/draft — full draft incl. the private _guide rubric, for
// the owning interviewer to review. Distinct from GET /questions/:id, which
// must never expose those columns.
questionsRouter.get(
  '/:id/draft',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    res.json(await getDraftForReview(id, req.interviewer!.id));
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

// GET /questions/export — the manager's own questions, whole rubric included.
// Declared before /:id so "export" is not read as a question id.
questionsRouter.get(
  '/export',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const data = await exportQuestions(req.interviewer!.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="assessiq-questions-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.end(JSON.stringify(data, null, 2));
  }),
);

const importSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string(),
        topic: z.string(),
        difficulty: z.enum(['junior', 'mid', 'senior', 'staff']),
        type: z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral']),
        domain: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        core_answer_guide: z.string(),
        senior_signal_guide: z.string(),
        trap_guide: z.string(),
        evidence_guide: z.string(),
        core_answer_display: z.string().optional(),
        senior_signal_display: z.string().optional(),
        trap_display: z.string().optional(),
      }),
    )
    .max(500),
});

// POST /questions/import — lands as DRAFTS, always. See bank.service.
questionsRouter.post(
  '/import',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION', 'That file is not a question export.');
    }
    res.json(
      await importQuestions(
        parsed.data as unknown as Parameters<typeof importQuestions>[0],
        req.interviewer!.id,
      ),
    );
  }),
);

const updateSchema = z.object({
  text: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(['junior', 'mid', 'senior', 'staff']).optional(),
  type: z.enum(['conceptual', 'scenario', 'rca', 'design', 'behavioral']).optional(),
  core_answer_guide: z.string().optional(),
  senior_signal_guide: z.string().optional(),
  trap_guide: z.string().optional(),
  evidence_guide: z.string().optional(),
  core_answer_display: z.string().optional(),
  senior_signal_display: z.string().optional(),
  trap_display: z.string().optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// PATCH /questions/:id — edit in place, archive, or restore. Never changes
// status: a vetted question stays vetted, a draft still needs reviewing.
questionsRouter.patch(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Invalid edits');
    res.json(await updateQuestion(id, parsed.data, req.interviewer!.id));
  }),
);

// GET /questions/:id/full — question + rubric, for the edit panel
questionsRouter.get(
  '/:id/full',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'question id is required');
    res.json(await loadQuestionForReview(id, req.interviewer!.id));
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
