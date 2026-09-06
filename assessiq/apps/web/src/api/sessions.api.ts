import type {
  BehaviorEventInput,
  SubmitProbeAnswerRequest,
  SubmitProbeAnswerResponse,
  LinkValidateResponse,
  QuestionViewResponse,
  StartSessionResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  SubmitSessionResponse,
} from '@assessiq/types';
import { api, bearer } from './client';

export const sessionsApi = {
  // Public
  validateLink: (token: string) => api.get<LinkValidateResponse>(`/sessions/link/${token}`),
  start: (linkToken: string) =>
    api.post<StartSessionResponse>('/sessions/start', { link_token: linkToken }),

  // Candidate (Bearer session token)
  getQuestion: (sessionId: string, position: number, sessionToken: string) =>
    api.get<QuestionViewResponse>(
      `/sessions/${sessionId}/question/${position}`,
      bearer(sessionToken),
    ),
  submitAnswer: (sessionId: string, body: SubmitAnswerRequest, sessionToken: string) =>
    api.post<SubmitAnswerResponse>(`/sessions/${sessionId}/answers`, body, bearer(sessionToken)),
  // The defense. An empty body is expected at auto-submit and is not an error.
  answerProbe: (
    sessionId: string,
    probeId: string,
    body: SubmitProbeAnswerRequest,
    sessionToken: string,
  ) =>
    api.post<SubmitProbeAnswerResponse>(
      `/sessions/${sessionId}/probes/${probeId}/answer`,
      body,
      bearer(sessionToken),
    ),
  sendEvents: (sessionId: string, events: BehaviorEventInput[], sessionToken: string) =>
    api.post<null>(`/sessions/${sessionId}/events`, { events }, bearer(sessionToken)),
  submit: (sessionId: string, sessionToken: string) =>
    api.post<SubmitSessionResponse>(`/sessions/${sessionId}/submit`, undefined, bearer(sessionToken)),
};
