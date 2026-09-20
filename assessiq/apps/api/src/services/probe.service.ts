import type { ProbesMode } from '@prisma/client';
import type { CandidateProbe, SubmitProbeAnswerResponse } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { anthropic, PROBE_MODEL } from '../lib/claude.js';
import { firstJsonObject } from '../lib/json-extract.js';
import { AppError } from '../middleware/error.middleware.js';

/**
 * Follow-up probes: one question generated from what the candidate actually
 * wrote, answered under a short timer.
 *
 * The mechanic only works if it is cheap for someone who understood their own
 * answer and expensive for someone who did not — so everything here is built
 * around not getting in the candidate's way. Generation runs inside the submit
 * request under a hard budget, and a probe we cannot produce in time is simply
 * not shown. The candidate is never told that a probe was attempted and lost;
 * a failure of ours must not read as an event in their session.
 */

/**
 * The candidate is sitting in front of a spinner while this runs, so the budget
 * is the design constraint rather than a safety net. Past it we give up and
 * they flow straight on to the next question.
 */
const PROBE_BUDGET_MS = 8_000;
// One question. The budget is what actually caps this, but a low ceiling also
// keeps the model from writing a paragraph where a sentence is wanted.
const PROBE_MAX_TOKENS = 300;

const PROBE_SYSTEM = `You write ONE short follow-up question that asks a candidate to defend
something they just wrote in a technical interview answer. Return ONLY a JSON object, no prose,
no markdown.

The follow-up must:
1. QUOTE a specific phrase the candidate actually wrote, verbatim, in quotation marks. Not a
   paraphrase — the exact words. This is what makes it their follow-up and not a generic one.
2. Push ONE level deeper on that phrase, or at an edge their own claim implies: what happens
   at the boundary, what breaks under concurrency or failure, what the tradeoff costs them.
3. Be answerable in about 90 seconds of typing BY SOMEONE WHO UNDERSTOOD WHAT THEY WROTE.
   Not a research question, not a second essay, not a request for code.

Do not:
- ask them to repeat or summarise what they already said
- introduce a topic their answer never touched
- ask more than one thing
- comment on the quality of their answer, or hint at a judgement of it

Write it in a neutral, curious register — a colleague asking a real question, not an examiner
setting a trap.

Return exactly:
{"probe": "..."}`;

interface RawProbe {
  probe?: unknown;
}

/**
 * Is a follow-up due on this answer?
 *
 * PROBE_MODE_NOTE — `flagged_only` is specified as "a paste flag OR a top-band
 * score", but scoring is asynchronous: nothing is scored until the whole
 * session is submitted, so at answer-submit time no score exists for any
 * answer, ever. The paste flag is therefore the only signal available at the
 * only moment a probe can be asked. We do not wait for a score — blocking a
 * candidate on our scoring queue would cost far more than the extra probes a
 * top-band branch could add.
 */
export function probeIsDue(mode: ProbesMode, pasteDetected: boolean): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return pasteDetected;
}

/**
 * Did the candidate paste into this question?
 *
 * Read from the behaviour events rather than trusted from the client: the
 * events are already flushed before the answer is submitted, and the same rows
 * are what the report counts, so the probe decision and the report cannot
 * disagree about what happened.
 */
export async function pasteSignalFor(
  sessionId: string,
  position: number,
): Promise<{ detected: boolean; maxChars: number | null }> {
  const events = await prisma.behaviorEvent.findMany({
    where: { session_id: sessionId, type: 'paste', question_index: position },
    select: { char_count: true },
  });
  if (events.length === 0) return { detected: false, maxChars: null };
  const chars = events.map((e) => e.char_count ?? 0);
  return { detected: true, maxChars: Math.max(...chars) };
}

/**
 * Generate one probe. Returns null on anything at all going wrong — no key, a
 * timeout, prose instead of JSON, an empty string.
 *
 * Never stubbed. Everywhere else a missing key degrades to something that
 * self-identifies; a fabricated probe would be worse than none, because the
 * candidate would spend their 90 seconds defending a question that had nothing
 * to do with what they wrote, and the delta would then measure our failure.
 */
async function generateProbeText(
  question: {
    text: string;
    core_answer_guide: string;
    senior_signal_guide: string;
    trap_guide: string;
  },
  answerText: string,
): Promise<string | null> {
  if (!anthropic) return null;
  // Nothing to quote back. A probe on an empty box would have to be generic,
  // which is exactly the thing this feature exists to avoid.
  if (answerText.trim().length < 40) return null;

  const user = `The candidate was asked:
${question.text}

They answered:
"""
${answerText}
"""

For context, what a strong answer to the original question would contain (do NOT quote this at
them, and do not ask them to cover a point they simply chose not to make — use it only to judge
where going one level deeper is worthwhile):
- Core: ${question.core_answer_guide}
- Senior signal: ${question.senior_signal_guide}
- Common trap: ${question.trap_guide}

Write the follow-up.`;

  try {
    const res = await anthropic.messages.create(
      {
        model: PROBE_MODEL,
        max_tokens: PROBE_MAX_TOKENS,
        temperature: 0.4,
        system: PROBE_SYSTEM,
        messages: [{ role: 'user', content: user }],
      },
      // Both: the SDK timeout ends the request, the race ends OUR wait even if
      // the socket hangs on. The candidate's clock is the one that matters.
      { timeout: PROBE_BUDGET_MS },
    );
    const block = res.content[0];
    if (!block || block.type !== 'text') return null;
    const json = firstJsonObject(block.text);
    if (!json) return null;
    const parsed = JSON.parse(json) as RawProbe;
    const text = typeof parsed.probe === 'string' ? parsed.probe.trim() : '';
    return text.length > 0 ? text : null;
  } catch (err) {
    // Logged, never surfaced: from the candidate's side this is indistinguishable
    // from an answer that was never going to be probed.
    console.error('[probe:generate] failed:', (err as Error).message);
    return null;
  }
}

/**
 * Generate a probe for one just-submitted answer and persist it.
 *
 * Returns what the candidate should see, or null when they should flow straight
 * on. A `generation_failed` row is written even though nothing is shown, so the
 * report can say a follow-up was due and didn't happen rather than looking like
 * a question that was never probed.
 */
export async function createProbeForAnswer(
  answerId: string,
  question: {
    text: string;
    core_answer_guide: string;
    senior_signal_guide: string;
    trap_guide: string;
  },
  answerText: string,
  timeSeconds: number,
): Promise<CandidateProbe | null> {
  const deadline = Date.now() + PROBE_BUDGET_MS;
  const text = await Promise.race([
    generateProbeText(question, answerText),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))),
  ]);

  if (!text) {
    await prisma.probe.create({ data: { answer_id: answerId, status: 'generation_failed' } });
    return null;
  }

  const probe = await prisma.probe.create({
    data: { answer_id: answerId, text, status: 'generated' },
    select: { id: true },
  });
  return { id: probe.id, text, time_seconds: timeSeconds };
}

/**
 * Record the candidate's defense.
 *
 * An empty box is not an error. The timer auto-submits whatever is there, and
 * "nothing" is a legitimate — and scored — outcome, so it is stored as
 * `unanswered` rather than as an empty answer.
 */
export async function submitProbeAnswer(
  sessionId: string,
  probeId: string,
  body: { text: string; time_spent_ms: number },
): Promise<SubmitProbeAnswerResponse> {
  const probe = await prisma.probe.findFirst({
    // Scoped through the answer to this session: a probe id from another
    // session must not be writable with this session's token.
    where: { id: probeId, answer: { session_id: sessionId } },
    select: { id: true, status: true },
  });
  if (!probe) throw new AppError(404, 'PROBE_NOT_FOUND', 'Follow-up not found');
  if (probe.status !== 'generated') {
    throw new AppError(409, 'PROBE_CLOSED', 'This follow-up has already been submitted');
  }

  const text = body.text.trim();
  const status = text.length > 0 ? 'answered' : 'unanswered';
  await prisma.probe.update({
    where: { id: probe.id },
    data: { candidate_answer: text || null, time_spent_ms: body.time_spent_ms, status },
  });
  return { ok: true, status };
}

/**
 * Close out probes that were shown but never submitted — the session expired
 * under them, or the candidate closed the tab on one.
 *
 * `generated` is a transient state meaning "on screen right now"; leaving one
 * in it after the session ends would make the report unable to tell a probe
 * that was ignored from one that is still being typed.
 */
export async function finalizeOpenProbes(sessionId: string): Promise<void> {
  await prisma.probe.updateMany({
    where: { status: 'generated', answer: { session_id: sessionId } },
    data: { status: 'unanswered' },
  });
}
