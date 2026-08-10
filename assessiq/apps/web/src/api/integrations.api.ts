import type { IntegrationStatusResponse, InstallUrlResponse } from '@assessiq/types';
import { api } from './client';

export const integrationsApi = {
  github: () => api.get<IntegrationStatusResponse>('/integrations/github'),

  // Returns where to send the manager. The install itself happens on
  // github.com — the permission screen and repo picker are GitHub's, not ours.
  installUrl: () => api.post<InstallUrlResponse>('/integrations/github/install-url'),

  disconnect: () => api.del('/integrations/github'),
};
