// Candidate-facing session types (see docs/08 — Candidate Session Routes).
// Candidates never receive rubric fields — only id/text/topic per question.

import type { SnippetLanguage } from './snippet.js';

export interface CandidateQuestion {
  id: string;
  text: string;
  topic: string;
}

export interface LinkValidateResponse {
  valid: true;
  assessment: {
    title: string;
    question_count: number;
    timer_seconds: number | null;
    proctoring_enabled: boolean;
    confidence_rating_enabled: boolean;
    company_name: string | null;
    /** True when follow-ups can appear. Sent so the instructions page can say
     *  so BEFORE the candidate starts — the same honesty rule as proctoring.
     *  Never says which answers will be probed; that depends on what they
     *  write. */
    probes_enabled: boolean;
    /** The countdown a follow-up carries, in seconds. Disclosed up front. */
    probe_time_seconds: number;
  };
}

export interface StartSessionRequest {
  link_token: string;
}

export interface StartSessionResponse {
  session_id: string;
  session_token: string; // short-lived JWT for candidate calls (Authorization: Bearer)
  expires_at: string | null; // when the timer expires (null if no timer)
  first_question: { position: number; question: CandidateQuestion };
}

export interface QuestionViewResponse {
  position: number;
  total: number;
  question: CandidateQuestion;
  time_remaining_ms: number | null;
}

export interface SubmitAnswerRequest {
  question_id: string;
  position: number;
  text: string;
  /**
   * An optional code sketch supporting the answer. Part of the answer, not a
   * submission of its own: it is sent with it, scored with it, and — when the
   * box was left empty — stored as NULL rather than as an empty string.
   *
   * Never executed. Nothing anywhere in this product runs candidate code.
   */
  snippet_code?: string;
  /** Only meaningful alongside snippet_code. 'auto' (the default) pins nothing. */
  snippet_language?: SnippetLanguage;
  confidence_rating?: number;
  time_spent_ms: number;
}

/**
 * A follow-up, handed to the candidate in the answer-submit response.
 *
 * Inline rather than polled: it is generated inside the submit request under a
 * hard latency budget, and if that budget is missed the field is simply null.
 * The candidate is never told a probe was attempted and lost — a failure of
 * ours must not read as an event in their session.
 */
export interface CandidateProbe {
  id: string;
  text: string;
  /** The countdown for this probe. Auto-submits at zero, empty allowed. */
  time_seconds: number;
}

export interface SubmitAnswerResponse {
  answer_id: string;
  next_position: number | null; // null if that was the last question
  /** Present only when a follow-up is due AND was generated in time. */
  probe: CandidateProbe | null;
}

export interface SubmitProbeAnswerRequest {
  text: string;
  time_spent_ms: number;
}

export interface SubmitProbeAnswerResponse {
  ok: true;
  /** `unanswered` when the box was empty at auto-submit — a legitimate outcome,
   *  recorded as itself rather than dressed up as an answer. */
  status: 'answered' | 'unanswered';
}

export type BehaviorEventType = 'tab_switch' | 'focus_loss' | 'paste' | 'idle';

export interface BehaviorEventInput {
  type: BehaviorEventType;
  timestamp: number; // unix ms
  question_index: number;
  char_count?: number;
  idle_duration_ms?: number;
}

export interface SubmitSessionResponse {
  ok: true;
  message: string;
}
