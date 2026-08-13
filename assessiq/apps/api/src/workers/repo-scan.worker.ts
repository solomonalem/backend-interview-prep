import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import type { ScanJob } from '../queues/repo-scan.queue.js';
import { runScan } from '../services/scan.service.js';

/**
 * One scan at a time. A scan holds a repository on disk and runs a dozen model
 * calls; running several concurrently multiplies both disk and rate-limit
 * pressure for no gain, since a manager is waiting on one repo at a time.
 *
 * runScan records its own terminal state — including failure — so this worker
 * never needs to translate an error into scan status.
 */
export const repoScanWorker = new Worker<ScanJob>(
  'repo-scan',
  async (job) => {
    await runScan(job.data.scanId);
  },
  { connection: redisConnection, concurrency: 1 },
);
