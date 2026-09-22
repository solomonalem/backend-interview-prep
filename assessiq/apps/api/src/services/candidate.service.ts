import type {
  CandidateDetail,
  CandidateJourneyEntry,
  CandidateListResponse,
  CreateCandidateRequest,
  UpdateCandidateRequest,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { deriveLinkStatus } from '../utils/link-status.js';

/**
 * Candidate records — the manager's view of the people they assess.
 *
 * Nothing in this file authenticates a candidate, because a candidate never
 * authenticates: they click a signed link. Every function here takes an
 * ownerId and scopes to it, so a record is only ever reachable by the manager
 * who keeps it.
 */

function clientBaseUrl(): string {
  return process.env.CLIENT_URL ?? 'http://localhost:5173';
}

/**
 * One canonical form for an address, applied everywhere a candidate is looked
 * up or stored.
 *
 * The unique index is on the stored value, so normalising in only some paths
 * would let Alex@x.com and alex@x.com become two records for one person — and
 * a manager retyping an address will not reproduce its casing.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A usable name when the manager never typed one. */
function nameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}

/**
 * Is this label a real name, or the auto-generated handle a link gets when
 * nobody types one?
 *
 * "Candidate 3" identifies a link perfectly well and names a person terribly,
 * so it must never become the name on a record.
 */
function isAutoLabel(label: string | null | undefined): boolean {
  const trimmed = label?.trim();
  return !trimmed || /^Candidate \d+$/.test(trimmed);
}

/**
 * Find (or create) the record an emailed link belongs to.
 *
 * Called from the normal invite flow, which is what makes records accrete
 * without anybody maintaining them: a manager who never opens the candidates
 * page still ends up with an accurate one. Creating is deliberately silent —
 * a failure to file a link must never stop the link being sent.
 */
export async function findOrCreateCandidate(
  ownerId: string,
  email: string,
  labelFallback?: string | null,
): Promise<{ id: string } | null> {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  const existing = await prisma.candidate.findUnique({
    where: { owner_id_email: { owner_id: ownerId, email: normalised } },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.candidate.create({
    data: {
      owner_id: ownerId,
      email: normalised,
      name: isAutoLabel(labelFallback) ? nameFromEmail(normalised) : labelFallback!.trim(),
    },
    select: { id: true },
  });
}

// ── GET /candidates ──────────────────────────────────────────────────────────
export async function listCandidates(
  ownerId: string,
  search?: string,
): Promise<CandidateListResponse> {
  const q = search?.trim();
  const rows = await prisma.candidate.findMany({
    where: {
      owner_id: ownerId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: {
      links: {
        select: {
          created_at: true,
          session: {
            select: {
              submitted_at: true,
              report: { select: { overall_pct: true, verdict: true, generated_at: true } },
            },
          },
        },
      },
    },
  });

  const candidates = rows.map((c) => {
    // The newest report wins the headline verdict. Ordered here rather than in
    // the query because "latest" spans two tables and one of them is optional.
    const reported = c.links
      .map((l) => l.session)
      .filter((s): s is NonNullable<typeof s> => Boolean(s?.report))
      .sort(
        (a, b) =>
          (b.report!.generated_at?.getTime() ?? 0) - (a.report!.generated_at?.getTime() ?? 0),
      );
    const latest = reported[0]?.report ?? null;

    const stamps = c.links.flatMap((l) => [
      l.session?.submitted_at?.getTime() ?? null,
      l.created_at.getTime(),
    ]);
    const lastActivity = stamps.filter((n): n is number => n !== null).sort((a, b) => b - a)[0];

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      assessments_sent: c.links.length,
      last_activity_at: lastActivity ? new Date(lastActivity).toISOString() : null,
      latest_verdict: latest?.verdict ?? null,
      latest_score: latest?.overall_pct ?? null,
    };
  });

  // Most recently active first — the manager's working order, not alphabetical.
  candidates.sort((a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''));
  return { candidates };
}

// ── GET /candidates/:id ──────────────────────────────────────────────────────
export async function getCandidate(ownerId: string, id: string): Promise<CandidateDetail> {
  const candidate = await prisma.candidate.findFirst({
    where: { id, owner_id: ownerId },
  });
  if (!candidate) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'Candidate not found');

  // Two ways a link belongs to this person: it is attached to the record, or
  // it carries their address and this manager's assessment. The second clause
  // catches links created before the record existed — the backfill handles
  // history, but a manager who adds a record by hand today should still see
  // what they sent that address last week.
  const links = await prisma.assessmentLink.findMany({
    where: {
      assessment: { owner_id: ownerId },
      OR: [{ candidate_id: candidate.id }, { candidate_email: candidate.email }],
    },
    orderBy: { created_at: 'desc' },
    include: {
      assessment: { select: { id: true, title: true } },
      session: {
        select: {
          id: true,
          status: true,
          submitted_at: true,
          report: { select: { overall_pct: true, verdict: true } },
        },
      },
    },
  });

  const base = clientBaseUrl();
  const journey: CandidateJourneyEntry[] = links.map((l) => ({
    link_id: l.id,
    token: l.token,
    assessment_id: l.assessment.id,
    assessment_title: l.assessment.title,
    sent_at: l.created_at.toISOString(),
    expires_at: l.expires_at.toISOString(),
    status: deriveLinkStatus(l),
    url: `${base}/a/${l.token}`,
    session_id: l.session?.id ?? null,
    submitted_at: l.session?.submitted_at?.toISOString() ?? null,
    overall_score: l.session?.report?.overall_pct ?? null,
    verdict: l.session?.report?.verdict ?? null,
    linked_by_record: l.candidate_id === candidate.id,
  }));

  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    notes: candidate.notes,
    created_at: candidate.created_at.toISOString(),
    journey,
  };
}

// ── POST /candidates ─────────────────────────────────────────────────────────
export async function createCandidate(
  ownerId: string,
  input: CreateCandidateRequest,
): Promise<CandidateDetail> {
  const email = normaliseEmail(input.email);
  const existing = await prisma.candidate.findUnique({
    where: { owner_id_email: { owner_id: ownerId, email } },
    select: { id: true },
  });
  // Not an error worth showing: the manager asked for a record for this person
  // and one exists, so hand them that one. Adding someone twice is a thing
  // people do, and a 409 here would only make them go and find it themselves.
  if (existing) return getCandidate(ownerId, existing.id);

  const created = await prisma.candidate.create({
    data: {
      owner_id: ownerId,
      email,
      name: input.name.trim() || nameFromEmail(email),
      notes: input.notes?.trim() || null,
    },
    select: { id: true },
  });
  return getCandidate(ownerId, created.id);
}

// ── PATCH /candidates/:id ────────────────────────────────────────────────────
/**
 * Edit a record. An email change is allowed and is the interesting case.
 *
 * COLLISIONS ARE REFUSED, not merged. Merging two records means deciding which
 * name, which notes and which history survive, and getting that wrong destroys
 * something the manager cannot reconstruct — so the edit fails with the id of
 * the record that already holds the address, and the manager decides. A merge
 * UI is explicitly out of scope for this wave.
 */
export async function updateCandidate(
  ownerId: string,
  id: string,
  input: UpdateCandidateRequest,
): Promise<CandidateDetail> {
  const candidate = await prisma.candidate.findFirst({
    where: { id, owner_id: ownerId },
    select: { id: true, email: true },
  });
  if (!candidate) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'Candidate not found');

  const nextEmail = input.email !== undefined ? normaliseEmail(input.email) : undefined;
  if (nextEmail !== undefined && nextEmail !== candidate.email) {
    if (!nextEmail) throw new AppError(400, 'VALIDATION', 'An email address is required');
    const clash = await prisma.candidate.findUnique({
      where: { owner_id_email: { owner_id: ownerId, email: nextEmail } },
      select: { id: true, name: true, email: true },
    });
    if (clash) {
      throw new AppError(
        409,
        'CANDIDATE_EMAIL_TAKEN',
        `${clash.name} already uses that email address. Records can't be merged — edit or delete that one first.`,
        { conflict: { candidate_id: clash.id, name: clash.name, email: clash.email } },
      );
    }
  }

  await prisma.candidate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(nextEmail !== undefined ? { email: nextEmail } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    },
  });
  return getCandidate(ownerId, id);
}

// ── DELETE /candidates/:id ───────────────────────────────────────────────────
/**
 * Delete the record and nothing else.
 *
 * The schema does the work: candidate_id is SetNull, so every link, session,
 * score and report survives and keeps working — the links simply go back to
 * standing alone. This is stated in the confirm dialog too, because "delete
 * candidate" reads like it might take the assessments with it.
 */
export async function deleteCandidate(ownerId: string, id: string): Promise<{ ok: true }> {
  const candidate = await prisma.candidate.findFirst({
    where: { id, owner_id: ownerId },
    select: { id: true },
  });
  if (!candidate) throw new AppError(404, 'CANDIDATE_NOT_FOUND', 'Candidate not found');
  await prisma.candidate.delete({ where: { id } });
  return { ok: true };
}
