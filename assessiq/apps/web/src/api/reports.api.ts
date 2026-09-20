import type {
  ReportResponse,
  ReportShareListResponse,
  ReportShareSummary,
  ReportView,
  SetScoreOverrideRequest,
} from '@assessiq/types';
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

  // ── Shared links ───────────────────────────────────────────────────────────
  listShares: (sessionId: string) =>
    api.get<ReportShareListResponse>(`/reports/session/${sessionId}/shares`),
  createShare: (sessionId: string) =>
    api.post<ReportShareSummary>(`/reports/session/${sessionId}/shares`),
  revokeShare: (shareId: string) => api.del<ReportShareSummary>(`/reports/shares/${shareId}`),

  /**
   * The read-only view, fetched by token.
   *
   * Public: no cookie is needed and none is used. The server resolves this
   * token on its own path — it reaches exactly one report and nothing else.
   */
  getShared: (token: string) => api.get<ReportResponse>(`/reports/shared/${token}`),
};
