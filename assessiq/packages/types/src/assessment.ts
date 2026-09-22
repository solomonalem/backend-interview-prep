import type { Difficulty, QuestionType } from './question.js';

export interface ProctoringConfig {
  track_tab_switches: boolean;
  track_focus_loss: boolean;
  detect_paste: boolean;
  detect_idle: boolean;
  tab_switch_flag_threshold: number;
}

export type LinkStatus = 'not_opened' | 'opened' | 'in_progress' | 'submitted' | 'expired';

// ── Follow-up probes ─────────────────────────────────────────────────────────
// After an answer, one follow-up written from the candidate's own words and
// answered under a short timer. What the interviewer reads is not the defense
// score but the DELTA against the answer it defends.

/**
 * `off`          — no probes at all; identical to the pre-feature behavior.
 * `flagged_only` — only where verification matters most. See PROBE_MODE_NOTE:
 *                  scoring is async, so at answer-submit time the paste flag is
 *                  the only signal that exists.
 * `all`          — every answered question gets one.
 */
export type ProbesMode = 'off' | 'flagged_only' | 'all';

export const PROBES_MODES: ProbesMode[] = ['off', 'flagged_only', 'all'];

/** What a manager should get when they express no preference. Deliberately not
 *  the database column default, which is `off` so that assessments predating
 *  the feature keep behaving exactly as they did. */
export const DEFAULT_PROBES_MODE: ProbesMode = 'flagged_only';

// ── Link expiry ──────────────────────────────────────────────────────────────
// How long an invitation stays open. The options are deliberately few: this is
// a decision a manager makes in passing while sending a link, not a setting.
export const LINK_EXPIRY_DAY_OPTIONS = [3, 7, 14] as const;
/** What a link gets when nobody says otherwise. */
export const DEFAULT_LINK_EXPIRY_DAYS = 7;

// ── Reminders ────────────────────────────────────────────────────────────────
/** Days of silence before an automatic nudge, when a manager turns them on. */
export const DEFAULT_AUTO_REMINDER_DAYS = 3;

export const DEFAULT_PROBE_SECONDS = 90;
export const MIN_PROBE_SECONDS = 60;
export const MAX_PROBE_SECONDS = 180;

// ── POST /assessments ────────────────────────────────────────────────────────
export interface CreateAssessmentRequest {
  title: string;
  question_ids: string[]; // ordered
  timer_enabled: boolean;
  timer_seconds?: number;
  proctoring_config?: ProctoringConfig;
  confidence_rating_enabled: boolean;
  /**
   * Remind candidates who haven't started after this many days. Omitted or
   * null leaves it off — an assessment that emails people by itself is a
   * decision, not a default.
   */
  auto_reminder_days?: number | null;
  /** Omitted → DEFAULT_PROBES_MODE, not the column default. */
  probes_mode?: ProbesMode;
  /** Omitted → DEFAULT_PROBE_SECONDS. Clamped to MIN/MAX at the API. */
  probe_time_seconds?: number;
}

export interface CreateAssessmentResponse {
  id: string;
  title: string;
  timer_enabled: boolean;
  timer_seconds: number | null;
  confidence_rating_enabled: boolean;
  probes_mode: ProbesMode;
  probe_time_seconds: number;
  created_at: string;
}

// ── GET /assessments (list) ──────────────────────────────────────────────────
export interface AssessmentLinkSummary {
  id: string;
  token: string;
  candidate_label: string | null;
  candidate_email: string | null;
  /** The manager's record this link is filed under, when it has one. */
  candidate_id: string | null;
  /** null means the link never expires. */
  expires_at: string | null;
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
  /** The manager's record this link is filed under, when it has one. */
  candidate_id: string | null;
  /** null means the link never expires. */
  expires_at: string | null;
  /** When a reminder was last sent by hand. null if never. */
  reminder_sent_at: string | null;
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
  /**
   * How many days the link stays open. Omitted → DEFAULT_LINK_EXPIRY_DAYS;
   * explicit null → no expiry.
   */
  expires_in_days?: number | null;
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
export interface UpdateLinkRequest {
  /** null clears the label back to the unlabelled fallback. */
  candidate_label?: string | null;
  /**
   * Re-open an expired link, or change when it closes. Counted from NOW, not
   * from when the link was made — extending something that lapsed yesterday by
   * "3 days" means three days from today, which is what the manager meant.
   * Explicit null removes the expiry entirely.
   */
  expires_in_days?: number | null;
}

// ── POST /assessments/:id/links/:linkId/reminder ─────────────────────────────
/** A nudge to a candidate who hasn't started. Delivery is never assumed. */
export interface SendReminderResponse {
  status: InviteEmailStatus;
  error?: string;
  /** When this one went out (or was attempted). */
  reminder_sent_at: string;
}

export interface CreateLinkResponse {
  id: string;
  token: string;
  url: string;
  /** null means the link never expires. */
  expires_at: string | null;
  /** Echoes what the link was actually named — may be a generated default. */
  candidate_label: string | null;
  candidate_email: string | null;
  email_status: InviteEmailStatus;
  /** Present when email_status is 'failed' — shown to the manager verbatim. */
  email_error?: string;
}
