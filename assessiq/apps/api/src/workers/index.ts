// Worker process entry point (run separately: npm run dev:worker).
import '../lib/load-env.js'; // must be first — populates process.env from .env
import { anthropic, SCORING_MODEL } from '../lib/claude.js';
import { scoringWorker } from './scoring.worker.js';

console.log(
  `[assessiq-worker] scoring worker started — model: ${anthropic ? SCORING_MODEL : 'stub-dev (no ANTHROPIC_API_KEY)'}`,
);

scoringWorker.on('completed', (job) => {
  console.log(`[scoring] job ${job.id} completed (answer ${job.data.answerId})`);
});
scoringWorker.on('failed', (job, err) => {
  console.error(`[scoring] job ${job?.id} failed:`, err.message);
});

async function shutdown() {
  await scoringWorker.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
