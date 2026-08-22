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
  console.log(`[question-gen] job ${job.id} completed (finding ${job.data.findingId})`);
});
questionGenWorker.on('failed', (job, err) => {
  logErr('question-gen', `job ${job?.id}`, err);
});

// A crash can leave a checkout behind that the finally block never reached.
void sweepOrphanedWorkspaces();

async function shutdown() {
  await Promise.all([scoringWorker.close(), repoScanWorker.close(), questionGenWorker.close()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
