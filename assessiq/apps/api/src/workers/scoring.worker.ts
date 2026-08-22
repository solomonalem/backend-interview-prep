import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { logErr } from '../lib/safe-log.js';
import type { ScoreJob } from '../queues/scoring.queue.js';
import {
  checkSessionComplete,
  markAnswerFailed,
  scoreAnswer,
} from '../services/scoring.service.js';

// Scores one answer per job; compiles the report once the session is complete.
// Concurrency 5 (docs/06) — handles a burst of submissions without overwhelming
// the Claude API rate limits.
export const scoringWorker = new Worker<ScoreJob>(
  'scoring',
  async (job) => {
    const { answerId, sessionId } = job.data;
    try {
      await scoreAnswer(answerId);
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= attempts) {
        // Terminal failure — mark it, surface it in the report, don't block the session.
        logErr('scoring', `answer ${answerId} failed permanently`, err);
        await markAnswerFailed(answerId);
        await checkSessionComplete(sessionId);
        return;
      }
      throw err; // retry
    }
    await checkSessionComplete(sessionId);
  },
  { connection: redisConnection, concurrency: 5 },
);
