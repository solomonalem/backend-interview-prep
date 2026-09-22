import type {
  ApproveQuestionRequest,
  DocumentCheckRequest,
  DocumentCheckResponse,
  DocumentExtractResponse,
  DraftRubricRequest,
  GenerateFromDocumentRequest,
  GenerateFromDocumentResponse,
  GenerateFromRepoRequest,
  GenerateFromRepoResponse,
  GroundedQuestionsResponse,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  ImportQuestionsRequest,
  ImportQuestionsResponse,
  QuestionDraft,
  QuestionExport,
  QuestionFilters,
  QuestionListResponse,
  QuestionMatchFilters,
  QuestionMatchResponse,
  QuestionPoolRequest,
  QuestionPoolResponse,
  PreviouslyUsedResponse,
  RefineQuestionRequest,
  UpdateQuestionRequest,
} from '@assessiq/types';
import { api } from './client';

function toQuery(f: QuestionFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const questionsApi = {
  list: (filters: QuestionFilters = {}) =>
    api.get<QuestionListResponse>(`/questions${toQuery(filters)}`),

  /** The bank's own list: same endpoint, plus the per-question usage stats. */
  bank: (filters: QuestionFilters = {}) =>
    api.get<QuestionListResponse>(`/questions${toQuery({ ...filters, usage: true } as QuestionFilters)}`),

  /** Question + full rubric, for editing. Interviewer-only. */
  full: (id: string) => api.get<QuestionDraft>(`/questions/${id}/full`),

  /** Edit in place, tag, archive or restore. Never changes status. */
  update: (id: string, body: UpdateQuestionRequest) =>
    api.patch<QuestionDraft>(`/questions/${id}`, body),

  exportAll: () => api.download('/questions/export', 'assessiq-questions.json'),
  import: (body: ImportQuestionsRequest) =>
    api.post<ImportQuestionsResponse>('/questions/import', body),

  // Loose builder retrieval — array params go over the wire comma-separated.
  match: (f: QuestionMatchFilters) => {
    const p = new URLSearchParams();
    p.set('technology', f.technology.join(','));
    p.set('seniority', f.seniority);
    if (f.type?.length) p.set('type', f.type.join(','));
    if (f.limit) p.set('limit', String(f.limit));
    return api.get<QuestionMatchResponse>(`/questions/match?${p.toString()}`);
  },

  // Vetted questions this manager has already used, most-recently-used first.
  previouslyUsed: (limit?: number) =>
    api.get<PreviouslyUsedResponse>(
      `/questions/previously-used${limit ? `?limit=${limit}` : ''}`,
    ),

  // ── Stage B ────────────────────────────────────────────────────────────────
  // Bank matches topped up with generated drafts. Slow on a cold bank — every
  // shortfall costs a Claude call.
  pool: (body: QuestionPoolRequest) => api.post<QuestionPoolResponse>('/questions/pool', body),

  generate: (body: GenerateQuestionsRequest) =>
    api.post<GenerateQuestionsResponse>('/questions/generate', body),

  // Questions written from scan findings. Ordinary drafts — same review gate.
  // 202 — queued, not generated. Poll `grounded` for the drafts as they land.
  generateFromRepo: (body: GenerateFromRepoRequest) =>
    api.post<GenerateFromRepoResponse>('/questions/generate-from-repo', body),

  grounded: (scanId?: string) =>
    api.get<GroundedQuestionsResponse>(
      `/questions/grounded${scanId ? `?scan_id=${scanId}` : ''}`,
    ),

  // ── Document grounding ─────────────────────────────────────────────────────
  // Extraction returns TEXT, not questions: it lands back in the manager's
  // editable box so they can see and fix it before anything is generated.
  extractDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<DocumentExtractResponse>('/questions/document/extract', form);
  },

  // The sufficiency gate. Cheap, but it is a model call — one per deliberate
  // click, never on keystroke.
  checkDocument: (body: DocumentCheckRequest) =>
    api.post<DocumentCheckResponse>('/questions/document/check', body),

  // 202 — queued, not generated. Poll `documentGrounded` for the drafts.
  generateFromDocument: (body: GenerateFromDocumentRequest) =>
    api.post<GenerateFromDocumentResponse>('/questions/generate-from-document', body),

  documentGrounded: (documentId?: string) =>
    api.get<GroundedQuestionsResponse>(
      `/questions/document-grounded${documentId ? `?document_id=${documentId}` : ''}`,
    ),

  // Manager writes the question, AI drafts its rubric. Same review flow.
  draftRubric: (body: DraftRubricRequest) => api.post<QuestionDraft>('/questions/draft-rubric', body),

  // Full draft incl. the private _guide rubric — interviewer-only, for review.
  refine: (id: string, body: RefineQuestionRequest) =>
    api.post<QuestionDraft>(`/questions/${id}/refine`, body),

  approve: (id: string, edits: ApproveQuestionRequest = {}) =>
    api.post<QuestionDraft>(`/questions/${id}/approve`, edits),

  getDraft: (id: string) => api.get<QuestionDraft>(`/questions/${id}/draft`),

  reject: (id: string) => api.post<null>(`/questions/${id}/reject`),
};
