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
