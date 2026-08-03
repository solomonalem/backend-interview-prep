import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE, verifyCandidateToken, verifyInterviewerToken } from '../lib/jwt.js';

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

// Requires a valid candidate session JWT in the Authorization: Bearer header.
// When the route is scoped to a session (:id), the token must match that session.
export function authCandidate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
    return;
  }
  try {
    const claims = verifyCandidateToken(token);
    if (req.params.id && req.params.id !== claims.sub) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    req.candidate = { sessionId: claims.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_INVALID' });
  }
}
