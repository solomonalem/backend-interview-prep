// ── Repo grounding, Slice 1 (docs/DESIGN_REPO_GROUNDING.md §7) ───────────────
// The connection between a manager and a GitHub repository. Nothing here ever
// carries source code — Slice 1 carries only which repos are connected.

export type IntegrationProvider = 'github';

/** active = usable. revoked = disconnected; repos are kept, re-scanning stops. */
export type IntegrationStatus = 'active' | 'revoked';

export interface RepoRefView {
  id: string;
  full_name: string;
  default_branch: string;
  /** Set from Slice 2 onwards; always null until scanning exists. */
  last_scan_id: string | null;
}

export interface IntegrationView {
  id: string;
  provider: IntegrationProvider;
  account_login: string;
  status: IntegrationStatus;
  /** Analysis sees only structural summaries, never raw code bodies. */
  strict_mode: boolean;
  connected_at: string;
  repos: RepoRefView[];
}

/**
 * GET /integrations/github. `integration` is null when the manager has never
 * connected one. `configured` is false when the server has no GitHub App
 * credentials — a deployment problem, not a user one, and the UI says so
 * rather than offering a button that cannot work.
 */
export interface IntegrationStatusResponse {
  configured: boolean;
  integration: IntegrationView | null;
}

/** POST /integrations/github/install-url */
export interface InstallUrlResponse {
  url: string;
}
