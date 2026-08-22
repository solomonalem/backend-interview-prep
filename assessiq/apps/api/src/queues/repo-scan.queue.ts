import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis.js';

export interface ScanJob {
  scanId: string;
}

/**
 * Repository scans. Unlike scoring, this does NOT retry.
 *
 * A scan downloads a repository and spends real tokens across a dozen model
 * calls. An automatic retry would silently double that cost, and the common
 * failures here are not transient — an empty repository, a revoked
 * installation, a repo removed from the app's selection. Those fail the same
 * way twice.
 *
 * So a failure is recorded with a readable message and left for the manager to
 * re-run deliberately. Transient network blips inside a scan are already
 * retried one level down, per Claude call and per batch.
 */
export const repoScanQueue = new Queue<ScanJob>('repo-scan', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
