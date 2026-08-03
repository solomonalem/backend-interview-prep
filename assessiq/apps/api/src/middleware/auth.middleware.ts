import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE, verifyInterviewerToken } from '../lib/jwt.js';

// Requires a valid interviewer JWT in the httpOnly `assessiq_token` cookie.
// On success, attaches req.interviewer = { id, email }.
export function authInterviewer(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
    return;
  }
  try {
    const claims = verifyInterviewerToken(token);
    req.interviewer = { id: claims.sub, email: claims.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
  }
}
