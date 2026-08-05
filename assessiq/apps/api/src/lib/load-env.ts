import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Loads apps/api/.env into process.env (only keys not already set). Zero deps.
// MUST be the first import in each entry point, before any module that reads
// process.env at load time (e.g. lib/claude.ts reads ANTHROPIC_API_KEY eagerly).
// The api npm scripts (dev, dev:worker, db:*) all run with cwd = apps/api.
try {
  const content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // No .env file — rely on the real environment.
}
