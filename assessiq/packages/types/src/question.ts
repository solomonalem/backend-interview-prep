export type Difficulty = 'junior' | 'mid' | 'senior' | 'staff';
export type QuestionType = 'conceptual' | 'scenario' | 'rca' | 'design' | 'behavioral';

export const DIFFICULTIES: Difficulty[] = ['junior', 'mid', 'senior', 'staff'];
export const QUESTION_TYPES: QuestionType[] = [
  'conceptual',
  'scenario',
  'rca',
  'design',
  'behavioral',
];

// vetted = human-approved. draft = AI-generated, not yet reviewed. Retrieval
// returns both, always labelled, so a draft can never pass for vetted.
export type QuestionStatus = 'vetted' | 'draft';

// Public shape of a question — NEVER includes the private `_guide` rubric fields.
export interface QuestionListItem {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
  status: QuestionStatus;
  core_answer_display: string;
  senior_signal_display: string;
  trap_display: string;
}

export interface QuestionListResponse {
  questions: QuestionListItem[];
  total: number;
  page: number;
  pages: number;
}

export interface QuestionFilters {
  topic?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  domain?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ── GET /questions/match ─────────────────────────────────────────────────────
// Loose retrieval for the assessment builder: a question surfaces if it matches
// AT LEAST ONE key, and is ranked by how many it matched. Deliberately not a
// strict AND — with a small bank, strict matching returns nothing useful.
export type QuestionMatchKey = 'topic' | 'difficulty' | 'type';

export interface QuestionMatchFilters {
  technology: string[]; // matched against Question.topic
  seniority: Difficulty; // matched against Question.difficulty
  type?: QuestionType[]; // matched against Question.type
  limit?: number;
}

export interface QuestionMatchItem extends QuestionListItem {
  matched_on: QuestionMatchKey[];
  match_score: number; // matched_on.length — 3 is a full match
}

export interface QuestionMatchResponse {
  questions: QuestionMatchItem[];
  total: number;
  page: number;
  pages: number;
}

// ── Generation (Stage B) ─────────────────────────────────────────────────────
// A draft carries the full rubric, private `_guide` fields included. This shape
// is ONLY ever sent to an authenticated interviewer reviewing the draft — it is
// never part of a candidate-facing payload.
export interface QuestionDraft {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
  status: QuestionStatus;
  core_answer_guide: string;
  senior_signal_guide: string;
  trap_guide: string;
  evidence_guide: string;
  core_answer_display: string;
  senior_signal_display: string;
  trap_display: string;
}

export interface GenerateQuestionsRequest {
  technology: string;
  seniority: Difficulty;
  type?: QuestionType;
  domain?: string;
  /** A specific thing to probe, e.g. "at-least-once delivery and dedup". */
  concern?: string;
  count?: number;
  /** Question ids already on screen or in the tray, so drafts don't repeat them. */
  exclude?: string[];
}

export interface GenerateQuestionsResponse {
  questions: QuestionDraft[];
}

/** Free-text question written by the manager; the AI drafts its rubric. */
export interface DraftRubricRequest {
  text: string;
  topic: string;
  seniority: Difficulty;
  type?: QuestionType;
  domain?: string;
}

/** Manager's edits, applied at approve time. Any omitted field keeps its draft value. */
export interface ApproveQuestionRequest {
  text?: string;
  core_answer_guide?: string;
  senior_signal_guide?: string;
  trap_guide?: string;
  evidence_guide?: string;
  core_answer_display?: string;
  senior_signal_display?: string;
  trap_display?: string;
}

export interface RefineQuestionRequest {
  /** What the manager wants changed, e.g. "make it payment-specific". */
  instruction: string;
}

// ── Candidate pool (Stage B part 4) ──────────────────────────────────────────
export interface QuestionPoolRequest {
  technology: string[];
  seniority: Difficulty;
  type?: QuestionType[];
  /** Minimum size of the pool to present. Defaults to 15. */
  target?: number;
  /** false to show bank matches only, with no generation. */
  generate?: boolean;
}

export interface QuestionPoolResponse {
  /** Bank matches first, then anything freshly generated to fill the gap. */
  questions: QuestionMatchItem[];
  bank_count: number;
  generated_count: number;
  /** Set when generation was attempted and failed — never silently swallowed. */
  generation_error: string | null;
}
