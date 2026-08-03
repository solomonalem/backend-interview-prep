import type { AuthResponse, MeResponse } from '@assessiq/types';
import { api } from './client';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  me: () => api.get<MeResponse>('/auth/me'),
};
