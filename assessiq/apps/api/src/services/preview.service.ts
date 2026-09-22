import type { LinkValidateResponse, StartSessionResponse } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { signCandidateToken } from '../lib/jwt.js';
import { AppError } from '../middleware/error.middleware.js';

/**
 * "Preview as candidate" — the manager walks their own assessment.
 *
 * The point is fidelity: same questions, same timer, same proctoring notices,
 * same follow-up probes, generated for real, because a preview that behaves
 * differently from the thing it previews is worth nothing. A manager should be
 * able to find out that their 20-minute timer is brutal BEFORE a candidate
 * does.
 *
 * What a preview never becomes is data. No score, no report, no candidate
 * record, nothing in any count — enforced at the one place it matters (the
 * submit path skips the scoring queue) and by the fact that a preview session
 * has no link, so every surface that walks links cannot see it.
 */

/** A preview is scratch work; a day is far longer than anyone needs it. */
const PREVIEW_TTL_HOURS = 24;

interface PreviewMeta {
  assessment: LinkValidateResponse['assessment'];
}

async function loadOwnedAssessment(ownerId: string, assessmentId: string) {
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, owner_id: ownerId },
    include: {
      owner: { select: { company: true } },
      _count: { select: { questions: true } },
      questions: {
        orderBy: { position: 'asc' },
        include: { question: { select: { id: true, text: true, topic: true } } },
      },
    },
  });
  if (!a) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
  return a;
}

function proctoringEnabled(config: unknown): boolean {
  const pc = config as
    | {
        track_tab_switches?: boolean;
        track_focus_loss?: boolean;
        detect_paste?: boolean;
        detect_idle?: boolean;
      }
    | null;
  return Boolean(
    pc && (pc.track_tab_switches || pc.track_focus_loss || pc.detect_paste || pc.detect_idle),
  );
}

// ── GET /assessments/:id/preview ─────────────────────────────────────────────
/** The instructions page's content, exactly as a candidate would receive it. */
export async function getPreviewMeta(ownerId: string, assessmentId: string): Promise<PreviewMeta> {
  const a = await loadOwnedAssessment(ownerId, assessmentId);
  return {
    assessment: {
      title: a.title,
      question_count: a._count.questions,
      timer_seconds: a.timer_seconds,
      proctoring_enabled: proctoringEnabled(a.proctoring_config),
      confidence_rating_enabled: a.confidence_rating_enabled,
      company_name: a.owner.company,
      probes_enabled: a.probes_mode !== 'off',
      probe_time_seconds: a.probe_time_seconds,
    },
  };
}

// ── POST /assessments/:id/preview ────────────────────────────────────────────
/**
 * Start a preview run.
 *
 * CLEANUP HAPPENS HERE, on the way in, rather than on a schedule. A preview is
 * only ever created by a manager pressing a button, so "tidy up when someone
 * previews" runs exactly as often as previews exist — no cron to own, no
 * worker to keep alive for a housekeeping task, and nothing accumulating in a
 * deployment where the worker is down.
 */
export async function startPreviewSession(
  ownerId: string,
  assessmentId: string,
): Promise<StartSessionResponse> {
  const a = await loadOwnedAssessment(ownerId, assessmentId);
  const first = a.questions[0];
  if (!first) throw new AppError(400, 'NO_QUESTIONS', 'Assessment has no questions');

  await deleteStalePreviews(ownerId);

  const startedAt = new Date();
  const session = await prisma.session.create({
    data: {
      assessment_id: a.id,
      candidate_label: 'Preview',
      is_preview: true,
      status: 'in_progress',
      started_at: startedAt,
    },
  });

  const sessionToken = signCandidateToken(session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: { session_token: sessionToken },
  });

  return {
    session_id: session.id,
    session_token: sessionToken,
    expires_at:
      a.timer_enabled && a.timer_seconds
        ? new Date(startedAt.getTime() + a.timer_seconds * 1000).toISOString()
        : null,
    first_question: { position: first.position, question: first.question },
  };
}

/**
 * Delete this manager's previews older than the TTL.
 *
 * Cascades take the answers, drafts, probes and behaviour events with them,
 * which is the whole reason a preview is a normal session with a flag: there
 * is no second cleanup path to forget about.
 */
async function deleteStalePreviews(ownerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - PREVIEW_TTL_HOURS * 60 * 60 * 1000);
  await prisma.session.deleteMany({
    where: {
      is_preview: true,
      created_at: { lt: cutoff },
      assessment: { owner_id: ownerId },
    },
  });
}
