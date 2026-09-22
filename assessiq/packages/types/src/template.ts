import type { ProbesMode, ProctoringConfig } from './assessment.js';
import type { Difficulty, QuestionType } from './question.js';

/**
 * Assessment templates — a saved starting point, never a saved result.
 *
 * Picking one opens the builder pre-filled and fully editable. Nothing is
 * created until the manager presses the button they always press, because a
 * template's job is to save typing, not to take the decision about what is
 * being asked of a person.
 */

/** One question as a template resolves it today. */
export interface TemplateQuestion {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
}

export interface TemplateSummary {
  id: string;
  title: string;
  description: string | null;
  /** How many questions the template asks for — including any now missing. */
  question_count: number;
  timer_minutes: number | null;
  probes_mode: ProbesMode;
  /** True for a seeded template: everyone sees it, nobody can edit it. */
  built_in: boolean;
  created_at: string;
}

export interface TemplateListResponse {
  templates: TemplateSummary[];
}

export interface TemplateDetail extends TemplateSummary {
  /** Resolved, in template order, skipping anything no longer usable. */
  questions: TemplateQuestion[];
  probe_time_seconds: number;
  proctoring_config: ProctoringConfig | null;
  /**
   * Questions the template names that can no longer be used — archived,
   * rejected, or deleted since it was saved.
   *
   * Surfaced rather than silently dropped: a manager who thinks they are
   * sending a 6-question screen should be told it is now 5, and told before
   * they send it.
   */
  missing_count: number;
}

/** Save the assessment currently being looked at as a personal template. */
export interface CreateTemplateRequest {
  title: string;
  description?: string;
  question_ids: string[];
  timer_minutes?: number | null;
  proctoring_config?: ProctoringConfig;
  probes_mode?: ProbesMode;
  probe_time_seconds?: number;
}
