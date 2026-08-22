import type { ReportResponse, ReportView, SetScoreOverrideRequest } from '@assessiq/types';
import { api } from './client';

export const reportsApi = {
  get: (sessionId: string) => api.get<ReportResponse>(`/reports/session/${sessionId}`),

  // Both return the whole report: an override moves the session totals and
  // verdict too, so the server sends back the state the page should now show.
  setOverride: (sessionId: string, questionId: string, body: SetScoreOverrideRequest) =>
    api.put<ReportView>(
      `/reports/session/${sessionId}/questions/${questionId}/override`,
      body,
    ),

  clearOverride: (sessionId: string, questionId: string) =>
    api.del<ReportView>(`/reports/session/${sessionId}/questions/${questionId}/override`),
};
