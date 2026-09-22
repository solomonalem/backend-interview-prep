import type {
  CreateTemplateRequest,
  TemplateDetail,
  TemplateListResponse,
  TemplateSummary,
} from '@assessiq/types';
import { api } from './client';

export const templatesApi = {
  list: () => api.get<TemplateListResponse>('/templates'),
  get: (id: string) => api.get<TemplateDetail>(`/templates/${id}`),
  create: (body: CreateTemplateRequest) => api.post<TemplateSummary>('/templates', body),
  remove: (id: string) => api.del<{ ok: true }>(`/templates/${id}`),
  /** Save the assessment you are looking at, settings and all. */
  saveFromAssessment: (assessmentId: string, body: { title?: string; description?: string }) =>
    api.post<TemplateSummary>(`/assessments/${assessmentId}/template`, body),
};
