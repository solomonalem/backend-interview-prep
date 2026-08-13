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
  /**
   * Whether "Sync from GitHub" can run. Needs the App's OAuth credentials on
   * top of the App itself, so a deployment can have `configured: true` and this
   * false — the install flow works, recovery doesn't.
   */
  sync_available: boolean;
  integration: IntegrationView | null;
}

/** POST /integrations/github/install-url */
export interface InstallUrlResponse {
  url: string;
}

/**
 * An installation GitHub confirmed this manager can see. Only these can be
 * adopted — the server refuses anything outside the list it verified.
 */
export interface SyncCandidate {
  id: string;
  account_login: string;
  account_type: string;
  /** 'selected' | 'all'. An all-repos install is worth warning about. */
  repository_selection: string;
}

export interface SyncCandidatesResponse {
  candidates: SyncCandidate[];
}

export interface AdoptInstallationRequest {
  installation_id: string;
}

// ── Repo scanning, Slice 2 (design §5) ───────────────────────────────────────

export type ScanStatus = 'queued' | 'cloning' | 'analyzing' | 'done' | 'failed';

export type FindingKind = 'stack' | 'pattern' | 'risk' | 'architecture' | 'domain';

export const FINDING_KINDS: FindingKind[] = [
  'architecture',
  'pattern',
  'risk',
  'stack',
  'domain',
];

/** Counts and labels only — never anything derived from file contents. */
export interface ScanStats {
  files_seen: number;
  files_selected: number;
  files_analyzed: number;
  tokens_used: number;
  stack: string[];
  libraries: string[];
}

export interface ScanView {
  id: string;
  repo_ref_id: string;
  repo_full_name: string;
  status: ScanStatus;
  /** Set when analysis failed partway: findings are real but incomplete. */
  partial: boolean;
  error: string | null;
  stats: ScanStats | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  finding_count: number;
}

/**
 * A derived observation. `detail` is prose ABOUT the code. `excerpt` is the one
 * place any source appears, capped at 3 lines and null in strict mode.
 */
export interface FindingView {
  id: string;
  kind: FindingKind;
  title: string;
  detail: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  excerpt: string | null;
}

export interface ScanFindingsResponse {
  scan: ScanView;
  findings: FindingView[];
}

/** The most recent scan per repo, for the integrations screen. */
export interface RepoScanSummary {
  repo_ref_id: string;
  latest: ScanView | null;
}
