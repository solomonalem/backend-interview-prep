import type { Prisma } from '@prisma/client';
import type {
  ApproveQuestionRequest,
  Difficulty,
  DraftRubricRequest,
  GenerateFromRepoRequest,
  GenerateFromRepoResponse,
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
  source: true,
  // Provenance for the review panel: the manager judging a repo-grounded
  // question needs to see what in their codebase motivated it.
  repo_finding: {
    select: {
      id: true,
      title: true,
      kind: true,
      file_path: true,
      line_start: true,
      line_end: true,
      scan: { select: { repo_ref: { select: { full_name: true } } } },
    },
  },
} satisfies Prisma.QuestionSelect;

type DraftRow = Prisma.QuestionGetPayload<{ select: typeof DRAFT_SELECT }>;

/** Flatten the joined finding into the shape the UI reads. */
function toDraft(row: DraftRow): QuestionDraft {
  const f = row.repo_finding;
  const { repo_finding: _drop, ...rest } = row;
  return {
    ...(rest as unknown as QuestionDraft),
    grounding: f
      ? {
          finding_id: f.id,
          finding_title: f.title,
          finding_kind: f.kind,
          repo_full_name: f.scan?.repo_ref?.full_name ?? '',
          file_path: f.file_path,
          line_start: f.line_start,
          line_end: f.line_end,
        }
      : null,
  };
}

// Generation wants variety between drafts; the rubric is kept precise by the
// prompt's explicit requirements, not by clamping the sampler to 0.
const GENERATION_TEMPERATURE = 0.7;

// A question plus its seven rubric fields runs ~1,200-1,500 output tokens, so
// a large `count` in one call overruns max_tokens and returns truncated JSON.
// Batch instead, and size the budget for a full batch plus headroom.
const MAX_QUESTIONS_PER_CALL = 3;
const GENERATION_MAX_TOKENS = 8000;
const GENERATION_TIMEOUT_MS = 120_000;

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
  const e = err as {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
    cause?: { code?: string };
  };
  // Match the class name as well as `name`. The SDK's timeout error reports a
  // `name` that is not its constructor name, so keying on `name` alone silently
  // classified every timeout as permanent — the log said "giving up" on exactly
  // the failure the retry exists for.
  const kind = e?.name ?? '';
  const cls = (err as object)?.constructor?.name ?? '';
  if (/APIConnection(Timeout)?Error|APIUserAbortError/.test(`${kind} ${cls}`)) return true;
  if (/timed out|timeout|socket hang up|aborted/i.test(e?.message ?? '')) return true;
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
      const res = await anthropic.messages.create(
        {
          model: GENERATION_MODEL,
          max_tokens: GENERATION_MAX_TOKENS,
          temperature: GENERATION_TEMPERATURE,
          system,
          messages: [{ role: 'user', content: user }],
        },
        // A question plus seven rubric fields is a long completion, and the
        // SDK's default budget is derived from max_tokens rather than from how
        // slow the model actually is. Give it room explicitly.
        { timeout: GENERATION_TIMEOUT_MS },
      );
      // Truncation surfaces as unterminated JSON several frames later, which
      // is a confusing way to learn the budget was too small. Name it here.
      if (res.stop_reason === 'max_tokens') {
        throw new Error(`generation truncated at max_tokens (${GENERATION_MAX_TOKENS})`);
      }
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
  const total = Math.min(15, Math.max(1, input.count ?? 1));

  // Split into batches the token budget can actually hold, and run them
  // concurrently. Batches don't see each other's output, so two drafts in one
  // request can overlap — acceptable for now; `exclude` still keeps them off
  // anything already on screen.
  if (total > MAX_QUESTIONS_PER_CALL) {
    const batches: number[] = [];
    for (let left = total; left > 0; left -= MAX_QUESTIONS_PER_CALL) {
      batches.push(Math.min(MAX_QUESTIONS_PER_CALL, left));
    }
    const settled = await Promise.allSettled(
      batches.map((count) => generateQuestions({ ...input, count }, interviewerId)),
    );
    const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
    if (!ok.length) {
      const first = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult | undefined;
      throw first?.reason instanceof AppError
        ? first.reason
        : new AppError(502, 'GENERATION_FAILED', 'Generation failed.');
    }
    return ok;
  }

  const count = total;
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
      toDraft(
        await prisma.question.create({
          data: {
            ...row,
            status: 'draft',
            is_active: true,
            created_by: interviewerId,
            source: 'generated',
          },
          select: DRAFT_SELECT,
        }),
      ),
    );
  }
  return created;
}

// ── Repo-grounded generation (design §6) ─────────────────────────────────────
/**
 * Write questions from scan findings — the moat feature: a question about the
 * system the candidate would actually work on, not a generic one about the
 * technology it happens to use.
 *
 * Everything downstream is deliberately unchanged. Same rubric spec, same
 * generator, same `status: draft`, same mandatory review before anything
 * reaches a candidate. Grounding changes what a question is ABOUT; it earns no
 * shortcut through approval.
 *
 * Findings are loaded owner-scoped, so one manager cannot generate questions
 * from another's codebase.
 */
export async function generateFromFindings(
  input: GenerateFromRepoRequest,
  interviewerId: string,
): Promise<GenerateFromRepoResponse> {
  const ids = [...new Set(input.finding_ids)].slice(0, 20);
  if (!ids.length) {
    throw new AppError(400, 'VALIDATION', 'Select at least one finding');
  }

  const findings = await prisma.repoFinding.findMany({
    where: { id: { in: ids }, scan: { repo_ref: { integration: { owner_id: interviewerId } } } },
    include: { scan: { select: { repo_ref: { select: { full_name: true } } } } },
  });
  if (!findings.length) {
    throw new AppError(404, 'FINDING_NOT_FOUND', 'No findings of yours matched');
  }

  const perFinding = Math.min(3, Math.max(1, input.count_per_finding ?? 1));
  const questions: QuestionDraft[] = [];
  const skipped: GenerateFromRepoResponse['skipped'] = [];

  // Sequential, one finding at a time. Concurrency here would multiply the
  // Claude rate-limit pressure for a manager who is watching a single panel,
  // and the failure of one finding must not take down the batch.
  for (const f of findings) {
    const citation = f.file_path
      ? `${f.file_path}${f.line_start ? ` lines ${f.line_start}–${f.line_end ?? f.line_start}` : ''}`
      : 'no specific file';

    const system = `You write technical interview questions and their scoring rubrics for a
senior-engineering assessment platform. Return ONLY a JSON object, no prose, no markdown.

${RUBRIC_SPEC}`;

    const user = `Write ${perFinding} interview question${perFinding === 1 ? '' : 's'} grounded in a REAL finding
about the hiring team's own codebase.

Finding (${f.kind}): ${f.title}
What was observed: ${f.detail}
Where: ${citation}
${f.excerpt ? `Representative lines:\n${f.excerpt}` : ''}

Seniority: ${input.seniority}
${input.type ? `Question type: ${input.type}` : 'Question type: choose whichever best suits the finding'}

Rules that matter here:
- Ask the candidate to REASON about the situation the finding describes. Do not
  ask them to recall a definition.
- Describe the situation in neutral, generic terms. NEVER name the company, the
  repository, the file, or anything that identifies whose codebase this is —
  the candidate must not be able to tell. "A service that exchanges third-party
  API tokens" — not "SaveLoom's Plaid integration".
- This applies to EVERY field, not just the question: the rubric must not carry
  identifiers lifted from the code either — no env var names, table names,
  class names, route paths or vendor names. Describe them by role instead ("the
  shared signing secret", "the token-exchange endpoint"). A rubric is read by
  people; an identifier that survives into it leaks the source just as surely.
- The question must stand on its own: a candidate with no access to this code
  must be able to answer it from the description you give.
- Put the real tension in senior_signal — the tradeoff or failure mode the
  finding exposes is exactly what separates a senior answer here.

topic: a short technology or concept label for retrieval, e.g. "Idempotency",
"OAuth", "Postgres". Not the finding's title.

Each question must be answerable in a few paragraphs of prose — no coding exercises.

Return exactly:
${JSON_SHAPE}`;

    try {
      const parsed = await callGenerator(system, user);
      const rows = (parsed.questions ?? [])
        // The model picks the topic here, unlike topic-driven generation where
        // the caller's topic is the retrieval key — a finding has no topic of
        // its own, so a sensible label is the best available.
        .map((raw) =>
          validate(
            { ...raw, topic: raw.topic?.trim() || f.kind },
            { topic: raw.topic?.trim() || f.kind, seniority: input.seniority },
          ),
        )
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .slice(0, perFinding);

      if (!rows.length) {
        skipped.push({ finding_id: f.id, reason: 'no question came back with a complete rubric' });
        continue;
      }

      for (const row of rows) {
        const created = await prisma.question.create({
          data: {
            ...row,
            status: 'draft',
            is_active: true,
            created_by: interviewerId,
            source: 'repo_grounded',
            repo_finding_id: f.id,
          },
          select: DRAFT_SELECT,
        });
        questions.push(toDraft(created));
      }

      await prisma.repoFinding.update({
        where: { id: f.id },
        data: { used_in_questions: { push: rows.map((_, i) => questions[questions.length - rows.length + i]!.id) } },
      });
    } catch (err) {
      // One finding failing is not the request failing — the manager keeps
      // whatever the others produced.
      skipped.push({
        finding_id: f.id,
        reason: err instanceof AppError ? err.message : 'generation failed',
      });
    }
  }

  if (!questions.length) {
    throw new AppError(
      502,
      'GENERATION_FAILED',
      skipped[0]?.reason ?? 'No questions could be generated from those findings.',
    );
  }
  return { questions, skipped };
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
  return toDraft(
    await prisma.question.create({
      data: {
        ...row,
        text: input.text.trim(),
        status: 'draft',
        is_active: true,
        created_by: interviewerId,
        // The manager wrote the question; only the rubric is AI-drafted.
        source: 'manual',
      },
      select: DRAFT_SELECT,
    }),
  );
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
  return toDraft(q);
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

  return toDraft(
    await prisma.question.update({ where: { id }, data: row, select: DRAFT_SELECT }),
  );
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
  return toDraft(await prisma.question.update({ where: { id }, data, select: DRAFT_SELECT }));
}

/**
 * Reject a draft: deactivate rather than delete, so it stops appearing in
 * retrieval (which filters on is_active) without losing the audit trail.
 */
export async function rejectDraft(id: string, interviewerId: string): Promise<void> {
  await loadDraft(id, interviewerId);
  await prisma.question.update({ where: { id }, data: { is_active: false } });
}

// Bank-first thresholds.
//
// At or above GENERATE_BELOW on-topic questions the bank is considered to have
// enough to choose from and NOTHING is generated — that search returns in
// milliseconds. Below it, top up to ON_TOPIC_TARGET so the manager always has
// a few real options. Generation is the expensive path (~90s and a Claude call
// per topic), so it is reserved for topics the bank genuinely cannot serve.
const GENERATE_BELOW = 3;
const ON_TOPIC_TARGET = 5;
// Seniority-only matches are related breadth, not answers to the question that
// was asked. Kept short so they cannot dominate the pool.
const MAX_LOOSE_TAIL = 5;

/**
 * Build the pool the manager picks from, bank-first.
 *
 * Show what the bank has immediately; pay for generation only when the bank is
 * nearly empty on this topic. There is no fixed pool size — padding to a
 * number meant every search on a covered topic still cost a generation round.
 *
 * Nothing here is selected — this populates the POOL, not the assessment. The
 * manager still chooses every question, and a draft additionally has to pass
 * review before it can be used.
 *
 * Self-correcting: every approved draft becomes a vetted on-topic match, so a
 * topic stops triggering generation once it has been used a few times.
 */
export async function buildQuestionPool(
  input: QuestionPoolRequest,
  interviewerId: string,
): Promise<QuestionPoolResponse> {
  // `target` is honoured when a caller passes one (used by "generate more"),
  // otherwise the bank-first thresholds decide.
  const onTopicTarget = Math.min(15, Math.max(1, input.target ?? ON_TOPIC_TARGET));
  const bank = await matchQuestions({
    technology: input.technology,
    seniority: input.seniority,
    ...(input.type?.length ? { type: input.type } : {}),
    // Enough headroom for every on-topic hit plus a short loose tail.
    limit: 100,
  });

  // ONLY topic matches count. Seniority-only matches are shown as breadth but
  // must never satisfy the threshold: a bank with 16 senior questions would
  // otherwise fill a GraphQL search with Kafka and Redis and suppress
  // generation permanently.
  const relevant = bank.questions.filter((q) => q.matched_on.includes('topic'));
  const loose = bank.questions
    .filter((q) => !q.matched_on.includes('topic'))
    .slice(0, MAX_LOOSE_TAIL);

  // The bank has enough on this topic — return instantly, generate nothing.
  // "Generate more with AI" remains available on demand.
  const shortfall = relevant.length >= GENERATE_BELOW ? 0 : onTopicTarget - relevant.length;
  if (input.generate === false || shortfall <= 0) {
    return {
      questions: [...relevant, ...loose],
      relevant_count: relevant.length,
      loose_count: loose.length,
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

  // Exclude everything already on screen, loose matches included, so a draft
  // never duplicates something the manager can already see.
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
    source: q.source,
    core_answer_display: q.core_answer_display,
    senior_signal_display: q.senior_signal_display,
    trap_display: q.trap_display,
    matched_on: ['topic', 'difficulty'],
    match_score: 2,
  }));

  // Order: vetted-first among the topic-relevant, then the fresh drafts (also
  // topic-relevant), then the seniority-only tail.
  return {
    questions: [...relevant, ...asMatches, ...loose],
    relevant_count: relevant.length,
    loose_count: loose.length,
    generated_count: asMatches.length,
    generation_error: failures.length
      ? `Could not generate ${failures.length === per.size ? 'any' : 'all'} of the extra questions. Showing what we have.`
      : null,
  };
}
