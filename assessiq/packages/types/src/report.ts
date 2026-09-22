import type { Difficulty } from './question.js';
import type { SnippetLanguage } from './snippet.js';

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

/**
 * How well the candidate held up their own answer when asked to go one level
 * deeper on it, under a short timer.
 *
 * `delta` is the whole point: a defense score means little on its own, but the
 * distance between an answer and its defense is a fact about the pair. The
 * report presents it as context for the interviewer's judgment and never draws
 * a conclusion from it.
 */
export type ProbeDeltaFlag = 'defended' | 'partially_defended' | 'not_defended';

export type ReportProbeStatus = 'generated' | 'answered' | 'unanswered' | 'generation_failed';

export interface ReportProbe {
  status: ReportProbeStatus;
  /** null on a generation_failed probe — there is no question to show. */
  text: string | null;
  candidate_answer: string | null;
  time_spent_ms: number | null;
  /** Scored on core + senior signal only. null until the defense is scored. */
  defense_pct: number | null;
  /** answer total − defense_pct. Positive means the defense scored lower. */
  delta: number | null;
  flag: ProbeDeltaFlag | null;
}

export interface ReportQuestion {
  position: number;
  question: { id: string; text: string; topic: string; difficulty: Difficulty };
  answer: {
    text: string;
    time_spent_ms: number;
    paste_detected: boolean;
    /**
     * The code sketch the candidate attached, if any. Shown under the prose in
     * the report and nowhere else. Never executed — it is displayed, quoted and
     * read by a model, and that is the whole of what happens to it.
     */
    snippet_code: string | null;
    /** null when nothing was attached; 'auto' when they left it undeclared. */
    snippet_language: SnippetLanguage | null;
    /**
     * `submitted` — they pressed the button.
     * `draft_at_expiry` — the clock ran out first and their last autosave was
     * promoted. Shown on the report, because a reader is entitled to know
     * whether the candidate chose to hand this in.
     */
    source: 'submitted' | 'draft_at_expiry';
  } | null;
  score: ReportScore | null;
  confidence_rating: number | null;
  confidence_flag: string | null;
  /** null when no follow-up was due on this question. */
  probe: ReportProbe | null;
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
    /**
     * The manager's record for this person, when one exists. Present so the
     * report can link back to their history and offer to send them another
     * assessment — not because the candidate has an account. They do not.
     */
    candidate: { id: string; name: string; email: string } | null;
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
    /**
     * Writes the server accepted inside the expiry grace window — an autosave
     * that was in flight when the clock hit zero. Context, not a flag: it is
     * expected mechanics, and the report says so.
     */
    late_write_count: number;
    context_note: string;
  };
  questions: ReportQuestion[];
  /**
   * The live-round guide, when one has been generated. Always null on a
   * shared view — see the interview kit types below.
   */
  interview_kit: InterviewKit | null;
  pdf_url: string | null;
}

export type ReportResponse = ReportView | ReportPending;

// ── Shareable report links ───────────────────────────────────────────────────
// A read-only link to one report, for people who have no account here and
// should not need one — a teammate, a panel, a hiring committee. The token
// authorises exactly one report view: it is resolved by its own server-side
// path and is not accepted anywhere else in the API.

export interface ReportShareSummary {
  id: string;
  /** The whole URL, ready to copy. */
  url: string;
  created_at: string;
  /** Set once revoked. A dead link stays listed rather than vanishing, so the
   *  manager can see it existed and is now closed. */
  revoked_at: string | null;
}

export interface ReportShareListResponse {
  shares: ReportShareSummary[];
}

// ── Live interview kit ───────────────────────────────────────────────────────
// A bridge from the async report to the live round: what to ask this candidate,
// given what this report actually says about them.
//
// INTERVIEWER-ONLY, and the type says so because the enforcement is elsewhere:
// the shared report builder never populates it. A panel holding a share link
// must not receive the questions their interviewer plans to ask.

export interface InterviewKitQuestion {
  /** The question to ask in the live round. */
  question: string;
  /** The specific thing in THIS report that motivates it. */
  why: string;
  /** Short — what a convincing answer sounds like. */
  strong_answer: string;
  /** Short — what a weak one sounds like. */
  weak_answer: string;
}

export interface InterviewKitAgendaItem {
  minutes: number;
  item: string;
}

export interface InterviewKit {
  questions: InterviewKitQuestion[];
  red_flags: string[];
  agenda: InterviewKitAgendaItem[];
  generated_at: string;
  model_used: string;
}
