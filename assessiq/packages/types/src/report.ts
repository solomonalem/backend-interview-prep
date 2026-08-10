import type { Difficulty } from './question.js';

export interface ReportPending {
  status: 'scoring_in_progress';
  answers_scored: number;
  total_answers: number;
}

// `adjusted` — the interviewer supplied corrected numbers.
// `disagree`  — the interviewer rejects the score without necessarily giving one.
export type OverrideFlag = 'adjusted' | 'disagree';

/**
 * A human override of an AI score. It is stored and returned ALONGSIDE the AI's
 * own numbers, never in place of them: every `*_pct` on ReportScore is still
 * exactly what the scorer produced. Any field here left null falls back to the
 * AI value for that component.
 */
export interface ScoreOverride {
  flag: OverrideFlag;
  note: string;
  /** null when the interviewer flagged a disagreement without giving a number. */
  total_pct: number | null;
  core_pct: number | null;
  senior_signal_pct: number | null;
  trap_pct: number | null;
  evidence_pct: number | null;
  /** Display name of the interviewer who overrode it — attribution, not an id. */
  by: string | null;
  at: string;
}

export interface ReportScore {
  // ── The AI's original score. Never modified by an override. ────────────────
  total_pct: number;
  core_pct: number;
  core_reasoning: string;
  senior_signal_pct: number;
  senior_signal_reasoning: string;
  trap_pct: number;
  trap_reasoning: string;
  evidence_pct: number;
  evidence_reasoning: string;
  what_was_hit: string[];
  what_was_missed: string[];
  recommended_probe: string;
  /** The interviewer's override, if any. null is the normal case. */
  override: ScoreOverride | null;
}

/** Request body for PUT …/questions/:questionId/override. */
export interface SetScoreOverrideRequest {
  flag: OverrideFlag;
  /** Why. Required — an unexplained override is worse than none. */
  note: string;
  /** Omit to leave the AI value standing for that number. */
  total_pct?: number;
  core_pct?: number;
  senior_signal_pct?: number;
  trap_pct?: number;
  evidence_pct?: number;
}

export interface ReportQuestion {
  position: number;
  question: { id: string; text: string; topic: string; difficulty: Difficulty };
  answer: { text: string; time_spent_ms: number; paste_detected: boolean } | null;
  score: ReportScore | null;
  confidence_rating: number | null;
  confidence_flag: string | null;
}

/** Session-level figures with overrides applied. Sits beside the AI originals. */
export interface ReportOverallOverride {
  total_pct: number;
  verdict: string;
  core_avg: number;
  senior_signal_avg: number;
  trap_avg: number;
  evidence_avg: number;
  /** Scores carrying corrected numbers. */
  adjusted_count: number;
  /** Scores flagged as disagreed-with, whether or not numbers were given. */
  disagreed_count: number;
}

export interface ReportProctoringMark {
  timestamp: number;
  question_index: number;
}
export interface ReportPasteEvent extends ReportProctoringMark {
  char_count: number;
}

export interface ReportView {
  session: {
    id: string;
    candidate_label: string | null;
    started_at: string | null;
    submitted_at: string | null;
    time_used_ms: number;
    auto_submitted: boolean;
  };
  assessment: { title: string; timer_seconds: number | null };
  overall: {
    // The AI's own totals, as compiled when scoring finished. These never move.
    total_pct: number;
    verdict: string;
    core_avg: number;
    senior_signal_avg: number;
    trap_avg: number;
    evidence_avg: number;
    /**
     * The same figures recomputed with every override applied — null when
     * nothing has been overridden. Kept as a separate block so the AI's
     * originals above keep meaning exactly what they always meant.
     */
    override: ReportOverallOverride | null;
  };
  proctoring: {
    tab_switch_count: number;
    tab_switch_timestamps: ReportProctoringMark[];
    focus_loss_count: number;
    paste_events: ReportPasteEvent[];
    idle_count: number;
    context_note: string;
  };
  questions: ReportQuestion[];
  pdf_url: string | null;
}

export type ReportResponse = ReportView | ReportPending;
