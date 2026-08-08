import type { Prisma } from '@prisma/client';
import type {
  ApproveQuestionRequest,
  Difficulty,
  DraftRubricRequest,
  GenerateQuestionsRequest,
  QuestionDraft,
  QuestionMatchItem,
  QuestionPoolRequest,
  QuestionPoolResponse,
  QuestionType,
  RefineQuestionRequest,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { anthropic, GENERATION_MODEL } from '../lib/claude.js';
import { AppError } from '../middleware/error.middleware.js';
import { matchQuestions } from './question.service.js';

// Drafts are reviewed by an authenticated interviewer, so this select includes
// the private `_guide` rubric columns. It must never be reused on a
// candidate-facing route — those use PUBLIC_SELECT in question.service.ts.
const DRAFT_SELECT = {
  id: true,
  text: true,
  topic: true,
  difficulty: true,
  type: true,
  domain: true,
  status: true,
  core_answer_guide: true,
  senior_signal_guide: true,
  trap_guide: true,
  evidence_guide: true,
  core_answer_display: true,
  senior_signal_display: true,
  trap_display: true,
} satisfies Prisma.QuestionSelect;

// Generation wants variety between drafts; the rubric is kept precise by the
// prompt's explicit requirements, not by clamping the sampler to 0.
const GENERATION_TEMPERATURE = 0.7;

const RUBRIC_SPEC = `Every question MUST carry a complete four-part rubric — an answer cannot be
scored without one. The four components and their scoring weights:
- core_answer  (25%) what any correct answer must cover
- senior_signal(35%) what a SENIOR answer adds beyond merely correct: the
                     tradeoff, the edge case, the "when not to". Weighted
                     highest because it is hardest to fake.
- trap         (25%) the specific plausible-but-wrong answer to watch for
- evidence     (15%) what a grounded, concrete example looks like

For each of core_answer, senior_signal and trap write TWO versions:
- *_guide   — precise, for the scoring model. Concrete and checkable.
- *_display — readable, shown to a job seeker after the answer is revealed.
evidence has a _guide only.

Calibrate BOTH the question and the rubric to the seniority. A staff-level
senior_signal is not a mid-level one with harder words: it should demand
systemic reasoning, failure modes and organisational tradeoffs, where a
junior one rewards naming the fundamental correctly.`;

const JSON_SHAPE = `{"questions": [{
  "text": "<the question shown to the candidate>",
  "topic": "<topic>",
  "difficulty": "junior"|"mid"|"senior"|"staff",
  "type": "conceptual"|"scenario"|"rca"|"design"|"behavioral",
  "domain": "<domain or null>",
  "core_answer_guide": "...", "core_answer_display": "...",
  "senior_signal_guide": "...", "senior_signal_display": "...",
  "trap_guide": "...", "trap_display": "...",
  "evidence_guide": "..."
}]}`;

interface RawGenerated {
  text?: string;
  topic?: string;
  difficulty?: string;
  type?: string;
  domain?: string | null;
  core_answer_guide?: string;
  senior_signal_guide?: string;
  trap_guide?: string;
  evidence_guide?: string;
  core_answer_display?: string;
  senior_signal_display?: string;
  trap_display?: string;
}

const TYPES: QuestionType[] = ['conceptual', 'scenario', 'rca', 'design', 'behavioral'];
const DIFFS: Difficulty[] = ['junior', 'mid', 'senior', 'staff'];

// A draft missing any rubric field is unusable — it could never be scored — so
// reject it rather than persisting a half-populated question.
function validate(raw: RawGenerated, fallback: { topic: string; seniority: Difficulty }) {
  const required = [
    'text',
    'core_answer_guide',
    'senior_signal_guide',
    'trap_guide',
    'evidence_guide',
    'core_answer_display',
    'senior_signal_display',
    'trap_display',
  ] as const;
  for (const f of required) {
    if (typeof raw[f] !== 'string' || !raw[f]!.trim()) return null;
  }
  const difficulty = DIFFS.includes(raw.difficulty as Difficulty)
    ? (raw.difficulty as Difficulty)
    : fallback.seniority;
  const type = TYPES.includes(raw.type as QuestionType)
    ? (raw.type as QuestionType)
    : ('conceptual' as QuestionType);
  return {
    text: raw.text!.trim(),
    // The caller's topic wins, never the model's. `topic` is the key Stage A
    // matches on, and the model tends to echo back whatever was most salient
    // in the prompt — a `concern` of "at-least-once delivery and dedup" was
    // landing here instead of "Kafka", which would make the question
    // unretrievable.
    topic: fallback.topic.slice(0, 80),
    difficulty,
    type,
    domain: raw.domain?.trim() ? raw.domain.trim() : null,
    core_answer_guide: raw.core_answer_guide!.trim(),
    senior_signal_guide: raw.senior_signal_guide!.trim(),
    trap_guide: raw.trap_guide!.trim(),
    evidence_guide: raw.evidence_guide!.trim(),
    core_answer_display: raw.core_answer_display!.trim(),
    senior_signal_display: raw.senior_signal_display!.trim(),
    trap_display: raw.trap_display!.trim(),
  };
}

function isTransient(err: unknown): boolean {
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };
  if (e?.name === 'APIConnectionError' || e?.name === 'APIConnectionTimeoutError') return true;
  const code = e?.code ?? e?.cause?.code;
  if (code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  return typeof e?.status === 'number' && (e.status === 429 || e.status >= 500);
}

// One retry, transient failures only. Generation never falls back to a stub:
// a fabricated question with a fake rubric would be far worse than an error,
// because it looks exactly like a real one.
async function callGenerator(system: string, user: string): Promise<{ questions: RawGenerated[] }> {
  if (!anthropic) {
    throw new AppError(
      503,
      'GENERATION_UNAVAILABLE',
      'AI generation is not configured on this server (no ANTHROPIC_API_KEY).',
    );
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: GENERATION_MODEL,
        max_tokens: 4000,
        temperature: GENERATION_TEMPERATURE,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const block = res.content[0];
      if (!block || block.type !== 'text') throw new Error('unexpected response type');
      return JSON.parse(block.text.replace(/```json|```/g, '').trim());
    } catch (err) {
      const retrying = attempt === 1 && isTransient(err);
      console.error(
        `[generate] attempt ${attempt}/2 failed` + (retrying ? ', retrying' : ', giving up'),
        err,
      );
      if (!retrying) {
        throw new AppError(
          502,
          'GENERATION_FAILED',
          'The question generator did not return a usable result. Please try again.',
        );
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new AppError(502, 'GENERATION_FAILED', 'Generation failed.');
}

async function excludedTexts(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { text: true },
  });
  return rows.map((r) => r.text);
}

/**
 * Generate `count` new questions and persist them as `draft`. Drafts are
 * proposals: they are visible to the manager for review and never count as
 * vetted until explicitly approved.
 */
export async function generateQuestions(
  input: GenerateQuestionsRequest,
  interviewerId: string,
): Promise<QuestionDraft[]> {
  const count = Math.min(15, Math.max(1, input.count ?? 1));
  const avoid = await excludedTexts(input.exclude ?? []);

  const system = `You write technical interview questions and their scoring rubrics for a
senior-engineering assessment platform. Return ONLY a JSON object, no prose, no markdown.

${RUBRIC_SPEC}`;

  const user = `Write ${count} interview question${count === 1 ? '' : 's'}.

Technology / topic: ${input.technology}
Seniority: ${input.seniority}
${input.type ? `Question type: ${input.type}` : 'Question type: choose whichever best suits the topic'}
${input.domain ? `Domain context: ${input.domain} — bake domain-specific traps into the rubric.` : ''}
${input.concern ? `Specifically probe: ${input.concern}` : ''}
${avoid.length ? `\nDo NOT duplicate or paraphrase any of these existing questions:\n${avoid.map((t) => `- ${t}`).join('\n')}` : ''}

Each question must be answerable in a few paragraphs of prose — no coding exercises.

Return exactly:
${JSON_SHAPE}`;

  const parsed = await callGenerator(system, user);
  const rows = (parsed.questions ?? [])
    .map((raw) => validate(raw, { topic: input.technology, seniority: input.seniority }))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) {
    throw new AppError(
      502,
      'GENERATION_FAILED',
      'The generator returned no question with a complete rubric.',
    );
  }

  const created: QuestionDraft[] = [];
  for (const row of rows.slice(0, count)) {
    created.push(
      (await prisma.question.create({
        data: { ...row, status: 'draft', is_active: true, created_by: interviewerId },
        select: DRAFT_SELECT,
      })) as QuestionDraft,
    );
  }
  return created;
}

/**
 * Draft a rubric for a question the manager wrote themselves. Same review path
 * as a generated question — a rubric-less question must never reach an
 * assessment, because it cannot be scored.
 */
export async function draftRubricForQuestion(
  input: DraftRubricRequest,
  interviewerId: string,
): Promise<QuestionDraft> {
  const system = `You write scoring rubrics for technical interview questions. Return ONLY a JSON
object, no prose, no markdown.

${RUBRIC_SPEC}`;

  const user = `Write the rubric for this EXACT question. Do not reword the question itself —
return it back unchanged in the "text" field.

Question: ${input.text}
Technology / topic: ${input.topic}
Seniority: ${input.seniority}
${input.type ? `Question type: ${input.type}` : ''}
${input.domain ? `Domain context: ${input.domain}` : ''}

Return exactly:
${JSON_SHAPE}`;

  const parsed = await callGenerator(system, user);
  const raw = (parsed.questions ?? [])[0];
  const row = raw ? validate(raw, { topic: input.topic, seniority: input.seniority }) : null;
  if (!row) {
    throw new AppError(502, 'GENERATION_FAILED', 'Could not draft a complete rubric.');
  }
  // The manager's wording wins — the model may have tidied it despite the
  // instruction, and it is their question.
  return (await prisma.question.create({
    data: {
      ...row,
      text: input.text.trim(),
      status: 'draft',
      is_active: true,
      created_by: interviewerId,
    },
    select: DRAFT_SELECT,
  })) as QuestionDraft;
}

async function loadDraft(id: string, interviewerId: string) {
  const q = await prisma.question.findFirst({
    where: { id, created_by: interviewerId },
    select: DRAFT_SELECT,
  });
  if (!q) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Draft not found');
  if (q.status !== 'draft') {
    throw new AppError(409, 'NOT_A_DRAFT', 'This question has already been reviewed.');
  }
  return q as QuestionDraft;
}

/**
 * Load a draft with its full rubric for review. Separate from GET /questions/:id,
 * which deliberately never returns the private `_guide` columns.
 */
export async function getDraftForReview(
  id: string,
  interviewerId: string,
): Promise<QuestionDraft> {
  return loadDraft(id, interviewerId);
}

/**
 * Refine an existing draft in place: keep what works, change what the manager
 * asked for. Deliberately not a regenerate — the model is given the current
 * draft and told to revise it, so the result stays recognisably the same
 * question.
 */
export async function refineDraft(
  id: string,
  input: RefineQuestionRequest,
  interviewerId: string,
): Promise<QuestionDraft> {
  const current = await loadDraft(id, interviewerId);

  const system = `You REVISE an existing technical interview question and its rubric. Return ONLY a
JSON object, no prose, no markdown.

${RUBRIC_SPEC}`;

  const user = `Here is the current question and rubric:

${JSON.stringify(
  {
    text: current.text,
    topic: current.topic,
    difficulty: current.difficulty,
    type: current.type,
    domain: current.domain,
    core_answer_guide: current.core_answer_guide,
    senior_signal_guide: current.senior_signal_guide,
    trap_guide: current.trap_guide,
    evidence_guide: current.evidence_guide,
    core_answer_display: current.core_answer_display,
    senior_signal_display: current.senior_signal_display,
    trap_display: current.trap_display,
  },
  null,
  2,
)}

The reviewer asked for this change:
"${input.instruction}"

REVISE it — do not start over. Keep the parts that already work: the same
underlying competency, the same seniority calibration, and any rubric wording
the instruction does not touch. Change only what the instruction requires, then
re-check that the rubric still matches the revised question.

Return exactly:
${JSON_SHAPE}`;

  const parsed = await callGenerator(system, user);
  const raw = (parsed.questions ?? [])[0];
  const row = raw
    ? validate(raw, { topic: current.topic, seniority: current.difficulty as Difficulty })
    : null;
  if (!row) throw new AppError(502, 'GENERATION_FAILED', 'Refinement did not return a usable draft.');

  return (await prisma.question.update({
    where: { id },
    data: row,
    select: DRAFT_SELECT,
  })) as QuestionDraft;
}

/**
 * Promote a reviewed draft to `vetted`, applying the manager's edits. This is
 * the ONLY path from draft to vetted — approval is always an explicit act.
 */
export async function approveDraft(
  id: string,
  edits: ApproveQuestionRequest,
  interviewerId: string,
): Promise<QuestionDraft> {
  await loadDraft(id, interviewerId);
  const data: Prisma.QuestionUpdateInput = { status: 'vetted', created_by: interviewerId };
  for (const [k, v] of Object.entries(edits)) {
    if (typeof v === 'string' && v.trim()) {
      (data as Record<string, unknown>)[k] = v.trim();
    }
  }
  return (await prisma.question.update({
    where: { id },
    data,
    select: DRAFT_SELECT,
  })) as QuestionDraft;
}

/**
 * Reject a draft: deactivate rather than delete, so it stops appearing in
 * retrieval (which filters on is_active) without losing the audit trail.
 */
export async function rejectDraft(id: string, interviewerId: string): Promise<void> {
  await loadDraft(id, interviewerId);
  await prisma.question.update({ where: { id }, data: { is_active: false } });
}

const DEFAULT_POOL_TARGET = 15;

/**
 * Build the pool the manager picks from: bank matches first, topped up with
 * freshly generated drafts only if the bank cannot fill it.
 *
 * Nothing here is selected — this populates the POOL, not the assessment. The
 * manager still chooses every question, and a generated one additionally has
 * to go through review before it can be used.
 *
 * Generating up to a full pool is AI-heavy against an empty bank. That is
 * expected and self-correcting: every approved question becomes a vetted bank
 * match, so the shortfall shrinks with use.
 */
export async function buildQuestionPool(
  input: QuestionPoolRequest,
  interviewerId: string,
): Promise<QuestionPoolResponse> {
  const target = Math.min(30, Math.max(1, input.target ?? DEFAULT_POOL_TARGET));
  const bank = await matchQuestions({
    technology: input.technology,
    seniority: input.seniority,
    ...(input.type?.length ? { type: input.type } : {}),
    limit: target,
  });

  const shortfall = target - bank.questions.length;
  if (input.generate === false || shortfall <= 0) {
    return {
      questions: bank.questions,
      bank_count: bank.questions.length,
      generated_count: 0,
      generation_error: null,
    };
  }

  // Spread the shortfall across the technologies the manager gave, so a
  // multi-technology position doesn't get a pool about only the first one.
  const topics = input.technology.length ? input.technology : ['General'];
  const per = new Map<string, number>();
  for (let i = 0; i < shortfall; i++) {
    const t = topics[i % topics.length]!;
    per.set(t, (per.get(t) ?? 0) + 1);
  }

  const exclude = bank.questions.map((q) => q.id);
  // One call per topic, concurrently — sequential calls would make a cold-bank
  // search unbearably slow.
  const settled = await Promise.allSettled(
    [...per.entries()].map(([technology, count]) =>
      generateQuestions(
        {
          technology,
          seniority: input.seniority,
          ...(input.type?.length ? { type: input.type[0]! } : {}),
          count,
          exclude,
        },
        interviewerId,
      ),
    ),
  );

  const generated = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const failures = settled.filter((s) => s.status === 'rejected');

  // Generated drafts genuinely match the topic and seniority they were built
  // to, and are appended after the bank so vetted questions always read first.
  const asMatches: QuestionMatchItem[] = generated.map((q) => ({
    id: q.id,
    text: q.text,
    topic: q.topic,
    difficulty: q.difficulty,
    type: q.type,
    domain: q.domain,
    status: q.status,
    core_answer_display: q.core_answer_display,
    senior_signal_display: q.senior_signal_display,
    trap_display: q.trap_display,
    matched_on: ['topic', 'difficulty'],
    match_score: 2,
  }));

  return {
    questions: [...bank.questions, ...asMatches],
    bank_count: bank.questions.length,
    generated_count: asMatches.length,
    generation_error: failures.length
      ? `Could not generate ${failures.length === per.size ? 'any' : 'all'} of the extra questions. Showing what we have.`
      : null,
  };
}
