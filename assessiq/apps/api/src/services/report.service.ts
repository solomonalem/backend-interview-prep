import { prisma } from '../lib/prisma.js';
import { verdictFor } from '../utils/score-calc.js';

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function proctoringNote(counts: {
  tab: number;
  focus: number;
  paste: number;
  idle: number;
}): string {
  const flags: string[] = [];
  if (counts.tab > 0) flags.push(`${counts.tab} tab switch${counts.tab === 1 ? '' : 'es'}`);
  if (counts.focus > 0) flags.push(`${counts.focus} focus loss${counts.focus === 1 ? '' : 'es'}`);
  if (counts.paste > 0) flags.push(`${counts.paste} paste event${counts.paste === 1 ? '' : 's'}`);
  if (counts.idle > 0) flags.push(`${counts.idle} idle period${counts.idle === 1 ? '' : 's'}`);
  if (flags.length === 0) {
    return 'Clean session — no tab switches, focus loss, paste, or idle events were logged.';
  }
  return `Logged ${flags.join(', ')}. Surfaced as context for the interviewer, not as an automatic flag.`;
}

// Compile the Report once every answer in the session is scored (or failed).
export async function compileReport(sessionId: string): Promise<void> {
  const existing = await prisma.report.findUnique({ where: { session_id: sessionId } });
  if (existing) return;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      answers: { include: { score: true } },
      behavior_events: { select: { type: true } },
    },
  });
  if (!session) return;

  const scores = session.answers.map((a) => a.score).filter((s): s is NonNullable<typeof s> => !!s);
  const overall = avg(scores.map((s) => s.total_pct));
  const seniorAvg = avg(scores.map((s) => s.senior_signal_pct));

  const counts = {
    tab: session.behavior_events.filter((e) => e.type === 'tab_switch').length,
    focus: session.behavior_events.filter((e) => e.type === 'focus_loss').length,
    paste: session.behavior_events.filter((e) => e.type === 'paste').length,
    idle: session.behavior_events.filter((e) => e.type === 'idle').length,
  };

  await prisma.report.create({
    data: {
      session_id: sessionId,
      overall_pct: overall,
      verdict: verdictFor(seniorAvg, overall),
      tab_switch_count: counts.tab,
      focus_loss_count: counts.focus,
      paste_count: counts.paste,
      idle_count: counts.idle,
      proctoring_context: proctoringNote(counts),
    },
  });
  // TODO (Step 4): render PDF (Puppeteer → R2) and email the interviewer (Resend).
}
