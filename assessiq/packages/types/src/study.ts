import type { Difficulty, QuestionType } from './question.js';

export type StudyRating = 'missed' | 'partial' | 'got_it';

// ── GET /study/deck ──────────────────────────────────────────────────────────
export interface StudyDeckItem {
  question: {
    id: string;
    text: string;
    topic: string;
    difficulty: Difficulty;
    type: QuestionType;
    core_answer_display: string;
    senior_signal_display: string;
    trap_display: string;
  };
  progress: { rating: StudyRating; next_review: string; review_count: number } | null;
}

export interface WeakTopic {
  topic: string;
  avg_confidence: number; // 0–100
  question_count: number;
}

export interface StudyDeckResponse {
  due_today: StudyDeckItem[];
  weak_topics: WeakTopic[];
  streak_days: number;
}

// ── POST /study/progress ─────────────────────────────────────────────────────
export interface RecordProgressRequest {
  question_id: string;
  rating: StudyRating;
}
export interface RecordProgressResponse {
  next_review: string;
}

// ── POST /study/practice ─────────────────────────────────────────────────────
export interface PracticeRequest {
  question_id: string;
  answer_text: string;
}
export interface PracticeResponse {
  score: {
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
  };
  rubric: {
    core_answer_display: string;
    senior_signal_display: string;
    trap_display: string;
  };
}

// ── POST /study/decode-jd ────────────────────────────────────────────────────
export type JdWeight = 'Critical' | 'High' | 'Differentiator' | 'Low';
export interface DecodeJdRequest {
  jd_text: string;
}
export interface DecodeJdResponse {
  role_title: string;
  domain: string | null;
  topics: { topic: string; weight: JdWeight; question_count: number }[];
}

// ── Stories ──────────────────────────────────────────────────────────────────
export type StoryType = 'bug_fix' | 'feature' | 'incident' | 'architecture';
export interface StoryDTO {
  id: string;
  title: string;
  type: StoryType;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}
export interface CreateStoryRequest {
  title: string;
  type: StoryType;
  situation: string;
  task: string;
  action: string;
  result: string;
}
export interface CreateStoryResponse extends StoryDTO {
  suggested_tags: string[];
}
export interface StoriesListResponse {
  stories: StoryDTO[];
}
