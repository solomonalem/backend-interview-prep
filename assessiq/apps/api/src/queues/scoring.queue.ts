import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis.js';

export interface ScoreJob {
  answerId: string;
  sessionId: string;
}

export const scoringQueue = new Queue<ScoreJob>('scoring', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
