import { Router } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  clearScoreOverride,
  getReport,
  getSharedReport,
  setScoreOverride,
} from '../services/report.service.js';
import {
  createReportShare,
  listReportShares,
  revokeReportShare,
} from '../services/report-share.service.js';
import {
  renderReportPdf,
  renderSharedReportPdf,
  type RenderedReportPdf,
} from '../services/report-pdf.service.js';

// One way to put a PDF on the wire, used by both the owner's route and the
// shared one, so the two cannot disagree about headers.
function sendPdf(res: import('express').Response, out: RenderedReportPdf): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.setHeader('Content-Length', out.pdf.length);
  res.end(out.pdf);
}

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

// ── Shared report links ──────────────────────────────────────────────────────
// NOTE THE ORDER: this public route is declared before the authenticated ones
// and matches a distinct path segment (/shared/:token), so nothing that takes
// a session id can ever be reached with a share token. The token is resolved
// by getSharedReport alone.

// GET /reports/shared/:token — PUBLIC. One report, read-only, no account.
reportsRouter.get(
  '/shared/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new AppError(400, 'VALIDATION', 'token is required');
    const { code, body } = await getSharedReport(token);
    res.status(code).json(body);
  }),
);

// GET /reports/shared/:token/pdf — PUBLIC. The shared report as a document,
// resolved by the same token path and therefore carrying the same omissions.
reportsRouter.get(
  '/shared/:token/pdf',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token) throw new AppError(400, 'VALIDATION', 'token is required');
    sendPdf(res, await renderSharedReportPdf(token));
  }),
);

// GET /reports/session/:sessionId/pdf — the manager's export
reportsRouter.get(
  '/session/:sessionId/pdf',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError(400, 'VALIDATION', 'sessionId is required');
    sendPdf(res, await renderReportPdf(req.interviewer!.id, sessionId));
  }),
);

// POST /reports/session/:sessionId/shares — mint a read-only link
reportsRouter.post(
  '/session/:sessionId/shares',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError(400, 'VALIDATION', 'sessionId is required');
    res.status(201).json(await createReportShare(req.interviewer!.id, sessionId));
  }),
);

// GET /reports/session/:sessionId/shares — what has been handed out
reportsRouter.get(
  '/session/:sessionId/shares',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId) throw new AppError(400, 'VALIDATION', 'sessionId is required');
    res.json(await listReportShares(req.interviewer!.id, sessionId));
  }),
);

// DELETE /reports/shares/:shareId — close one link off
reportsRouter.delete(
  '/shares/:shareId',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { shareId } = req.params;
    if (!shareId) throw new AppError(400, 'VALIDATION', 'shareId is required');
    res.json(await revokeReportShare(req.interviewer!.id, shareId));
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
