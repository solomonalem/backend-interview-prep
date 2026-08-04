import { Router } from 'express';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { getReport } from '../services/report.service.js';

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
