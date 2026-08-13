import { Router } from 'express';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { getScan, getScanFindings } from '../services/scan.service.js';

export const repoScansRouter = Router();

// GET /repo-scans/:id — status + stats. Owner-scoped; 404 on anything else.
repoScansRouter.get(
  '/:id',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'scan id is required');
    res.json(await getScan(req.interviewer!.id, id));
  }),
);

// GET /repo-scans/:id/findings — the derived observations and their citations.
// Never carries source beyond the ≤3-line excerpt (design §2.2).
repoScansRouter.get(
  '/:id/findings',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw new AppError(400, 'VALIDATION', 'scan id is required');
    res.json(await getScanFindings(req.interviewer!.id, id));
  }),
);
