import type { InviteEmailStatus, SendReminderResponse } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { sendAssessmentReminder } from './email.service.js';

/**
 * Nudging a candidate who hasn't started.
 *
 * The rule the whole file is built around: NEVER TWICE BY ACCIDENT. A manager
 * can send as many manual reminders as they judge appropriate — that is a
 * person deciding — but the automatic sweep sends at most one per link, ever,
 * enforced by a stamp it checks before it writes.
 */

function clientBaseUrl(): string {
  return process.env.CLIENT_URL ?? 'http://localhost:5173';
}

/** Who is eligible for a reminder at all, manual or automatic. */
function ineligibleReason(link: {
  candidate_email: string | null;
  session_id: string | null;
  expires_at: Date | null;
}): string | null {
  if (!link.candidate_email) return 'This link has no email address on it.';
  // Started means they are past the thing we would be reminding them to do.
  if (link.session_id) return 'This candidate has already started.';
  if (link.expires_at && link.expires_at.getTime() < Date.now()) {
    return 'This link has expired — extend it first, then remind them.';
  }
  return null;
}

async function loadLinkForReminder(linkId: string) {
  return prisma.assessmentLink.findUnique({
    where: { id: linkId },
    include: {
      assessment: {
        select: { title: true, owner_id: true, owner: { select: { name: true, email: true } } },
      },
    },
  });
}

// ── POST /assessments/:id/links/:linkId/reminder ─────────────────────────────
export async function sendManualReminder(
  ownerId: string,
  assessmentId: string,
  linkId: string,
): Promise<SendReminderResponse> {
  const link = await loadLinkForReminder(linkId);
  if (!link || link.assessment_id !== assessmentId || link.assessment.owner_id !== ownerId) {
    throw new AppError(404, 'LINK_NOT_FOUND', 'Candidate link not found');
  }
  const blocked = ineligibleReason(link);
  if (blocked) throw new AppError(400, 'REMINDER_NOT_APPLICABLE', blocked);

  const result = await deliverReminder(link);
  // Stamped even on failure. The question the manager is asking is "did I
  // already write to this person", and an attempt that bounced is still an
  // attempt they should see before making another.
  const sentAt = new Date();
  await prisma.assessmentLink.update({
    where: { id: link.id },
    data: { reminder_sent_at: sentAt },
  });

  return {
    status: result.status,
    ...(result.error ? { error: result.error } : {}),
    reminder_sent_at: sentAt.toISOString(),
  };
}

async function deliverReminder(link: {
  token: string;
  candidate_email: string | null;
  expires_at: Date | null;
  assessment: { title: string; owner: { name: string | null; email: string } };
}): Promise<{ status: InviteEmailStatus; error?: string }> {
  if (!link.candidate_email) return { status: 'skipped_no_email' };
  return sendAssessmentReminder(link.candidate_email, {
    assessmentTitle: link.assessment.title,
    fromName: link.assessment.owner.name || link.assessment.owner.email,
    url: `${clientBaseUrl()}/a/${link.token}`,
    expiresAt: link.expires_at?.toISOString() ?? null,
  });
}

export interface ReminderSweepResult {
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * The daily sweep: one automatic reminder to anyone who was invited, never
 * started, and has been quiet for the assessment's configured number of days.
 *
 * Every guard here exists to make the sweep boring. It only looks at
 * assessments whose owner turned reminders on; it skips links with no email,
 * links already started, links already expired, and — the important one —
 * links that already have an `auto_reminder_sent_at`. That last check makes
 * the sweep safe to run as often as anyone likes, including twice by accident,
 * which is why it is also run once shortly after the worker boots.
 */
export async function runReminderSweep(now = new Date()): Promise<ReminderSweepResult> {
  const links = await prisma.assessmentLink.findMany({
    where: {
      session_id: null,
      auto_reminder_sent_at: null,
      candidate_email: { not: null },
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      assessment: { auto_reminder_days: { not: null } },
    },
    include: {
      assessment: {
        select: {
          title: true,
          auto_reminder_days: true,
          owner_id: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
  });

  const result: ReminderSweepResult = { considered: links.length, sent: 0, failed: 0, skipped: 0 };

  for (const link of links) {
    const days = link.assessment.auto_reminder_days ?? 0;
    const dueAt = link.created_at.getTime() + days * 24 * 60 * 60 * 1000;
    if (now.getTime() < dueAt) {
      result.skipped += 1;
      continue;
    }

    const outcome = await deliverReminder(link);
    // Stamped whatever happened: one automatic attempt per link is the
    // contract, and retrying a bounce forever would be the spam this guards
    // against.
    await prisma.assessmentLink.update({
      where: { id: link.id },
      data: { auto_reminder_sent_at: now, reminder_sent_at: now },
    });

    if (outcome.status === 'sent') result.sent += 1;
    else if (outcome.status === 'failed') result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}
