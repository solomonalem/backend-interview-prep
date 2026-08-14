import type { ScanFindingsResponse, ScanStats, ScanView, FindingView } from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.middleware.js';
import { fetchSnapshot, wipe } from '../lib/repo-snapshot.js';
import { detectStack, inventory, MAX_SELECTED_FILES } from '../lib/repo-inventory.js';
import { analyzeRepo } from './analysis.service.js';
import { repoScanQueue } from '../queues/repo-scan.queue.js';

// Orchestrates the pipeline (design §5) and owns everything the API reads back.
// The pipeline itself runs in the worker; nothing here blocks a request on it.

type ScanRow = {
  id: string;
  repo_ref_id: string;
  status: string;
  partial: boolean;
  error: string | null;
  stats: unknown;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  repo_ref?: { full_name: string } | null;
  _count?: { findings: number };
};

function toView(row: ScanRow, fullName?: string): ScanView {
  return {
    id: row.id,
    repo_ref_id: row.repo_ref_id,
    repo_full_name: fullName ?? row.repo_ref?.full_name ?? '',
    status: row.status as ScanView['status'],
    partial: row.partial,
    error: row.error,
    stats: (row.stats as ScanStats | null) ?? null,
    started_at: row.started_at?.toISOString() ?? null,
    finished_at: row.finished_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    finding_count: row._count?.findings ?? 0,
  };
}

/** Every read goes through here: a scan belongs to a repo, which belongs to an
 *  integration, which belongs to one owner. 404 rather than 403 throughout. */
async function ownedScan(ownerId: string, scanId: string) {
  const scan = await prisma.repoScan.findFirst({
    where: { id: scanId, repo_ref: { integration: { owner_id: ownerId } } },
    include: { repo_ref: { select: { full_name: true } }, _count: { select: { findings: true } } },
  });
  if (!scan) throw new AppError(404, 'SCAN_NOT_FOUND', 'Scan not found');
  return scan;
}

// ── POST /integrations/github/repos/:id/scan ─────────────────────────────────
export async function startScan(ownerId: string, repoRefId: string): Promise<ScanView> {
  const repo = await prisma.repoRef.findFirst({
    where: { id: repoRefId, integration: { owner_id: ownerId } },
    include: { integration: true },
  });
  if (!repo) throw new AppError(404, 'REPO_NOT_FOUND', 'Repository not found');

  // A revoked integration can no longer mint installation tokens, so a scan
  // would fail at the first call. Say so up front instead.
  if (repo.integration.status !== 'active') {
    throw new AppError(
      409,
      'INTEGRATION_REVOKED',
      'This GitHub connection is disconnected — reconnect before scanning.',
    );
  }

  // One scan at a time per repo. Two concurrent scans would duplicate the cost
  // and race to write findings for the same repository.
  const inFlight = await prisma.repoScan.findFirst({
    where: { repo_ref_id: repoRefId, status: { in: ['queued', 'cloning', 'analyzing'] } },
    include: { repo_ref: { select: { full_name: true } }, _count: { select: { findings: true } } },
  });
  if (inFlight) return toView(inFlight);

  const scan = await prisma.repoScan.create({
    data: { repo_ref_id: repoRefId, status: 'queued' },
    include: { repo_ref: { select: { full_name: true } }, _count: { select: { findings: true } } },
  });
  await prisma.repoRef.update({ where: { id: repoRefId }, data: { last_scan_id: scan.id } });
  await repoScanQueue.add('scan', { scanId: scan.id });
  return toView(scan);
}

// ── GET /repo-scans/:id ──────────────────────────────────────────────────────
export async function getScan(ownerId: string, scanId: string): Promise<ScanView> {
  return toView(await ownedScan(ownerId, scanId));
}

// ── GET /repo-scans/:id/findings ─────────────────────────────────────────────
export async function getScanFindings(
  ownerId: string,
  scanId: string,
): Promise<ScanFindingsResponse> {
  const scan = await ownedScan(ownerId, scanId);
  const rows = await prisma.repoFinding.findMany({
    where: { scan_id: scanId },
    orderBy: [{ kind: 'asc' }, { created_at: 'asc' }],
  });
  return {
    scan: toView(scan),
    findings: rows.map(
      (f): FindingView => ({
        id: f.id,
        kind: f.kind as FindingView['kind'],
        title: f.title,
        detail: f.detail,
        file_path: f.file_path,
        line_start: f.line_start,
        line_end: f.line_end,
        excerpt: f.excerpt,
      }),
    ),
  };
}

/** Latest scan per repo, for the integrations screen. */
export async function latestScans(ownerId: string): Promise<Record<string, ScanView>> {
  const rows = await prisma.repoScan.findMany({
    where: { repo_ref: { integration: { owner_id: ownerId } } },
    orderBy: { created_at: 'desc' },
    include: { repo_ref: { select: { full_name: true } }, _count: { select: { findings: true } } },
  });
  const out: Record<string, ScanView> = {};
  for (const r of rows) if (!out[r.repo_ref_id]) out[r.repo_ref_id] = toView(r);
  return out;
}

// ── The pipeline itself (worker entry point) ─────────────────────────────────
/**
 * snapshot → detect stack → select files → analyse → persist findings → wipe.
 *
 * The workspace is removed in a finally block whatever happens (§2.2). Failures
 * are recorded as a readable message on the scan; the message is composed here
 * rather than passed through from a raw error, so no file content can reach it.
 */
export async function runScan(scanId: string): Promise<void> {
  const scan = await prisma.repoScan.findUnique({
    where: { id: scanId },
    include: { repo_ref: { include: { integration: true } } },
  });
  if (!scan) return; // deleted between enqueue and run

  const repo = scan.repo_ref;
  let dir: string | null = null;

  try {
    await prisma.repoScan.update({
      where: { id: scanId },
      data: { status: 'cloning', started_at: new Date(), error: null },
    });

    const snap = await fetchSnapshot(
      repo.integration.installation_id,
      repo.full_name,
      repo.default_branch,
    );
    dir = snap.dir;

    const inv = await inventory(dir, MAX_SELECTED_FILES);
    const stack = await detectStack(dir, inv.manifestPaths);

    await prisma.repoScan.update({ where: { id: scanId }, data: { status: 'analyzing' } });

    const result = await analyzeRepo({
      root: dir,
      files: inv.selected,
      stack,
      strictMode: repo.integration.strict_mode,
    });

    const stats: ScanStats = {
      files_seen: inv.filesSeen,
      files_selected: inv.selected.length,
      files_analyzed: result.filesAnalyzed,
      tokens_used: result.tokensUsed,
      stack: stack.stack,
      libraries: stack.libraries,
    };

    // Findings and the terminal status land together: a scan is never `done`
    // with its findings half-written.
    await prisma.$transaction([
      prisma.repoFinding.deleteMany({ where: { scan_id: scanId } }),
      prisma.repoFinding.createMany({
        data: result.findings.map((f) => ({ scan_id: scanId, ...f })),
      }),
      prisma.repoScan.update({
        where: { id: scanId },
        data: {
          status: 'done',
          partial: result.partial,
          finished_at: new Date(),
          stats: stats as unknown as object,
        },
      }),
    ]);
  } catch (err) {
    const message = err instanceof AppError ? err.message : (err as Error).message;
    await prisma.repoScan.update({
      where: { id: scanId },
      data: {
        status: 'failed',
        finished_at: new Date(),
        // Bounded, and built from our own error text — never a response body.
        error: message.slice(0, 500),
      },
    });
    console.error(`[scan] ${scanId} failed: ${message}`);
  } finally {
    await wipe(dir);
  }
}
