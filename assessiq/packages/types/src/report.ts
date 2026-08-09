import type { Difficulty } from './question.js';

export interface ReportPending {
  status: 'scoring_in_progress';
  answers_scored: number;
  total_answers: number;
}

export interface ReportScore {
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
}

export interface ReportQuestion {
  position: number;
  question: { id: string; text: string; topic: string; difficulty: Difficulty };
  answer: { text: string; time_spent_ms: number; paste_detected: boolean } | null;
  score: ReportScore | null;
  confidence_rating: number | null;
  confidence_flag: string | null;
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
    total_pct: number;
    verdict: string;
    core_avg: number;
    senior_signal_avg: number;
    trap_avg: number;
    evidence_avg: number;
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
