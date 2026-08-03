import { prisma } from '../lib/prisma.js';
import { anthropic, SCORING_MODEL } from '../lib/claude.js';
import { confidenceFlag, weightedTotal } from '../utils/score-calc.js';
import { compileReport } from './report.service.js';

interface ScoreResult {
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
Do not include any explanation, preamble, or markdown. Return raw JSON only.`;

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

// Score one answer and persist a Score row. Throws on failure (BullMQ retries).
export async function scoreAnswer(answerId: string): Promise<void> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    include: {
      question: true,
      session: { include: { assessment: { select: { confidence_rating_enabled: true } } } },
    },
  });
  if (!answer) throw new Error(`answer not found: ${answerId}`);
  if (answer.scoring_status === 'scored') return; // idempotent

  await prisma.answer.update({ where: { id: answerId }, data: { scoring_status: 'scoring' } });

  const q = answer.question;
  let result: ScoreResult;
  let modelUsed: string;

  if (anthropic) {
    result = await callClaude(SYSTEM_PROMPT, buildUserPrompt(q, answer.text));
    modelUsed = SCORING_MODEL;
  } else {
    result = stubScore(answer.text, answer.id);
    modelUsed = 'stub-dev';
  }

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
