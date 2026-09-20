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
  /** Whether follow-ups can appear. Only used to explain the wait after a
   *  submit — never to predict whether one will fire. */
  probesEnabled: boolean;
  firstQuestion: { position: number; question: CandidateQuestion } | null;
  start: (data: {
    linkToken: string;
    sessionId: string;
    sessionToken: string;
    expiresAt: string | null;
    total: number;
    confidenceEnabled: boolean;
    probesEnabled: boolean;
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
  probesEnabled: false,
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
      probesEnabled: false,
      firstQuestion: null,
    }),
}));
