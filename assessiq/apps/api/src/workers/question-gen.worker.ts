import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import type { QuestionGenJob } from '../queues/question-gen.queue.js';
import { generateForFinding, generateFromDocument } from '../services/generation.service.js';
import type { Difficulty, QuestionType } from '@assessiq/types';

/**
 * One grounding source per job — a scan finding, or a batch of questions from a
 * supplied document. Concurrency 2: enough that selecting several findings
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
    const data = job.data;
    if (data.kind === 'document') {
      await generateFromDocument(
        {
          documentId: data.documentId,
          seniority: data.seniority as Difficulty,
          ...(data.type ? { type: data.type as QuestionType } : {}),
          count: data.count,
        },
        data.ownerId,
      );
      return;
    }

    await generateForFinding(
      {
        findingId: data.findingId,
        seniority: data.seniority as Difficulty,
        ...(data.type ? { type: data.type as QuestionType } : {}),
        countPerFinding: data.countPerFinding,
      },
      data.ownerId,
    );
  },
  { connection: redisConnection, concurrency: 2 },
);
