import type { ReportResponse } from '@assessiq/types';
import { api } from './client';

export const reportsApi = {
  get: (sessionId: string) => api.get<ReportResponse>(`/reports/session/${sessionId}`),
};
