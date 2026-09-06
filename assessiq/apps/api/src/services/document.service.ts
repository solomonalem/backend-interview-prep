import type { Prisma } from '@prisma/client';
import type {
  DocumentCheckRequest,
  DocumentCheckResponse,
  ElicitationAnswer,
  GenerateFromDocumentRequest,
  GenerateFromDocumentResponse,
} from '@assessiq/types';
import { DOCUMENT_MAX_CHARS, DOCUMENT_MIN_CHARS } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { anthropic, DECODE_MODEL } from '../lib/claude.js';
import { firstJsonObject } from '../lib/json-extract.js';
import { AppError } from '../middleware/error.middleware.js';
import { questionGenQueue } from '../queues/question-gen.queue.js';

// The sufficiency verdict is one short JSON object, so the budget only has to
// cover three follow-up questions. Kept small deliberately: this call sits in
// front of the manager and its whole value is being cheap and fast.
const CHECK_MAX_TOKENS = 600;
const MAX_GAPS = 3;
// Batches of 3, matching the generator's own per-call ceiling.
const MAX_PER_JOB = 3;
const MAX_QUESTIONS = 12;

const CHECK_SYSTEM = `You judge whether a document contains enough concrete technical substance to
write specific interview questions from. Return ONLY a JSON object, no prose, no markdown.

Sufficient means the document says things about a REAL system that a candidate could be
asked to reason about: what it is built on, how the pieces communicate, what it must
guarantee, where the load or the failure modes are, what the business entities mean.

Insufficient means the document is mostly positioning, values, benefits or role boilerplate
— text from which any question would come out generic. A list of technology names with no
statement about how they are used is insufficient: "we use Kafka and Postgres" grounds
nothing that a topic name would not ground on its own.

When insufficient, write up to ${MAX_GAPS} follow-up questions for the hiring manager. Each must be:
- concrete and answerable in a sentence or two ("What datastore backs the event log?",
  "What request volume does the payments path handle at peak?")
- about THIS system, not about interviewing or hiring
- the highest-value gap first — the thing whose answer would unlock the most questions

Return exactly:
{"sufficient": true|false, "gaps": ["...", "..."]}`;

interface RawCheck {
  sufficient?: boolean;
  gaps?: unknown;
}

/**
 * The sufficiency gate, in front of generation.
 *
 * This is the feature's differentiator, so it is worth saying what it buys: a
 * thin document does not fail loudly at generation time, it succeeds quietly
 * and produces questions that could have been written from the technology name
 * alone. Asking the manager three concrete questions first is the cheapest
 * available way to turn that into a document worth grounding.
 *
 * Never stubbed. Everywhere else a missing API key degrades to a heuristic that
 * self-identifies; here a fabricated verdict would send the manager into
 * generation believing we had assessed a document we never read.
 */
export async function checkDocumentSufficiency(
  input: DocumentCheckRequest,
): Promise<DocumentCheckResponse> {
  const text = input.text.trim();
  if (text.length < DOCUMENT_MIN_CHARS) {
    // Below the floor there is nothing to send to a model — and the gaps we
    // would want back are the same ones any empty document raises.
    return {
      sufficient: false,
      gaps: [
        'What does the system actually do, and what are its main moving parts?',
        'What is it built on, and where does that choice constrain the design?',
        'What is the hardest guarantee it has to hold — under load, on failure, or across services?',
      ],
    };
  }

  if (!anthropic) {
    throw new AppError(
      503,
      'CHECK_UNAVAILABLE',
      'The document check is not configured on this server (no ANTHROPIC_API_KEY).',
    );
  }

  const count = Math.min(MAX_QUESTIONS, Math.max(1, input.count ?? 5));
  const user = `Judge this document as grounding material for ${count} interview question${
    count === 1 ? '' : 's'
  }.

--- DOCUMENT ---
${text.slice(0, DOCUMENT_MAX_CHARS)}
--- END DOCUMENT ---`;

  let raw: RawCheck;
  try {
    const res = await anthropic.messages.create({
      model: DECODE_MODEL,
      max_tokens: CHECK_MAX_TOKENS,
      temperature: 0,
      system: CHECK_SYSTEM,
      messages: [{ role: 'user', content: user }],
    });
    const block = res.content[0];
    if (!block || block.type !== 'text') throw new Error('unexpected response type');
    // Same reason as the analyser: the models here reject assistant prefill, so
    // prose has to be survivable rather than structurally impossible.
    const json = firstJsonObject(block.text);
    if (!json) throw new Error('check returned prose instead of JSON');
    raw = JSON.parse(json) as RawCheck;
  } catch (err) {
    console.error('[document:check] failed:', (err as Error).message);
    throw new AppError(
      502,
      'CHECK_FAILED',
      'Could not assess this document. Try again, or generate anyway.',
    );
  }

  const gaps = (Array.isArray(raw.gaps) ? raw.gaps : [])
    .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
    .map((g) => g.trim())
    .slice(0, MAX_GAPS);

  // A "sufficient: false" with no gaps is not actionable — there is nothing to
  // put on screen — so treat it as sufficient rather than blocking the manager
  // behind an empty form.
  const sufficient = raw.sufficient === true || gaps.length === 0;
  return { sufficient, gaps: sufficient ? [] : gaps };
}

/**
 * Store the document and enqueue generation. Returns immediately (202).
 *
 * Generation is a Claude call per batch and takes tens of seconds; running it
 * inline would mean the manager watches a spinner and cannot navigate away.
 * Each batch becomes a job, and the draft each job writes is itself the result
 * — the review list reads drafts, so there is no separate notification.
 *
 * `may_be_generic` is carried through rather than blocked on. Skipping
 * elicitation is a legitimate choice — the manager may know the document is
 * thin and want the questions anyway — but the resulting drafts should say so.
 */
export async function queueGenerationFromDocument(
  input: GenerateFromDocumentRequest,
  interviewerId: string,
): Promise<GenerateFromDocumentResponse> {
  const text = input.text.trim();
  if (text.length < DOCUMENT_MIN_CHARS) {
    throw new AppError(
      400,
      'DOCUMENT_TOO_SHORT',
      'There is not enough text here to ground a question. Paste more of the document.',
    );
  }
  if (text.length > DOCUMENT_MAX_CHARS) {
    throw new AppError(
      413,
      'DOCUMENT_TOO_LONG',
      `That is longer than we can use (${DOCUMENT_MAX_CHARS.toLocaleString()} characters). Paste the relevant section instead.`,
    );
  }

  // Only answered gaps are kept. An empty answer records that we asked and got
  // nothing, which is noise in the prompt and misleading as provenance.
  const elicitation: ElicitationAnswer[] = (input.elicitation ?? [])
    .filter((a) => a.question?.trim() && a.answer?.trim())
    .map((a) => ({ question: a.question.trim(), answer: a.answer.trim() }))
    .slice(0, MAX_GAPS);

  const total = Math.min(MAX_QUESTIONS, Math.max(1, input.count ?? 5));

  const doc = await prisma.groundingDocument.create({
    data: {
      owner_id: interviewerId,
      title: input.title.trim().slice(0, 200) || 'Untitled document',
      text,
      // Omitted rather than set null when empty: the column is nullable, and
      // NULL is what `had_elicitation: false` reads off later.
      ...(elicitation.length
        ? { elicitation_qa: elicitation as unknown as Prisma.InputJsonValue }
        : {}),
    },
    select: { id: true },
  });

  const batches: number[] = [];
  for (let left = total; left > 0; left -= MAX_PER_JOB) {
    batches.push(Math.min(MAX_PER_JOB, left));
  }
  for (const count of batches) {
    await questionGenQueue.add('generate-document', {
      kind: 'document',
      documentId: doc.id,
      ownerId: interviewerId,
      seniority: input.seniority,
      ...(input.type ? { type: input.type } : {}),
      count,
    });
  }

  return {
    document_id: doc.id,
    queued: batches.length,
    expected: total,
    // Forced past an unmet check with nothing filled in: exactly the case
    // where the manager should read the drafts sceptically. Answering even one
    // gap clears it — the document is no longer only what it was.
    may_be_generic: input.sufficiency_unmet === true && elicitation.length === 0,
  };
}
