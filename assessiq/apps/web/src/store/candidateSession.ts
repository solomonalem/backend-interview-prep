import { create } from 'zustand';
import type { CandidateQuestion } from '@assessiq/types';

// Holds the active candidate session across landing → session → submitted.
// In-memory only (lost on refresh — the candidate would re-open the link).
interface CandidateSessionState {
  linkToken: string | null;
  sessionId: string | null;
  sessionToken: string | null;
  expiresAt: string | null;
  total: number;
  confidenceEnabled: boolean;
  firstQuestion: { position: number; question: CandidateQuestion } | null;
  start: (data: {
    linkToken: string;
    sessionId: string;
    sessionToken: string;
    expiresAt: string | null;
    total: number;
    confidenceEnabled: boolean;
    firstQuestion: { position: number; question: CandidateQuestion };
  }) => void;
  clear: () => void;
}

export const useCandidateSession = create<CandidateSessionState>((set) => ({
  linkToken: null,
  sessionId: null,
  sessionToken: null,
  expiresAt: null,
  total: 0,
  confidenceEnabled: true,
  firstQuestion: null,
  start: (data) => set({ ...data }),
  clear: () =>
    set({
      linkToken: null,
      sessionId: null,
      sessionToken: null,
      expiresAt: null,
      total: 0,
      confidenceEnabled: true,
      firstQuestion: null,
    }),
}));
