import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET ?? 'dev-only-insecure-secret';
export const AUTH_COOKIE = 'assessiq_token';

export interface InterviewerClaims {
  sub: string; // user id
  email: string;
  role: 'interviewer';
}

export function signInterviewerToken(user: { id: string; email: string }): string {
  const claims: InterviewerClaims = { sub: user.id, email: user.email, role: 'interviewer' };
  return jwt.sign(claims, SECRET, { expiresIn: '7d' });
}

export function verifyInterviewerToken(token: string): InterviewerClaims {
  const decoded = jwt.verify(token, SECRET) as InterviewerClaims;
  if (decoded.role !== 'interviewer') throw new Error('wrong token role');
  return decoded;
}

// ── Candidate session token (short-lived, sent as Authorization: Bearer) ──────
export interface CandidateClaims {
  sub: string; // session id
  role: 'candidate';
}

export function signCandidateToken(sessionId: string): string {
  const claims: CandidateClaims = { sub: sessionId, role: 'candidate' };
  return jwt.sign(claims, SECRET, { expiresIn: '4h' });
}

export function verifyCandidateToken(token: string): CandidateClaims {
  const decoded = jwt.verify(token, SECRET) as CandidateClaims;
  if (decoded.role !== 'candidate') throw new Error('wrong token role');
  return decoded;
}

// Cookie options: httpOnly (JS can't read it), secure in prod, 7-day life.
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
