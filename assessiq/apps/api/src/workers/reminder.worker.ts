import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { runReminderSweep } from '../services/reminder.service.js';
import type { ReminderSweepJob } from '../queues/reminder.queue.js';

/**
 * Sends the automatic reminders.
 *
 * Concurrency 1 on purpose: this walks a list and sends email, and there is
 * nothing to gain from doing two of those at once and something to lose if two
 * sweeps ever overlapped on the same link.
 */
export const reminderWorker = new Worker<ReminderSweepJob>(
  'reminders',
  async (job) => {
    const result = await runReminderSweep();
    console.log(
      `[reminders] sweep (${job.data.trigger}) — considered ${result.considered}, sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`,
    );
    return result;
  },
  { connection: redisConnection, concurrency: 1 },
);
