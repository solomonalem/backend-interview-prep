import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { GithubError, installationToken } from './github.js';

const exec = promisify(execFile);

/** Design §5.1 size guard. A repo past this is refused rather than scanned. */
export const MAX_REPO_BYTES = 500 * 1024 * 1024;

export interface Snapshot {
  dir: string;
  bytes: number;
}

/**
 * A depth-1 snapshot of the default branch in a temp directory.
 *
 * DEVIATION FROM DESIGN §5.1, flagged deliberately: the spec says "shallow
 * clone (depth 1)". This downloads the tarball GitHub already builds for that
 * exact purpose instead. Same result — one commit's worth of tree, no history —
 * with three concrete advantages:
 *
 *   1. The installation token goes in an Authorization header. A `git clone`
 *      carries it in the URL, which means it lands in argv and is visible to
 *      anything that can read /proc or run `ps`.
 *   2. No dependency on a `git` binary in the worker's container.
 *   3. The size guard can refuse a repo before any of it is written to disk.
 *
 * The caller MUST call wipe() in a finally block (§2.2).
 */
export async function fetchSnapshot(
  installationId: string,
  fullName: string,
  ref: string,
): Promise<Snapshot> {
  const token = await installationToken(installationId);
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'AssessIQ',
  };

  // Ask GitHub about the repo first. Two reasons, both learned the hard way:
  //
  //  - An empty repository 404s on the tarball, which is indistinguishable from
  //    "no access" at the download step. Naming it here turns a baffling error
  //    into an obvious one.
  //  - Our stored default_branch is a copy taken at connect time and can drift
  //    (renamed branch, changed default). GitHub's answer is authoritative.
  const metaRes = await fetch(`https://api.github.com/repos/${fullName}`, { headers });
  if (!metaRes.ok) {
    throw new GithubError(
      metaRes.status === 404
        ? `${fullName} is not accessible to this installation — it may have been removed from the app's repository selection`
        : `could not read ${fullName}`,
      metaRes.status,
    );
  }
  const meta = (await metaRes.json()) as { size: number; default_branch: string };
  if (meta.size === 0) {
    throw new GithubError(`${fullName} is empty — there is nothing to scan yet`, 422);
  }
  const branch = meta.default_branch || ref;

  const res = await fetch(
    `https://api.github.com/repos/${fullName}/tarball/${encodeURIComponent(branch)}`,
    { headers, redirect: 'follow' },
  );
  if (!res.ok || !res.body) {
    throw new GithubError(`could not download ${fullName}@${branch}`, res.status);
  }

  // Refuse oversized repos before writing anything, when GitHub tells us up front.
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_REPO_BYTES) {
    throw new GithubError(
      `repository archive is ${Math.round(declared / 1024 / 1024)} MB, over the ${MAX_REPO_BYTES / 1024 / 1024} MB limit`,
      413,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'assessiq-scan-'));
  const tarPath = join(dir, 'snapshot.tar.gz');

  try {
    // Content-Length is absent on a streamed archive, so the cap is also
    // enforced as bytes arrive — otherwise the guard is advisory only.
    let bytes = 0;
    const counted = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).map(
      (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_REPO_BYTES) {
          throw new GithubError(
            `repository exceeds the ${MAX_REPO_BYTES / 1024 / 1024} MB limit`,
            413,
          );
        }
        return chunk;
      },
    );
    await pipeline(counted, createWriteStream(tarPath));

    // GitHub wraps the tree in one top-level <owner>-<repo>-<sha> directory.
    await exec('tar', ['-xzf', tarPath, '-C', dir, '--strip-components=1'], {
      maxBuffer: 1024 * 1024,
    });
    await rm(tarPath, { force: true });

    return { dir, bytes: bytes || (await stat(dir).then(() => declared)) };
  } catch (err) {
    await wipe(dir); // never leave a partial checkout behind
    throw err;
  }
}

/**
 * Delete the workspace. Best-effort and never throws: this runs in a finally
 * block, and a failure to clean up must not mask the error that got us there.
 */
export async function wipe(dir: string | null): Promise<void> {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch (err) {
    // Path only — a cleanup failure is an ops problem, and the contents are
    // exactly what must never reach a log (§2.2).
    console.error(`[scan] could not remove workspace ${dir}:`, (err as Error).message);
  }
}
