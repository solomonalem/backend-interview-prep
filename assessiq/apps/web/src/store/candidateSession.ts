import { create } from 'zustand';
import type { CandidateQuestion } from '@assessiq/types';

// Holds the active candidate session across landing → session → submitted.
//
// Persisted to sessionStorage, not just memory. A reload used to lose the
// session token and bounce the candidate back to the landing page, which made
// autosaved drafts pointless — work you cannot return to is not saved work.
// sessionStorage is the right scope: it survives a reload and dies with the
// tab, and the server can always resume the session from the link anyway.
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

const STORAGE_KEY = 'assessiq_candidate_session';

type Persisted = Omit<CandidateSessionState, 'start' | 'clear'>;

const EMPTY: Persisted = {
  linkToken: null,
  sessionId: null,
  sessionToken: null,
  expiresAt: null,
  total: 0,
  confidenceEnabled: true,
  probesEnabled: false,
  firstQuestion: null,
};

// Never throws: a browser with storage disabled gets the in-memory behaviour
// the store had before, which still works for anyone who doesn't reload.
function load(): Persisted {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(state: Persisted): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the session still works until a reload */
  }
}

export const useCandidateSession = create<CandidateSessionState>((set) => ({
  ...load(),
  start: (data) =>
    set(() => {
      save({ ...EMPTY, ...data });
      return { ...data };
    }),
  clear: () =>
    set(() => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* nothing to clean up */
      }
      return { ...EMPTY };
    }),
}));
