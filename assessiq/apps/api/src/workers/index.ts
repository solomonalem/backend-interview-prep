// Worker process entry point (run separately: npm run dev:worker).
import '../lib/load-env.js'; // must be first — populates process.env from .env
import {
  anthropic,
  ANALYSIS_MODEL,
  GENERATION_MODEL,
  SCORING_MODEL,
  SYNTHESIS_MODEL,
} from '../lib/claude.js';
import { scoringWorker } from './scoring.worker.js';
import { repoScanWorker } from './repo-scan.worker.js';
import { questionGenWorker } from './question-gen.worker.js';
import { reminderWorker } from './reminder.worker.js';
import { reminderQueue, scheduleReminderSweep } from '../queues/reminder.queue.js';
import { logErr } from '../lib/safe-log.js';
import { sweepOrphanedWorkspaces } from '../lib/repo-snapshot.js';

console.log(
  `[assessiq-worker] scoring worker started — model: ${anthropic ? SCORING_MODEL : 'stub-dev (no ANTHROPIC_API_KEY)'}`,
);
console.log(
  `[assessiq-worker] question-gen worker started — model: ${anthropic ? GENERATION_MODEL : 'UNAVAILABLE (no ANTHROPIC_API_KEY)'}`,
);
console.log(
  `[assessiq-worker] repo-scan worker started — models: ${
    anthropic ? `${ANALYSIS_MODEL} → ${SYNTHESIS_MODEL}` : 'UNAVAILABLE (no ANTHROPIC_API_KEY)'
  }`,
);

scoringWorker.on('completed', (job) => {
  console.log(`[scoring] job ${job.id} completed (answer ${job.data.answerId})`);
});
scoringWorker.on('failed', (job, err) => {
  logErr('scoring', `job ${job?.id}`, err);
});

repoScanWorker.on('completed', (job) => {
  console.log(`[repo-scan] job ${job.id} completed (scan ${job.data.scanId})`);
});
repoScanWorker.on('failed', (job, err) => {
  // runScan already recorded the failure on the scan row; this is operator noise.
  logErr('repo-scan', `job ${job?.id}`, err);
});

questionGenWorker.on('completed', (job) => {
  const source =
    job.data.kind === 'document'
      ? `document ${job.data.documentId}`
      : `finding ${job.data.findingId}`;
  console.log(`[question-gen] job ${job.id} completed (${source})`);
});
questionGenWorker.on('failed', (job, err) => {
  logErr('question-gen', `job ${job?.id}`, err);
});

reminderWorker.on('completed', (job) => {
  console.log(`[reminders] job ${job.id} completed`);
});
reminderWorker.on('failed', (job, err) => {
  logErr('reminders', `job ${job?.id}`, err);
});

// The daily schedule, plus one sweep shortly after boot.
//
// The boot sweep is safe for exactly one reason: a link carries
// `auto_reminder_sent_at`, and the sweep checks it before it writes, so the
// automatic reminder happens at most once per link no matter how many times
// this runs. It also makes the feature testable without waiting for 09:00.
void (async () => {
  try {
    await scheduleReminderSweep();
    console.log('[assessiq-worker] reminder sweep scheduled (daily 09:00 UTC)');
    setTimeout(() => {
      void reminderQueue.add('reminder-sweep', { trigger: 'boot' });
    }, 10_000);
  } catch (err) {
    logErr('reminders', 'could not schedule the sweep', err);
  }
})();

// A crash can leave a checkout behind that the finally block never reached.
void sweepOrphanedWorkspaces();

async function shutdown() {
  await Promise.all([
    scoringWorker.close(),
    repoScanWorker.close(),
    questionGenWorker.close(),
    reminderWorker.close(),
  ]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
