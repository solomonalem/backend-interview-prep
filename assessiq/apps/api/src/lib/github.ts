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

// PEM keys are multi-line. .env carries them with literal \n, so unescape.
const PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

/** False until the human registers the App and fills in the env (design §"PREREQUISITE"). */
export function isGithubConfigured(): boolean {
  return Boolean(GITHUB_APP_ID && PRIVATE_KEY);
}

// Thrown for anything GitHub-side. Carries a status so the service can map a
// 404 from GitHub to our own 404 rather than a 500.
export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
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

async function ghFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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
    throw new GithubError(detail, res.status);
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
