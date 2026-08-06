import type {
  QuestionFilters,
  QuestionListResponse,
  QuestionMatchFilters,
  QuestionMatchResponse,
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
};
