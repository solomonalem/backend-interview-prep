import { Router } from 'express';
import { z } from 'zod';
import { AUTH_COOKIE, authCookieOptions, signInterviewerToken } from '../lib/jwt.js';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import {
  exchangeGoogleCode,
  getInterviewerById,
  loginWithPassword,
} from '../services/auth.service.js';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const googleSchema = z.object({ code: z.string().min(1) });

// POST /auth/login — email + password
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'email and password are required');
    const user = await loginWithPassword(parsed.data.email, parsed.data.password);
    res.cookie(AUTH_COOKIE, signInterviewerToken(user), authCookieOptions());
    res.json({ user });
  }),
);

// POST /auth/google — exchange OAuth code
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'code is required');
    const user = await exchangeGoogleCode(parsed.data.code);
    res.cookie(AUTH_COOKIE, signInterviewerToken(user), authCookieOptions());
    res.json({ user });
  }),
);

// POST /auth/logout — clear cookie
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// GET /auth/me — current interviewer
authRouter.get(
  '/me',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const user = await getInterviewerById(req.interviewer!.id);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      company: user.company,
      created_at: user.created_at,
    });
  }),
);
