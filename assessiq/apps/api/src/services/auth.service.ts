import type { InterviewerUser } from '@assessiq/types';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { AppError } from '../middleware/error.middleware.js';

function toInterviewerUser(u: {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
}): InterviewerUser {
  return { id: u.id, email: u.email, name: u.name, company: u.company };
}

// ── Email + password login ───────────────────────────────────────────────────
export async function loginWithPassword(
  email: string,
  password: string,
): Promise<InterviewerUser> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    throw new AppError(401, 'AUTH_INVALID', 'Invalid credentials');
  }
  return toInterviewerUser(user);
}

// ── Google OAuth code exchange ───────────────────────────────────────────────
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Not testable locally without
// real credentials — email/password login is the local path.
export async function exchangeGoogleCode(code: string): Promise<InterviewerUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError(501, 'OAUTH_NOT_CONFIGURED', 'Google OAuth is not configured');
  }

  const oauth = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: `${process.env.CLIENT_URL}/auth/google/callback`,
  });

  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw new AppError(401, 'OAUTH_FAILED', 'Google did not return an id_token');

  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new AppError(401, 'OAUTH_FAILED', 'Google account has no email');

  const user = await prisma.user.upsert({
    where: { email: payload.email.toLowerCase() },
    update: { google_id: payload.sub, name: payload.name ?? undefined },
    create: {
      email: payload.email.toLowerCase(),
      google_id: payload.sub,
      name: payload.name ?? null,
    },
  });
  return toInterviewerUser(user);
}

// ── Current user ─────────────────────────────────────────────────────────────
export async function getInterviewerById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}
