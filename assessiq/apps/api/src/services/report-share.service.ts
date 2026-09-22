import type { ReportShareListResponse, ReportShareSummary } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateToken } from '../utils/token.js';

/**
 * Read-only links to a report.
 *
 * Everything in this file is the manager's side of the feature — minting,
 * listing and revoking. READING a shared report lives in report.service's
 * getSharedReport, on its own authorisation path, and that separation is the
 * point: a share token is turned into one session id by one function, and no
 * other route in the API accepts one.
 */

function shareUrl(token: string): string {
  const base = process.env.CLIENT_URL ?? 'http://localhost:5173';
  return `${base}/r/${token}`;
}

function toSummary(row: {
  id: string;
  token: string;
  created_at: Date;
  revoked_at: Date | null;
}): ReportShareSummary {
  return {
    id: row.id,
    url: shareUrl(row.token),
    created_at: row.created_at.toISOString(),
    revoked_at: row.revoked_at?.toISOString() ?? null,
  };
}

/** The manager must own the assessment this session belongs to. */
async function assertOwnsSession(ownerId: string, sessionId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, assessment: { owner_id: ownerId } },
    select: { id: true },
  });
  if (!session) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
}

// ── POST /reports/session/:id/shares ─────────────────────────────────────────
export async function createReportShare(
  ownerId: string,
  sessionId: string,
): Promise<ReportShareSummary> {
  await assertOwnsSession(ownerId, sessionId);

  // Same collision handling as a candidate link — astronomically unlikely, and
  // cheap to rule out.
  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.reportShare.findUnique({ where: { token }, select: { id: true } });
    if (!clash) break;
    token = generateToken();
  }

  const share = await prisma.reportShare.create({
    data: { session_id: sessionId, token, created_by: ownerId },
  });
  return toSummary(share);
}

// ── GET /reports/session/:id/shares ──────────────────────────────────────────
export async function listReportShares(
  ownerId: string,
  sessionId: string,
): Promise<ReportShareListResponse> {
  await assertOwnsSession(ownerId, sessionId);
  const shares = await prisma.reportShare.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: 'desc' },
  });
  return { shares: shares.map(toSummary) };
}

// ── DELETE /reports/shares/:shareId ──────────────────────────────────────────
/**
 * Revoke one link. The row survives with a revoked_at stamp: a manager who
 * cut off a link wants to see that they did, and a list that silently shrinks
 * cannot tell them apart from one they never created.
 *
 * Idempotent — revoking an already-dead link is not an error worth raising.
 */
export async function revokeReportShare(
  ownerId: string,
  shareId: string,
): Promise<ReportShareSummary> {
  const share = await prisma.reportShare.findFirst({
    where: { id: shareId, session: { assessment: { owner_id: ownerId } } },
  });
  if (!share) throw new AppError(404, 'SHARE_NOT_FOUND', 'Share link not found');
  if (share.revoked_at) return toSummary(share);

  const updated = await prisma.reportShare.update({
    where: { id: shareId },
    data: { revoked_at: new Date() },
  });
  return toSummary(updated);
}
