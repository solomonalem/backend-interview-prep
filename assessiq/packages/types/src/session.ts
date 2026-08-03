// Candidate-facing session types (see docs/08 — Candidate Session Routes).
// Candidates never receive rubric fields — only id/text/topic per question.

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
  confidence_rating?: number;
  time_spent_ms: number;
}

export interface SubmitAnswerResponse {
  answer_id: string;
  next_position: number | null; // null if that was the last question
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
