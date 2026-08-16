import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import type { QuestionGenJob } from '../queues/question-gen.queue.js';
import { generateForFinding } from '../services/generation.service.js';
import type { Difficulty, QuestionType } from '@assessiq/types';

/**
 * One finding per job. Concurrency 2: enough that selecting several findings
 * feels like progress rather than a queue, low enough not to hammer the Claude
 * rate limit alongside a scan that may be running at the same time.
 *
 * A job that throws is retried by the queue; a job that exhausts its attempts
 * leaves no draft, which is exactly what the UI reports as "didn't produce a
 * question". Nothing half-written is ever persisted.
 */
export const questionGenWorker = new Worker<QuestionGenJob>(
  'question-gen',
  async (job) => {
    const { findingId, ownerId, seniority, type, countPerFinding } = job.data;
    await generateForFinding(
      {
        findingId,
        seniority: seniority as Difficulty,
        ...(type ? { type: type as QuestionType } : {}),
        countPerFinding,
      },
      ownerId,
    );
  },
  { connection: redisConnection, concurrency: 2 },
);
