import type { QuestionFilters, QuestionListResponse } from '@assessiq/types';
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
};
