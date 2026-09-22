import type {
  CandidateDetail,
  CandidateListResponse,
  CreateCandidateRequest,
  UpdateCandidateRequest,
} from '@assessiq/types';
import { api } from './client';

export const candidatesApi = {
  list: (search?: string) =>
    api.get<CandidateListResponse>(
      `/candidates${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  get: (id: string) => api.get<CandidateDetail>(`/candidates/${id}`),
  create: (body: CreateCandidateRequest) => api.post<CandidateDetail>('/candidates', body),
  update: (id: string, body: UpdateCandidateRequest) =>
    api.patch<CandidateDetail>(`/candidates/${id}`, body),
  // Removes the record only — links, sessions and reports are untouched.
  remove: (id: string) => api.del<{ ok: true }>(`/candidates/${id}`),
};
