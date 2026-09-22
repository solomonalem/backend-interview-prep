import type { InterviewKit, ReportView } from '@assessiq/types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { anthropic, GENERATION_MODEL } from '../lib/claude.js';
import { firstJsonObject } from '../lib/json-extract.js';
import { AppError } from '../middleware/error.middleware.js';
import { getReport } from './report.service.js';

/**
 * The live interview kit.
 *
 * The report says how someone did on an async assessment; the live round is
 * where a human decides. This is the bridge — not "here are some senior
 * questions", but "this candidate asserted X without evidence and could not
 * defend Y, so ask them these four things".
 *
 * NEVER STUBBED. Every other AI path in this product degrades to something
 * that self-identifies when there is no key; a fabricated interview kit cannot,
 * because it would read exactly like a real one while being about nobody. A
 * manager would walk into a room with questions invented from nothing.
 */

const SYSTEM = `You prepare a hiring manager for a LIVE interview round, using the report from
the candidate's async technical assessment. Return ONLY a JSON object — no prose, no markdown.

Your job is to turn evidence into questions. Every question you write must be traceable to
something IN THIS REPORT: a component they scored low on, a claim they made without evidence, a
follow-up they could not defend, a strength that is asserted but unverified. Generic senior
interview questions are worthless here — the manager already has those.

Return exactly:
{
  "questions": [
    {
      "question": "<what to ask, in the manager's voice, one question>",
      "why": "<the specific thing in the report that motivates it — quote or name it>",
      "strong_answer": "<one sentence: what a convincing answer sounds like>",
      "weak_answer": "<one sentence: what a weak or evasive one sounds like>"
    }
  ],
  "red_flags": ["<something to listen for that would change the decision>"],
  "agenda": [{"minutes": <int>, "item": "<what to do in that time>"}]
}

Rules:
- 3 to 5 questions, ordered by how much they would change the decision.
- The agenda totals 30 minutes and includes time for the candidate's own questions.
- 2 to 4 red flags. A red flag is a behaviour to listen for, not a verdict about the person.
- Write about the ANSWERS, not the person. "The answer asserted X" rather than "they are weak".
- No score is a verdict. The manager decides; you prepare them.`;

function buildPrompt(report: ReportView): string {
  const ov = report.overall;
  const lines: string[] = [
    `ASSESSMENT: ${report.assessment.title}`,
    `OVERALL: ${ov.total_pct}% · verdict ${ov.verdict}`,
    `COMPONENT AVERAGES: senior signal ${ov.senior_signal_avg}%, core ${ov.core_avg}%, trap ${ov.trap_avg}%, evidence ${ov.evidence_avg}%`,
    '',
    'PER QUESTION:',
  ];

  for (const q of report.questions) {
    lines.push(`\n[Q${q.position + 1} · ${q.question.topic} · ${q.question.difficulty}]`);
    lines.push(q.question.text);
    if (!q.answer) {
      lines.push('NOT ANSWERED — the candidate never submitted this one.');
      continue;
    }
    lines.push(`ANSWER: ${q.answer.text || '(empty)'}`);
    if (q.answer.snippet_code) {
      lines.push(`CODE SKETCH ATTACHED:\n${q.answer.snippet_code}`);
    }
    const s = q.score;
    if (s) {
      lines.push(
        `SCORED: total ${s.total_pct}% (core ${s.core_pct}, senior ${s.senior_signal_pct}, trap ${s.trap_pct}, evidence ${s.evidence_pct})`,
      );
      lines.push(`WHY: ${s.core_reasoning} ${s.senior_signal_reasoning} ${s.evidence_reasoning}`);
      if (s.what_was_missed.length) lines.push(`MISSED: ${s.what_was_missed.join('; ')}`);
      if (s.recommended_probe) lines.push(`SCORER SUGGESTED ASKING: ${s.recommended_probe}`);
      if (s.override) {
        lines.push(
          `INTERVIEWER OVERRODE THIS (${s.override.flag}): ${s.override.note}. Treat their judgement as the better one.`,
        );
      }
    }
    // The delta is the most interesting evidence in the whole report: it says
    // whether they could hold up their own answer under a short clock.
    if (q.probe && q.probe.defense_pct !== null) {
      lines.push(
        `FOLLOW-UP ASKED: ${q.probe.text}\nTHEIR DEFENSE: ${q.probe.candidate_answer ?? '(no response)'}\nDEFENSE SCORED ${q.probe.defense_pct}% (difference from the answer: ${q.probe.delta ?? 'n/a'})`,
      );
    }
  }

  lines.push(
    `\nPROCTORING CONTEXT: ${report.proctoring.context_note}`,
    'Treat proctoring as context only. It is never evidence of dishonesty and must not become a question about their integrity.',
    '',
    'Prepare the manager for a 30-minute live round with this candidate.',
  );
  return lines.join('\n');
}

interface RawKit {
  questions?: unknown;
  red_flags?: unknown;
  agenda?: unknown;
}

function parseKit(raw: string, modelUsed: string): InterviewKit {
  const json = firstJsonObject(raw);
  if (!json) throw new AppError(502, 'KIT_FAILED', 'The model did not return a usable kit.');
  const parsed = JSON.parse(json) as RawKit;

  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .map((q) => q as Record<string, unknown>)
        .filter((q) => typeof q.question === 'string' && q.question.trim())
        .map((q) => ({
          question: String(q.question).trim(),
          why: typeof q.why === 'string' ? q.why.trim() : '',
          strong_answer: typeof q.strong_answer === 'string' ? q.strong_answer.trim() : '',
          weak_answer: typeof q.weak_answer === 'string' ? q.weak_answer.trim() : '',
        }))
    : [];
  if (questions.length === 0) {
    throw new AppError(502, 'KIT_FAILED', 'The model returned no usable questions.');
  }

  const red_flags = Array.isArray(parsed.red_flags)
    ? parsed.red_flags.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    : [];
  const agenda = Array.isArray(parsed.agenda)
    ? parsed.agenda
        .map((a) => a as Record<string, unknown>)
        .filter((a) => typeof a.item === 'string' && a.item.trim())
        .map((a) => ({ minutes: Number(a.minutes) || 0, item: String(a.item).trim() }))
    : [];

  return {
    questions,
    red_flags,
    agenda,
    generated_at: new Date().toISOString(),
    model_used: modelUsed,
  };
}

// ── POST /reports/session/:id/interview-kit ──────────────────────────────────
/**
 * Generate (or regenerate) the kit for one report.
 *
 * Ownership comes from getReport, which is also where the report data comes
 * from — the kit is built from exactly what the manager can see, nothing more.
 */
export async function generateInterviewKit(
  ownerId: string,
  sessionId: string,
): Promise<InterviewKit> {
  const { code, body } = await getReport(ownerId, sessionId);
  if (code !== 200) {
    throw new AppError(409, 'REPORT_NOT_READY', 'This report is still being scored.');
  }
  const report = body as ReportView;

  if (!anthropic) {
    throw new AppError(
      503,
      'KIT_UNAVAILABLE',
      'Interview kits need an ANTHROPIC_API_KEY. Nothing is invented here — a made-up kit would send you into a room with questions about nobody.',
    );
  }

  let kit: InterviewKit;
  try {
    const res = await anthropic.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 2000,
      temperature: 0.4,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(report) }],
    });
    const block = res.content[0];
    if (!block || block.type !== 'text') {
      throw new AppError(502, 'KIT_FAILED', 'The model did not return text.');
    }
    kit = parseKit(block.text, GENERATION_MODEL);
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[interview-kit] generation failed:', (err as Error).message);
    throw new AppError(502, 'KIT_FAILED', 'Could not prepare the interview kit. Try again.');
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      interview_kit: kit as unknown as Prisma.InputJsonValue,
      interview_kit_at: new Date(),
    },
  });
  return kit;
}
