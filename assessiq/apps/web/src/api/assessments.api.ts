import type {
  AssessmentDetail,
  AssessmentListResponse,
  CreateAssessmentRequest,
  CreateAssessmentResponse,
  CreateLinkRequest,
  CreateLinkResponse,
} from '@assessiq/types';
import { api } from './client';

export const assessmentsApi = {
  create: (body: CreateAssessmentRequest) =>
    api.post<CreateAssessmentResponse>('/assessments', body),
  list: () => api.get<AssessmentListResponse>('/assessments'),
  get: (id: string) => api.get<AssessmentDetail>(`/assessments/${id}`),
  createLink: (id: string, body: CreateLinkRequest = {}) =>
    api.post<CreateLinkResponse>(`/assessments/${id}/links`, body),
};
