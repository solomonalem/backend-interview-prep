import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authInterviewer } from '../middleware/auth.middleware.js';
import { AppError, asyncHandler } from '../middleware/error.middleware.js';
import { AUTH_COOKIE, verifyInterviewerToken } from '../lib/jwt.js';
import {
  adoptInstallation,
  completeInstallation,
  completeSyncCallback,
  disconnect,
  getIntegration,
  getInstallUrl,
  getSyncCandidates,
  startSync,
} from '../services/integration.service.js';

export const integrationsRouter = Router();

// GET /integrations/github — current integration + repos, plus whether this
// server has an App configured at all.
integrationsRouter.get(
  '/github',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json(await getIntegration(req.interviewer!.id));
  }),
);

// POST /integrations/github/install-url — where to send the manager. We don't
// redirect for them: the frontend opens it, so the app keeps its own state.
integrationsRouter.post(
  '/github/install-url',
  authInterviewer,
  asyncHandler(async (_req, res) => {
    res.json({ url: await getInstallUrl() });
  }),
);

const clientUrl = (): string => process.env.CLIENT_URL ?? 'http://localhost:5173';

// Every callback outcome lands the manager back on a page, never on raw JSON —
// this is a top-level browser navigation from github.com, not an XHR.
function backToApp(res: Response, status: string): void {
  res.redirect(`${clientUrl()}/settings/integrations?github=${status}`);
}

/**
 * GET /integrations/github/callback
 *
 * GitHub sends the manager here after they approve the install, with the
 * installation_id it just minted. Auth is the normal session cookie: this is
 * their own browser mid-flow, so they are already logged in.
 *
 * Note for deployment: this relies on the cookie being sent to the API origin.
 * It holds wherever the API and app share a site (including local dev). If they
 * are ever split across unrelated domains, this needs to become a frontend
 * landing page that POSTs the id back with credentials — flagged rather than
 * pre-solved, since the spec specifies this shape.
 */
integrationsRouter.get(
  '/github/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return backToApp(res, 'unauthenticated');

    let ownerId: string;
    try {
      ownerId = verifyInterviewerToken(token).sub;
    } catch {
      return backToApp(res, 'unauthenticated');
    }

    const installationId = req.query.installation_id;
    if (typeof installationId !== 'string' || !installationId) {
      // GitHub also lands here for setup_action=request (the user asked an org
      // owner to approve). There is no installation yet — say so plainly.
      return backToApp(res, 'no_installation');
    }

    try {
      await completeInstallation(ownerId, installationId);
      backToApp(res, 'connected');
    } catch {
      // The manager gets a readable page; the detail is already surfaced by the
      // integration endpoint they land on.
      backToApp(res, 'error');
    }
  }),
);

// ── Sync: recovering an installation that never came back through a redirect ─

// POST /integrations/github/sync/start — begin the authorisation that proves
// which GitHub identity is asking, so we know whose installations to offer.
integrationsRouter.post(
  '/github/sync/start',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json({ url: startSync(req.interviewer!.id) });
  }),
);

// GET /integrations/github/oauth/callback — GitHub returns the manager here.
// Another top-level browser navigation, so every outcome is a redirect to a
// readable page. Auth comes from the signed `state`, not the session cookie:
// state is what ties this callback to the manager who started it.
integrationsRouter.get(
  '/github/oauth/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
      return backToApp(res, 'sync_failed');
    }
    try {
      const { candidates } = await completeSyncCallback(state, code);
      // The candidate list is cached server-side; the page fetches it next.
      backToApp(res, candidates.length ? 'sync_ready' : 'sync_none');
    } catch {
      backToApp(res, 'sync_failed');
    }
  }),
);

// GET /integrations/github/sync/candidates — the verified list from the most
// recent authorisation. Empty once it expires, which the UI treats as "start again".
integrationsRouter.get(
  '/github/sync/candidates',
  authInterviewer,
  asyncHandler(async (req, res) => {
    res.json({ candidates: await getSyncCandidates(req.interviewer!.id) });
  }),
);

const adoptSchema = z.object({ installation_id: z.string().min(1) });

// POST /integrations/github/sync/adopt — adopt one of them. The server checks
// the id against the verified list; anything else is refused.
integrationsRouter.post(
  '/github/sync/adopt',
  authInterviewer,
  asyncHandler(async (req, res) => {
    const parsed = adoptSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'installation_id is required');
    res.json(await adoptInstallation(req.interviewer!.id, parsed.data.installation_id));
  }),
);

// DELETE /integrations/github — disconnect. Repos are kept and the row is
// marked revoked; only re-scanning stops (design §2.1).
integrationsRouter.delete(
  '/github',
  authInterviewer,
  asyncHandler(async (req, res) => {
    await disconnect(req.interviewer!.id);
    res.status(204).end();
  }),
);

// POST /integrations/github/repos/:id/scan lands in Slice 2, with the scan
// pipeline it enqueues onto. Declared here as a 501 rather than a 404 so the
// route's absence reads as "not built yet", not "wrong URL".
integrationsRouter.post(
  '/github/repos/:id/scan',
  authInterviewer,
  asyncHandler(async () => {
    throw new AppError(501, 'NOT_IMPLEMENTED', 'Repository scanning arrives in Slice 2');
  }),
);
