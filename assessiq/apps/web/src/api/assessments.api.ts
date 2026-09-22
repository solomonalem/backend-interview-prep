import type {
  AssessmentDetail,
  LinkValidateResponse,
  StartSessionResponse,
  SendReminderResponse,
  UpdateLinkRequest,
  AssessmentDetailLink,
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
  // Rename, re-open, or remove the expiry. Every field optional — the caller
  // sends what it means to change and nothing else.
  updateLink: (id: string, linkId: string, body: UpdateLinkRequest) =>
    api.patch<AssessmentDetailLink>(`/assessments/${id}/links/${linkId}`, body),
  sendReminder: (id: string, linkId: string) =>
    api.post<SendReminderResponse>(`/assessments/${id}/links/${linkId}/reminder`),

  // ── Preview as candidate ───────────────────────────────────────────────────
  // The same two calls the candidate flow makes, against the manager's own
  // assessment, so the preview can reuse the candidate pages unchanged.
  previewMeta: (id: string) =>
    api.get<{ assessment: LinkValidateResponse['assessment'] }>(`/assessments/${id}/preview`),
  startPreview: (id: string) =>
    api.post<StartSessionResponse>(`/assessments/${id}/preview`),
};
