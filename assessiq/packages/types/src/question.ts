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

// Public shape of a question — NEVER includes the private `_guide` rubric fields.
export interface QuestionListItem {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
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
