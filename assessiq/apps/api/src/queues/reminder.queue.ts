import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis.js';

export interface ReminderSweepJob {
  /** Why this sweep ran — only ever logged. */
  trigger: 'schedule' | 'boot';
}

/**
 * The nightly nudge.
 *
 * 09:00 UTC, once a day: reminders are a courtesy, and a courtesy that arrives
 * at 3am reads as a machine. Daily is also the finest cadence that means
 * anything, since the trigger is measured in days of silence.
 */
export const REMINDER_CRON = '0 9 * * *';
export const REMINDER_JOB_NAME = 'reminder-sweep';

export const reminderQueue = new Queue<ReminderSweepJob>('reminders', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

/**
 * Register the repeating sweep. Idempotent — BullMQ keys a repeatable job by
 * its name and pattern, so calling this on every worker boot leaves exactly
 * one schedule.
 */
export async function scheduleReminderSweep(): Promise<void> {
  await reminderQueue.add(
    REMINDER_JOB_NAME,
    { trigger: 'schedule' },
    { repeat: { pattern: REMINDER_CRON }, jobId: 'reminder-sweep-daily' },
  );
}
