import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis.js';

/** Questions from one scan finding. */
export interface FindingGenJob {
  /** Absent on jobs enqueued before document grounding existed; those are all
   *  finding jobs, which is why this discriminant is optional. */
  kind?: 'finding';
  findingId: string;
  ownerId: string;
  seniority: 'junior' | 'mid' | 'senior' | 'staff';
  type?: string;
  countPerFinding: number;
}

/** Questions from one manager-supplied document, `count` per job. */
export interface DocumentGenJob {
  kind: 'document';
  documentId: string;
  ownerId: string;
  seniority: 'junior' | 'mid' | 'senior' | 'staff';
  type?: string;
  count: number;
}

export type QuestionGenJob = FindingGenJob | DocumentGenJob;

/**
 * Grounded question generation, one job per unit of grounding.
 *
 * Previously this ran inline in the request, which meant a manager selecting
 * five findings watched a spinner for minutes and could not navigate away.
 * Drafts were already the persistence model, so moving generation onto a queue
 * costs nothing conceptually: a job finishes by writing a draft, and the draft
 * IS the notification.
 *
 * Two attempts, unlike scanning. A generation job is one Claude call rather
 * than a dozen, so a retry is cheap; and the failure this protects against —
 * a timed-out or rate-limited call — genuinely does succeed on a second try.
 */
export const questionGenQueue = new Queue<QuestionGenJob>('question-gen', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    // Kept longer than completed jobs: a failure is what the UI needs to
    // report, and it is the only record that a grounding source was ever
    // attempted.
    removeOnFail: { count: 200 },
  },
});
