import type {
  ApproveQuestionRequest,
  DraftRubricRequest,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  QuestionDraft,
  QuestionFilters,
  QuestionListResponse,
  QuestionMatchFilters,
  QuestionMatchResponse,
  QuestionPoolRequest,
  QuestionPoolResponse,
  PreviouslyUsedResponse,
  RefineQuestionRequest,
} from '@assessiq/types';
import { api } from './client';

function toQuery(f: QuestionFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const questionsApi = {
  list: (filters: QuestionFilters = {}) =>
    api.get<QuestionListResponse>(`/questions${toQuery(filters)}`),

  // Loose builder retrieval — array params go over the wire comma-separated.
  match: (f: QuestionMatchFilters) => {
    const p = new URLSearchParams();
    p.set('technology', f.technology.join(','));
    p.set('seniority', f.seniority);
    if (f.type?.length) p.set('type', f.type.join(','));
    if (f.limit) p.set('limit', String(f.limit));
    return api.get<QuestionMatchResponse>(`/questions/match?${p.toString()}`);
  },

  // Vetted questions this manager has already used, most-recently-used first.
  previouslyUsed: (limit?: number) =>
    api.get<PreviouslyUsedResponse>(
      `/questions/previously-used${limit ? `?limit=${limit}` : ''}`,
    ),

  // ── Stage B ────────────────────────────────────────────────────────────────
  // Bank matches topped up with generated drafts. Slow on a cold bank — every
  // shortfall costs a Claude call.
  pool: (body: QuestionPoolRequest) => api.post<QuestionPoolResponse>('/questions/pool', body),

  generate: (body: GenerateQuestionsRequest) =>
    api.post<GenerateQuestionsResponse>('/questions/generate', body),

  // Manager writes the question, AI drafts its rubric. Same review flow.
  draftRubric: (body: DraftRubricRequest) => api.post<QuestionDraft>('/questions/draft-rubric', body),

  // Full draft incl. the private _guide rubric — interviewer-only, for review.
  refine: (id: string, body: RefineQuestionRequest) =>
    api.post<QuestionDraft>(`/questions/${id}/refine`, body),

  approve: (id: string, edits: ApproveQuestionRequest = {}) =>
    api.post<QuestionDraft>(`/questions/${id}/approve`, edits),

  getDraft: (id: string) => api.get<QuestionDraft>(`/questions/${id}/draft`),

  reject: (id: string) => api.post<null>(`/questions/${id}/reject`),
};
