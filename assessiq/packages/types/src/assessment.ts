import type { Difficulty, QuestionType } from './question.js';

export interface ProctoringConfig {
  track_tab_switches: boolean;
  track_focus_loss: boolean;
  detect_paste: boolean;
  detect_idle: boolean;
  tab_switch_flag_threshold: number;
}

export type LinkStatus = 'not_opened' | 'opened' | 'in_progress' | 'submitted' | 'expired';

// ── POST /assessments ────────────────────────────────────────────────────────
export interface CreateAssessmentRequest {
  title: string;
  question_ids: string[]; // ordered
  timer_enabled: boolean;
  timer_seconds?: number;
  proctoring_config?: ProctoringConfig;
  confidence_rating_enabled: boolean;
}

export interface CreateAssessmentResponse {
  id: string;
  title: string;
  timer_enabled: boolean;
  timer_seconds: number | null;
  confidence_rating_enabled: boolean;
  created_at: string;
}

// ── GET /assessments (list) ──────────────────────────────────────────────────
export interface AssessmentLinkSummary {
  id: string;
  token: string;
  candidate_label: string | null;
  candidate_email: string | null;
  status: LinkStatus;
  overall_score: number | null;
}

export interface AssessmentListItem {
  id: string;
  title: string;
  question_count: number;
  timer_enabled: boolean;
  timer_seconds: number | null;
  created_at: string;
  links: AssessmentLinkSummary[];
}

export interface AssessmentListResponse {
  assessments: AssessmentListItem[];
}

// ── GET /assessments/:id (detail) ────────────────────────────────────────────
export interface AssessmentDetailQuestion {
  position: number;
  question: {
    id: string;
    text: string;
    topic: string;
    difficulty: Difficulty;
    type: QuestionType;
  };
}

export interface AssessmentDetailLink {
  id: string;
  token: string;
  candidate_label: string | null;
  candidate_email: string | null;
  expires_at: string;
  status: LinkStatus;
  session?: {
    id: string;
    status: string;
    started_at: string | null;
    submitted_at: string | null;
    overall_score: number | null;
  };
}

export interface AssessmentDetail {
  id: string;
  title: string;
  timer_enabled: boolean;
  timer_seconds: number | null;
  proctoring_config: ProctoringConfig;
  confidence_rating_enabled: boolean;
  questions: AssessmentDetailQuestion[];
  links: AssessmentDetailLink[];
}

// ── POST /assessments/:id/links ──────────────────────────────────────────────
export interface CreateLinkRequest {
  candidate_label?: string;
  /** When set, the link is emailed here and duplicate detection keys on it. */
  candidate_email?: string;
  expires_in_hours?: number;
  /**
   * Set true to create the link anyway after a DUPLICATE_CANDIDATE 409. The
   * check is deliberately not a separate endpoint — a pre-check could go stale
   * between the check and the create.
   */
  confirm_duplicate?: boolean;
}

/** Whether the invite email actually went out. Never silently assumed sent. */
export type InviteEmailStatus = 'sent' | 'skipped_no_email' | 'skipped_not_configured' | 'failed';

/** Returned in a 409 body when this email already completed this assessment. */
export interface DuplicateCandidate {
  candidate_email: string;
  candidate_label: string | null;
  completed_at: string;
  overall_score: number | null;
}

// ── PATCH /assessments/:id/links/:linkId ─────────────────────────────────────
/** null clears the label back to the unlabelled fallback. */
export interface UpdateLinkRequest {
  candidate_label: string | null;
}

export interface CreateLinkResponse {
  id: string;
  token: string;
  url: string;
  expires_at: string;
  /** Echoes what the link was actually named — may be a generated default. */
  candidate_label: string | null;
  candidate_email: string | null;
  email_status: InviteEmailStatus;
  /** Present when email_status is 'failed' — shown to the manager verbatim. */
  email_error?: string;
}
