import { prisma } from '../lib/prisma.js';
import { anthropic, SCORING_MODEL } from '../lib/claude.js';
import { confidenceFlag, defenseTotal, weightedTotal } from '../utils/score-calc.js';
import { answerWithSnippet } from '../utils/snippet.js';
import { compileReport } from './report.service.js';

export interface ScoreResult {
  core_pct: number;
  core_reasoning: string;
  senior_signal_pct: number;
  senior_signal_reasoning: string;
  trap_pct: number;
  trap_reasoning: string;
  evidence_pct: number;
  evidence_reasoning: string;
  what_was_hit: string[];
  what_was_missed: string[];
  recommended_probe: string;
}

const SYSTEM_PROMPT = `You are an expert technical interview rubric grader.
You will receive a question, its rubric definition, and a candidate's answer.
You must score the answer against four components and return ONLY a JSON object.
Do not include any explanation, preamble, or markdown. Return raw JSON only.

The answer may include a code sketch, marked by a line reading
"[Candidate attached a code sketch — <language>]". Treat it as part of the answer's reasoning.
Judge what the code REVEALS about their understanding — the approach they reached for, how they
handle edges, whether the logic is actually correct. Do NOT grade style, formatting, naming, or
whether it would compile; it was typed into a plain box under a clock and was never run.
A sketch is optional: an answer without one is never penalised for its absence, and prose alone
can score full marks on every component.`;

function buildUserPrompt(q: {
  text: string;
  core_answer_guide: string;
  senior_signal_guide: string;
  trap_guide: string;
  evidence_guide: string;
}, answerText: string): string {
  return `QUESTION:
${q.text}

RUBRIC DEFINITIONS:

Core Answer (weight: 25%):
${q.core_answer_guide}

Senior Signal (weight: 35%):
${q.senior_signal_guide}

Trap to Avoid (weight: 25%):
${q.trap_guide}

Evidence / Example (weight: 15%):
${q.evidence_guide}

CANDIDATE'S ANSWER:
${answerText || '(no answer provided)'}

Return this exact JSON structure:
{
  "core_pct": <0-100>,
  "core_reasoning": "<one sentence>",
  "senior_signal_pct": <0-100>,
  "senior_signal_reasoning": "<one sentence>",
  "trap_pct": <0-100>,
  "trap_reasoning": "<one sentence>",
  "evidence_pct": <0-100>,
  "evidence_reasoning": "<one sentence>",
  "what_was_hit": ["<thing candidate got right>", ...],
  "what_was_missed": ["<thing candidate missed>", ...],
  "recommended_probe": "<one follow-up question for the live interview>"
}`;
}

// Deterministic dev stub used when ANTHROPIC_API_KEY is not set, so the full
// scoring → report pipeline is testable locally without a key.
function stubScore(answerText: string, seed: string): ScoreResult {
  const len = answerText.trim().length;
  const base = Math.max(35, Math.min(92, 40 + Math.floor(len / 12)));
  const jitter = (n: number) => Math.max(0, Math.min(100, base + ((seed.charCodeAt(n % seed.length) % 21) - 10)));
  return {
    core_pct: jitter(0),
    core_reasoning: 'Stub: core coverage estimated from answer length (no API key).',
    senior_signal_pct: jitter(1),
    senior_signal_reasoning: 'Stub: senior-signal estimate (no API key).',
    trap_pct: jitter(2),
    trap_reasoning: 'Stub: trap-avoidance estimate (no API key).',
    evidence_pct: jitter(3),
    evidence_reasoning: 'Stub: evidence estimate (no API key).',
    what_was_hit: len > 40 ? ['Addressed the core of the question'] : [],
    what_was_missed: len < 120 ? ['Could add a concrete real-world example'] : [],
    recommended_probe: 'Ask the candidate to walk through a specific failure mode in depth.',
  };
}

function parseScore(raw: string): ScoreResult {
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as ScoreResult;
}

async function callClaude(system: string, user: string): Promise<ScoreResult> {
  if (!anthropic) throw new Error('no-anthropic-client');
  const res = await anthropic.messages.create({
    model: SCORING_MODEL,
    max_tokens: 1500,
    temperature: 0, // deterministic scoring (valid on Sonnet 4.6)
    system,
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') throw new Error('unexpected-response-type');
  return parseScore(block.text);
}

// Core scorer — Claude when a key is configured, deterministic stub otherwise.
// Reused by the async worker (below) and synchronous practice mode.
export async function scoreAnswerText(
  q: {
    text: string;
    core_answer_guide: string;
    senior_signal_guide: string;
    trap_guide: string;
    evidence_guide: string;
  },
  answerText: string,
  seed = 'seed',
): Promise<{ result: ScoreResult; modelUsed: string }> {
  if (anthropic) {
    return { result: await callClaude(SYSTEM_PROMPT, buildUserPrompt(q, answerText)), modelUsed: SCORING_MODEL };
  }
  return { result: stubScore(answerText, seed), modelUsed: 'stub-dev' };
}

// ── Scoring a defense ────────────────────────────────────────────────────────
// A follow-up probe asked the candidate to go one level deeper on their own
// answer under a short clock. What comes back is scored on a REDUCED rubric —
// core and senior signal only. Trap and evidence are dropped deliberately: a
// 90-second defense of a point already made cannot fairly be asked for a worked
// example, and scoring it as if it could would depress every defense equally
// and make the delta measure the clock instead of the candidate.

interface DefenseResult {
  core_pct: number;
  core_reasoning: string;
  senior_signal_pct: number;
  senior_signal_reasoning: string;
}

const DEFENSE_SYSTEM = `You grade a candidate's SHORT, TIMED follow-up response in a technical
interview. Return ONLY a JSON object — no explanation, no preamble, no markdown.

You are scoring two things and nothing else:
- core (0-100): does the response actually address what was asked, correctly?
- senior_signal (0-100): does it show the judgement of someone who understands the system they
  described — the tradeoff, the boundary, the failure mode — rather than someone restating a
  definition?

Grade it as what it is: about ninety seconds of typing, with no time to look anything up.
Reward a short, specific, correct response. Do NOT penalise brevity, missing examples,
informal phrasing or a lack of structure — none of those were available in the time given.
Do penalise a response that is fluent but evasive, that repeats the original answer without
engaging the follow-up, or that contradicts what the candidate previously wrote.

Return exactly:
{"core_pct":<0-100>,"core_reasoning":"<one sentence>","senior_signal_pct":<0-100>,"senior_signal_reasoning":"<one sentence>"}`;

function buildDefensePrompt(
  questionText: string,
  originalAnswer: string,
  probeText: string,
  defenseText: string,
): string {
  return `ORIGINAL QUESTION:
${questionText}

WHAT THE CANDIDATE ANSWERED:
${originalAnswer || '(no answer provided)'}

THE FOLLOW-UP THEY WERE ASKED:
${probeText}

THEIR TIMED RESPONSE TO THE FOLLOW-UP:
${defenseText}

Score the timed response.`;
}

// Same dev-stub rule as the main scorer: without a key the pipeline still runs
// end to end locally, and says so via model_used.
function stubDefense(text: string, seed: string): DefenseResult {
  const len = text.trim().length;
  const base = Math.max(30, Math.min(90, 35 + Math.floor(len / 8)));
  const jitter = (n: number) =>
    Math.max(0, Math.min(100, base + ((seed.charCodeAt(n % seed.length) % 17) - 8)));
  return {
    core_pct: jitter(0),
    core_reasoning: 'Stub: defense coverage estimated from length (no API key).',
    senior_signal_pct: jitter(1),
    senior_signal_reasoning: 'Stub: defense senior-signal estimate (no API key).',
  };
}

async function callDefenseScorer(user: string): Promise<DefenseResult> {
  if (!anthropic) throw new Error('no-anthropic-client');
  const res = await anthropic.messages.create({
    model: SCORING_MODEL,
    max_tokens: 500,
    temperature: 0,
    system: DEFENSE_SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') throw new Error('unexpected-response-type');
  const clean = block.text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as DefenseResult;
}

/**
 * Score one defense, as a pure function.
 *
 * Extracted so job-seeker practice can reuse the exact scorer the interviewer
 * side uses — the reduced rubric, the same instructions about ninety seconds
 * of typing, the same stub rule. A practice delta computed by a different
 * scorer would not be comparable to a real one, which would make it useless
 * for the only thing it is for: learning what a real one would say.
 */
export async function scoreDefenseText(
  questionText: string,
  originalAnswer: string,
  probeText: string,
  defenseText: string,
  seed = 'practice',
): Promise<{ result: DefenseResult; modelUsed: string; defense_pct: number }> {
  const user = buildDefensePrompt(questionText, originalAnswer, probeText, defenseText);
  const { result, modelUsed } = anthropic
    ? { result: await callDefenseScorer(user), modelUsed: SCORING_MODEL }
    : { result: stubDefense(defenseText, seed), modelUsed: 'stub-dev' };
  return {
    result,
    modelUsed,
    defense_pct: defenseTotal(result.core_pct, result.senior_signal_pct),
  };
}

/**
 * Score the defense attached to one answer, if there is one.
 *
 * Runs in the same job as the answer's own score, immediately after it, for two
 * reasons: the delta needs both numbers, and the report compiles as soon as no
 * answer is left pending — a defense scored on a separate queue could land
 * after the report it belongs in.
 *
 * Never throws. A defense that cannot be scored must not cost the candidate
 * their answer's score, which is already written by the time this runs.
 */
async function scoreDefenseFor(answerId: string, questionText: string, originalAnswer: string) {
  const probe = await prisma.probe.findUnique({ where: { answer_id: answerId } });
  if (!probe || probe.defense_pct !== null) return;
  // Nothing was ever shown to defend.
  if (probe.status === 'generation_failed') return;

  const defenseText = (probe.candidate_answer ?? '').trim();

  // An empty box scores zero without a model call. The spec is explicit that
  // this is a scored outcome rather than a missing one — leaving a follow-up
  // blank IS the answer to it — and there is nothing for a scorer to read.
  if (probe.status === 'unanswered' || defenseText.length === 0) {
    await prisma.probe.update({
      where: { id: probe.id },
      data: {
        defense_core_pct: 0,
        defense_senior_signal_pct: 0,
        defense_pct: 0,
        defense_core_reasoning: 'No response was given in the time allowed.',
        defense_senior_reasoning: 'No response was given in the time allowed.',
        model_used: 'not-scored-empty',
        scored_at: new Date(),
      },
    });
    return;
  }

  try {
    const { result, modelUsed, defense_pct } = await scoreDefenseText(
      questionText,
      originalAnswer,
      probe.text ?? '',
      defenseText,
      probe.id,
    );

    await prisma.probe.update({
      where: { id: probe.id },
      data: {
        defense_core_pct: result.core_pct,
        defense_senior_signal_pct: result.senior_signal_pct,
        defense_core_reasoning: result.core_reasoning,
        defense_senior_reasoning: result.senior_signal_reasoning,
        defense_pct,
        model_used: modelUsed,
        scored_at: new Date(),
      },
    });
  } catch (err) {
    // The report renders an unscored defense as exactly that. Silence here
    // would be worse: a missing defense_pct with no explanation looks like the
    // candidate was never asked.
    console.error(`[scoring:defense] probe ${probe.id} failed:`, (err as Error).message);
  }
}

// Score one answer and persist a Score row. Throws on failure (BullMQ retries).
export async function scoreAnswer(answerId: string): Promise<void> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    include: {
      question: true,
      session: {
        include: { assessment: { select: { id: true, confidence_rating_enabled: true } } },
      },
    },
  });
  if (!answer) throw new Error(`answer not found: ${answerId}`);
  if (answer.scoring_status === 'scored') return; // idempotent

  // THE RUBRIC AS IT WAS. An answer is scored against the guides this
  // assessment was built with, not against whatever the bank says today —
  // otherwise editing a question rewrites how people were already judged.
  // Falls back to the live question for assessments predating snapshots.
  const snapshot = await prisma.assessmentQuestion.findUnique({
    where: {
      assessment_id_question_id: {
        assessment_id: answer.session.assessment.id,
        question_id: answer.question_id,
      },
    },
    select: {
      snapshot_text: true,
      snapshot_core_answer_guide: true,
      snapshot_senior_signal_guide: true,
      snapshot_trap_guide: true,
      snapshot_evidence_guide: true,
    },
  });
  const rubric = {
    text: snapshot?.snapshot_text ?? answer.question.text,
    core_answer_guide: snapshot?.snapshot_core_answer_guide ?? answer.question.core_answer_guide,
    senior_signal_guide:
      snapshot?.snapshot_senior_signal_guide ?? answer.question.senior_signal_guide,
    trap_guide: snapshot?.snapshot_trap_guide ?? answer.question.trap_guide,
    evidence_guide: snapshot?.snapshot_evidence_guide ?? answer.question.evidence_guide,
  };

  await prisma.answer.update({ where: { id: answerId }, data: { scoring_status: 'scoring' } });

  // Prose and sketch as one artifact, so the scorer, the defense scorer and
  // probe generation are all reading the same answer.
  const answerForModel = answerWithSnippet(
    answer.text,
    answer.snippet_code,
    answer.snippet_language,
  );

  const { result, modelUsed } = await scoreAnswerText(rubric, answerForModel, answer.id);

  const total = weightedTotal(
    result.core_pct,
    result.senior_signal_pct,
    result.trap_pct,
    result.evidence_pct,
  );
  const flag =
    answer.session.assessment.confidence_rating_enabled && answer.confidence_rating != null
      ? confidenceFlag(answer.confidence_rating, total)
      : null;

  await prisma.score.create({
    data: {
      answer_id: answerId,
      core_pct: result.core_pct,
      senior_signal_pct: result.senior_signal_pct,
      trap_pct: result.trap_pct,
      evidence_pct: result.evidence_pct,
      core_reasoning: result.core_reasoning,
      senior_signal_reasoning: result.senior_signal_reasoning,
      trap_reasoning: result.trap_reasoning,
      evidence_reasoning: result.evidence_reasoning,
      total_pct: total,
      what_was_hit: result.what_was_hit,
      what_was_missed: result.what_was_missed,
      recommended_probe: result.recommended_probe,
      confidence_flag: flag,
      model_used: modelUsed,
    },
  });

  await prisma.answer.update({ where: { id: answerId }, data: { scoring_status: 'scored' } });

  // After the answer's own score is committed — the defense is a comparison
  // against it, and a failure here must never roll back the score above.
  await scoreDefenseFor(answerId, rubric.text, answerForModel);
}

export async function markAnswerFailed(answerId: string): Promise<void> {
  await prisma.answer.update({ where: { id: answerId }, data: { scoring_status: 'failed' } });
}

// When no answers remain pending/scoring, compile the session report.
export async function checkSessionComplete(sessionId: string): Promise<void> {
  const remaining = await prisma.answer.count({
    where: { session_id: sessionId, scoring_status: { in: ['pending', 'scoring'] } },
  });
  if (remaining === 0) await compileReport(sessionId);
}
