import { createHmac, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

// GitHub App client — the ONLY place that talks to api.github.com.
//
// Why an App and not an OAuth token (design §2.1): the manager installs it and
// picks specific repos on github.com, so GitHub itself enforces which repos we
// can see and we never verify ownership ourselves. We hold no long-lived
// credential — installation tokens are minted from the app's private key on
// demand and expire in an hour.
//
// Scope requested at registration is `contents: read` and nothing else. This
// module never reads file contents; Slice 1 only lists repositories.

const API = 'https://api.github.com';

export const GITHUB_APP_ID = process.env.GITHUB_APP_ID ?? '';
export const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG ?? '';

// User-to-server credentials, used ONLY to establish which GitHub identity is
// sitting in front of us so we can tell whose installations are whose. They are
// never used to read repository content — that always goes through an
// installation token. See the sync flow in integration.service.
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';

// PEM keys are multi-line. .env carries them with literal \n, so unescape.
const PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';

export function isWebhookConfigured(): boolean {
  return Boolean(GITHUB_WEBHOOK_SECRET);
}

/**
 * Verify GitHub's `X-Hub-Signature-256` over the RAW body.
 *
 * The comparison is constant-time: a webhook signature check that short-
 * circuits on the first differing byte leaks the expected digest to anyone
 * willing to time it. Returns false rather than throwing, because every
 * failure here is "not from GitHub" and deserves the same answer.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!GITHUB_WEBHOOK_SECRET || !signature) return false;
  const expected = `sha256=${createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on a length mismatch, which is itself an answer.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** False until the human registers the App and fills in the env (design §"PREREQUISITE"). */
export function isGithubConfigured(): boolean {
  return Boolean(GITHUB_APP_ID && PRIVATE_KEY);
}

/**
 * Sync needs the App's OAuth credentials on top of the App itself. Kept as a
 * separate check so the install flow keeps working on a deployment that has
 * only the base credentials configured.
 */
export function isOauthConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

/**
 * Thrown for anything GitHub-side. Carries a status so the service can map a
 * 404 from GitHub to our own 404 rather than a 500.
 *
 * `scope` says WHAT was not found, which matters more than it looks: a 404 on
 * an installation means the app was uninstalled, but a 404 on a repository just
 * means that repo is gone or renamed. Treating them alike disconnected a
 * perfectly good integration the first time a repo went missing.
 */
export type GithubErrorScope = 'app' | 'installation' | 'repo';

export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
    public scope: GithubErrorScope = 'app',
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

/**
 * App-level JWT, signed with the private key. Identifies the APP, not an
 * installation — it can only read app metadata and mint installation tokens.
 * GitHub rejects anything over 10 minutes; 9 leaves room for clock skew.
 */
function appJwt(): string {
  if (!isGithubConfigured()) {
    throw new GithubError('GitHub App is not configured on this server', 503);
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: GITHUB_APP_ID },
    PRIVATE_KEY,
    { algorithm: 'RS256' },
  );
}

async function ghFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
  scope: GithubErrorScope = 'app',
): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'AssessIQ',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    // Read GitHub's own message, but never echo a response body wholesale —
    // keep the surface small and predictable (§2.2: nothing incidental logged).
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      // non-JSON error body — the status line is enough
    }
    throw new GithubError(detail, res.status, scope);
  }
  return (await res.json()) as T;
}

/**
 * Exchange an installation id for a short-lived (1 hour) access token.
 * Never persisted — mint one per operation and let it expire.
 */
export async function installationToken(installationId: string): Promise<string> {
  const { token } = await ghFetch<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt(),
    { method: 'POST' },
    // Refusal here IS the revocation signal — the installation itself is gone.
    'installation',
  );
  return token;
}

export interface GithubInstallation {
  id: string;
  account_login: string;
}

/** Confirms an installation exists and reads which account it belongs to. */
export async function getInstallation(installationId: string): Promise<GithubInstallation> {
  const data = await ghFetch<{ id: number; account: { login: string } | null }>(
    `/app/installations/${installationId}`,
    appJwt(),
    undefined,
    'installation',
  );
  return { id: String(data.id), account_login: data.account?.login ?? 'unknown' };
}

export interface GithubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
}

/**
 * The repos the manager granted — exactly the picker's selection, nothing more.
 * Paginated because an org install can exceed one page.
 */
export async function listInstallationRepos(installationId: string): Promise<GithubRepo[]> {
  const token = await installationToken(installationId);
  const repos: GithubRepo[] = [];

  for (let page = 1; page <= 10; page++) {
    const data = await ghFetch<{
      repositories: { full_name: string; default_branch: string; private: boolean }[];
    }>(`/installation/repositories?per_page=100&page=${page}`, token);

    repos.push(
      ...data.repositories.map((r) => ({
        full_name: r.full_name,
        default_branch: r.default_branch,
        private: r.private,
      })),
    );
    if (data.repositories.length < 100) break;
  }
  return repos;
}

// ── User-to-server: proving whose installation is whose ──────────────────────
// Recovery path for when the install redirect never happens (the manager
// installed or edited the app directly on github.com). We cannot simply list
// the App's installations and offer them: /app/installations returns EVERY
// customer's installation, so adopting from it would be a cross-tenant hole
// (design §2.4). Instead the manager authenticates with GitHub, and GitHub
// tells us which installations THEY can see.

/** Where the manager authorises us to read their GitHub identity. */
export function userAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({ client_id: GITHUB_CLIENT_ID, state });
  return `https://github.com/login/oauth/authorize?${p.toString()}`;
}

/**
 * Trade the callback code for a user access token. Short-lived and never
 * persisted — it is used once, in this request, to enumerate installations.
 */
export async function exchangeUserCode(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'AssessIQ',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) throw new GithubError('Could not exchange the GitHub code', res.status);

  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!body.access_token) {
    // Never echo the body — it can carry the client secret back in some error shapes.
    throw new GithubError(body.error_description ?? 'GitHub declined the authorisation', 401);
  }
  return body.access_token;
}

export interface UserInstallation {
  id: string;
  account_login: string;
  account_type: string;
  /** 'selected' | 'all' — surfaced so the UI can warn about an all-repos install. */
  repository_selection: string;
}

/**
 * The installations THIS GitHub user can access. Scoped by GitHub itself, which
 * is the whole point: it is the only authority on whose installation is whose.
 */
export async function listUserInstallations(userToken: string): Promise<UserInstallation[]> {
  const data = await ghFetch<{
    installations: {
      id: number;
      account: { login: string; type: string } | null;
      repository_selection: string;
    }[];
  }>('/user/installations?per_page=100', userToken);

  return data.installations.map((i) => ({
    id: String(i.id),
    account_login: i.account?.login ?? 'unknown',
    account_type: i.account?.type ?? 'unknown',
    repository_selection: i.repository_selection,
  }));
}

/**
 * Where to send the manager to install the app. The slug is the app's public
 * name in its URL; falling back to GET /app means one less thing to configure
 * wrongly, at the cost of one request.
 */
export async function installUrl(): Promise<string> {
  if (GITHUB_APP_SLUG) return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;
  const app = await ghFetch<{ html_url: string }>('/app', appJwt());
  return `${app.html_url}/installations/new`;
}
