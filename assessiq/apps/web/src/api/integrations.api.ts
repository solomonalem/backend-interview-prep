import type {
  IntegrationStatusResponse,
  IntegrationView,
  InstallUrlResponse,
  ScanFindingsResponse,
  ScanView,
  SyncCandidatesResponse,
} from '@assessiq/types';
import { api } from './client';

export const integrationsApi = {
  github: () => api.get<IntegrationStatusResponse>('/integrations/github'),

  // ── Sync: adopt an installation made directly on github.com ────────────────
  syncStart: () => api.post<InstallUrlResponse>('/integrations/github/sync/start'),

  syncCandidates: () =>
    api.get<SyncCandidatesResponse>('/integrations/github/sync/candidates'),

  syncAdopt: (installationId: string) =>
    api.post<IntegrationView>('/integrations/github/sync/adopt', {
      installation_id: installationId,
    }),

  // Returns where to send the manager. The install itself happens on
  // github.com — the permission screen and repo picker are GitHub's, not ours.
  installUrl: () => api.post<InstallUrlResponse>('/integrations/github/install-url'),

  disconnect: () => api.del('/integrations/github'),

  // ── Scanning (Slice 2) ─────────────────────────────────────────────────────
  // 202: the scan is queued, not finished. Poll the returned scan.
  scan: (repoRefId: string) =>
    api.post<ScanView>(`/integrations/github/repos/${repoRefId}/scan`),

  // Latest scan per repo, so the integrations screen costs one request.
  scans: () => api.get<{ scans: Record<string, ScanView> }>('/integrations/github/scans'),

  getScan: (scanId: string) => api.get<ScanView>(`/repo-scans/${scanId}`),

  findings: (scanId: string) => api.get<ScanFindingsResponse>(`/repo-scans/${scanId}/findings`),
};
