export type Difficulty = 'junior' | 'mid' | 'senior' | 'staff';
export type QuestionType = 'conceptual' | 'scenario' | 'rca' | 'design' | 'behavioral';

export const DIFFICULTIES: Difficulty[] = ['junior', 'mid', 'senior', 'staff'];
export const QUESTION_TYPES: QuestionType[] = [
  'conceptual',
  'scenario',
  'rca',
  'design',
  'behavioral',
];

// vetted = human-approved. draft = AI-generated, not yet reviewed. Retrieval
// returns both, always labelled, so a draft can never pass for vetted.
export type QuestionStatus = 'vetted' | 'draft';

/** Where a question came from. Only meaningful for rows created from Slice 3 on. */
export type QuestionSource = 'manual' | 'generated' | 'repo_grounded' | 'document_grounded';

/**
 * Why a repo-grounded question exists: the finding it was written from, and
 * where in the codebase that finding lives.
 *
 * INTERVIEWER-ONLY. This is never part of a candidate payload — a candidate
 * must not learn which repository, file or line an assessment was built from
 * (design §10, non-goals).
 */
export interface QuestionGrounding {
  finding_id: string;
  finding_title: string;
  finding_kind: string;
  repo_full_name: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
}

/**
 * Why a document-grounded question exists: the document it was written from.
 *
 * Deliberately just an id and a title. The document's TEXT is not carried here
 * — a reviewer needs to know which document grounded the question, not to
 * re-read it inline, and shipping the body into every list response would put
 * the manager's whole architecture note on the wire for a provenance label.
 *
 * INTERVIEWER-ONLY, exactly like QuestionGrounding above.
 */
export interface DocumentGrounding {
  document_id: string;
  document_title: string;
  /** True when the manager answered elicitation gaps before generating. */
  had_elicitation: boolean;
}

// Public shape of a question — NEVER includes the private `_guide` rubric fields.
export interface QuestionListItem {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
  status: QuestionStatus;
  core_answer_display: string;
  senior_signal_display: string;
  trap_display: string;
  /** 'manual' for anything created before provenance was recorded. */
  source: QuestionSource;
  /** Present only on repo_grounded questions, and only for interviewers. */
  grounding?: QuestionGrounding | null;
  /** Present only on document_grounded questions, and only for interviewers. */
  document_grounding?: DocumentGrounding | null;
}

export interface QuestionListResponse {
  questions: QuestionListItem[];
  total: number;
  page: number;
  pages: number;
}

export interface QuestionFilters {
  topic?: string;
  /** Retrieve by provenance — used by the builder's "From your codebase" source. */
  source?: QuestionSource;
  difficulty?: Difficulty;
  type?: QuestionType;
  domain?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ── GET /questions/match ─────────────────────────────────────────────────────
// Loose retrieval for the assessment builder: a question surfaces if it matches
// AT LEAST ONE key, and is ranked by how many it matched. Deliberately not a
// strict AND — with a small bank, strict matching returns nothing useful.
export type QuestionMatchKey = 'topic' | 'difficulty' | 'type';

export interface QuestionMatchFilters {
  technology: string[]; // matched against Question.topic
  seniority: Difficulty; // matched against Question.difficulty
  type?: QuestionType[]; // matched against Question.type
  limit?: number;
}

export interface QuestionMatchItem extends QuestionListItem {
  matched_on: QuestionMatchKey[];
  match_score: number; // matched_on.length — 3 is a full match
}

export interface QuestionMatchResponse {
  questions: QuestionMatchItem[];
  total: number;
  page: number;
  pages: number;
}

// ── GET /questions/previously-used ───────────────────────────────────────────
// Questions this manager has already put in an assessment. Not a new store —
// a filtered view of the bank, joined through AssessmentQuestion. Only vetted,
// actually-used questions appear, so these go straight into the tray.
export interface PreviouslyUsedQuestion extends QuestionListItem {
  /** How many of this manager's assessments include it. */
  used_count: number;
  /** ISO timestamp of the most recent assessment that used it — the sort key. */
  last_used_at: string;
  /** Title of that most recent assessment, so the row says where it came from. */
  last_used_in: string;
}

export interface PreviouslyUsedResponse {
  questions: PreviouslyUsedQuestion[];
  total: number;
}

// ── Generation (Stage B) ─────────────────────────────────────────────────────
// A draft carries the full rubric, private `_guide` fields included. This shape
// is ONLY ever sent to an authenticated interviewer reviewing the draft — it is
// never part of a candidate-facing payload.
export interface QuestionDraft {
  id: string;
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
  status: QuestionStatus;
  core_answer_guide: string;
  senior_signal_guide: string;
  trap_guide: string;
  evidence_guide: string;
  core_answer_display: string;
  senior_signal_display: string;
  trap_display: string;
  source: QuestionSource;
  /** Shown in the review panel so the manager can judge whether the question
   *  is fair and accurate about their own system. */
  grounding?: QuestionGrounding | null;
  /** Same purpose, for the document tier. */
  document_grounding?: DocumentGrounding | null;
}

/**
 * POST /questions/generate-from-repo — write questions from scan findings.
 * Output is ordinary drafts: same rubric, same mandatory review, same vetted
 * gate. Grounding changes what the question is about, not how it is approved.
 */
export interface GenerateFromRepoRequest {
  /** Findings to ground in. Each produces its own question(s). */
  finding_ids: string[];
  seniority: Difficulty;
  type?: QuestionType;
  /** Questions per finding. Defaults to 1. */
  count_per_finding?: number;
}

/**
 * 202 — generation was ENQUEUED, not performed. Each finding becomes a job and
 * each job writes a draft; the drafts are the result, read back through
 * GET /questions/grounded. Nothing blocks on this.
 */
export interface GenerateFromRepoResponse {
  /** Findings accepted onto the queue. */
  queued: number;
  /** Drafts expected once every job finishes (queued x count_per_finding). */
  expected: number;
  finding_ids: string[];
}

/**
 * GET /questions/grounded — repo-grounded questions for this manager, with the
 * counts the scan page needs to say where approved questions went.
 */
export interface GroundedQuestionsResponse {
  /** Awaiting review. These are what the "ready for review" list shows. */
  drafts: QuestionDraft[];
  /** Approved and usable in an assessment. */
  vetted: QuestionListItem[];
  counts: { draft: number; vetted: number };
}

// ── Document grounding (Feature A) ───────────────────────────────────────────
// The middle grounding tier: a document the manager supplies, for teams that
// will never grant repo access. Everything downstream is unchanged — these
// produce ordinary drafts that go through the same mandatory review.

/** Upload caps. Named because both the client and the server enforce them, and
 *  a silent mismatch between the two is a confusing rejection. */
export const DOCUMENT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_MAX_CHARS = 50_000;
/** Below this, extraction is treated as having found nothing worth grounding —
 *  the signature of a scanned PDF, which we reject rather than OCR. */
export const DOCUMENT_MIN_CHARS = 200;

/** POST /questions/document/extract — multipart upload of one .pdf/.docx/.txt/.md. */
export interface DocumentExtractResponse {
  /** The filename, offered as the document title; the manager can change it. */
  title: string;
  /** Extracted text, destined for the same editable textarea as a paste. */
  text: string;
  chars: number;
  /** True when the text was truncated at DOCUMENT_MAX_CHARS. */
  truncated: boolean;
}

/**
 * POST /questions/document/check — the sufficiency gate before generating.
 * One cheap call. Never stubbed: a fabricated verdict would send the manager
 * into generation with a document we never actually assessed.
 */
export interface DocumentCheckRequest {
  text: string;
  /** How many questions the manager wants — thin text grounds few questions. */
  count?: number;
}

export interface DocumentCheckResponse {
  sufficient: boolean;
  /** Up to 3 concrete follow-ups. Empty when sufficient. */
  gaps: string[];
}

/** One elicitation answer. Both sides are kept: the answer is meaningless
 *  without the question it answers. */
export interface ElicitationAnswer {
  question: string;
  answer: string;
}

/**
 * POST /questions/generate-from-document — 202, enqueued not performed.
 * Mirrors GenerateFromRepoResponse: the drafts are the result, read back
 * through GET /questions?source=document_grounded.
 */
export interface GenerateFromDocumentRequest {
  title: string;
  text: string;
  /** Answers to the gaps, when the manager filled any in. Skipping is allowed. */
  elicitation?: ElicitationAnswer[];
  seniority: Difficulty;
  type?: QuestionType;
  count?: number;
}

export interface GenerateFromDocumentResponse {
  document_id: string;
  queued: number;
  expected: number;
  /** True when generation was forced past an unmet sufficiency check — the UI
   *  labels the resulting drafts as possibly generic. */
  may_be_generic: boolean;
}

export interface GenerateQuestionsRequest {
  technology: string;
  seniority: Difficulty;
  type?: QuestionType;
  domain?: string;
  /** A specific thing to probe, e.g. "at-least-once delivery and dedup". */
  concern?: string;
  count?: number;
  /** Question ids already on screen or in the tray, so drafts don't repeat them. */
  exclude?: string[];
}

export interface GenerateQuestionsResponse {
  questions: QuestionDraft[];
}

/** Free-text question written by the manager; the AI drafts its rubric. */
export interface DraftRubricRequest {
  text: string;
  topic: string;
  seniority: Difficulty;
  type?: QuestionType;
  domain?: string;
}

/** Manager's edits, applied at approve time. Any omitted field keeps its draft value. */
export interface ApproveQuestionRequest {
  text?: string;
  core_answer_guide?: string;
  senior_signal_guide?: string;
  trap_guide?: string;
  evidence_guide?: string;
  core_answer_display?: string;
  senior_signal_display?: string;
  trap_display?: string;
}

export interface RefineQuestionRequest {
  /** What the manager wants changed, e.g. "make it payment-specific". */
  instruction: string;
}

// ── Candidate pool (Stage B part 4) ──────────────────────────────────────────
export interface QuestionPoolRequest {
  technology: string[];
  seniority: Difficulty;
  type?: QuestionType[];
  /**
   * On-topic questions to aim for when the bank is too thin to serve this
   * topic. Defaults to 5. Ignored when the bank already has enough — the pool
   * is not padded to a fixed size.
   */
  target?: number;
  /** false to show bank matches only, with no generation. */
  generate?: boolean;
}

export interface QuestionPoolResponse {
  /** On-topic bank matches, then generated drafts, then a short loose tail. */
  questions: QuestionMatchItem[];
  /** Bank matches that actually matched the topic. Only these count toward the target. */
  relevant_count: number;
  /**
   * Bank matches on seniority/type alone. Shown last as extra breadth, and
   * deliberately excluded from the target — otherwise a well-stocked seniority
   * fills the pool with off-topic questions and suppresses generation forever.
   */
  loose_count: number;
  generated_count: number;
  /** Set when generation was attempted and failed — never silently swallowed. */
  generation_error: string | null;
}
