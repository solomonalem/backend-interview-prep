import type { LinkStatus } from './assessment.js';

/**
 * Candidate records — the manager's CRM view of the people they assess.
 *
 * THE RULE THIS WHOLE FEATURE IS BUILT AROUND: candidates click links,
 * managers keep records. There is no candidate account, no candidate password,
 * no candidate login and no candidate-facing "your results" page anywhere in
 * these types. A Candidate is a row the manager owns, about someone who will
 * never see it.
 */

/** One row in the manager's candidate list. */
export interface CandidateListItem {
  id: string;
  name: string;
  email: string;
  /** How many links have ever been sent to this person. */
  assessments_sent: number;
  /** The most recent thing that happened — a submission, or failing that, an
   *  invite. Null only when a record exists with nothing sent yet. */
  last_activity_at: string | null;
  /** From the most recently submitted session that has a report. */
  latest_verdict: string | null;
  latest_score: number | null;
}

export interface CandidateListResponse {
  candidates: CandidateListItem[];
}

/**
 * One assessment sent to this candidate — a link, plus whatever became of it.
 *
 * This is the journey row. It deliberately carries both the link (so the
 * manager can copy or resend it) and the session (so they can jump to the
 * report), because from the manager's side those are one event.
 */
export interface CandidateJourneyEntry {
  link_id: string;
  token: string;
  assessment_id: string;
  assessment_title: string;
  sent_at: string;
  /** null means the link never expires. */
  expires_at: string | null;
  status: LinkStatus;
  /** The invite URL, ready to copy. */
  url: string;
  session_id: string | null;
  submitted_at: string | null;
  overall_score: number | null;
  verdict: string | null;
  /** False for links matched by email alone — pre-backfill stragglers and
   *  links created before this record existed. Purely informational. */
  linked_by_record: boolean;
}

export interface CandidateDetail {
  id: string;
  name: string;
  email: string;
  notes: string | null;
  created_at: string;
  /** Newest first. */
  journey: CandidateJourneyEntry[];
}

export interface CreateCandidateRequest {
  name: string;
  email: string;
  notes?: string;
}

/** Every field optional — the detail page edits them one at a time. */
export interface UpdateCandidateRequest {
  name?: string;
  email?: string;
  notes?: string | null;
}

/**
 * Returned in a 409 when an email edit would collide with another record.
 *
 * Merging two records is deliberately out of scope for this wave, so the edit
 * is refused and the manager is told which record already holds the address —
 * a silent merge would rewrite history they cannot get back.
 */
export interface CandidateEmailConflict {
  candidate_id: string;
  name: string;
  email: string;
}
