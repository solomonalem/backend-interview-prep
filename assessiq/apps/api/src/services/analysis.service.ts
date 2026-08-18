import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ANALYSIS_MODEL, SYNTHESIS_MODEL, anthropic } from '../lib/claude.js';
import { AppError } from '../middleware/error.middleware.js';
import type { SelectedFile, StackProfile } from '../lib/repo-inventory.js';

// Layer 3 (design §5.4): the only part of the scan that uses a model, and it
// only ever sees the ~40 files Layer 2 chose.
//
// Two passes. Per-batch on Haiku, because reading a file and noting what it
// does is cheap work repeated many times. One synthesis on Sonnet, because
// turning fifty flat observations into the handful of things worth interviewing
// a candidate about is judgement.

/** Roughly a batch's worth of source. Small enough to stay well inside the
 *  model's budget with room for the response. */
const BATCH_BYTES = 45_000;
const MAX_BATCH_FILES = 8;

const ANALYSIS_MAX_TOKENS = 2_000;
const SYNTHESIS_MAX_TOKENS = 4_000;

/** Design §2.2: a citation may carry at most three lines, and none in strict mode. */
export const MAX_EXCERPT_LINES = 3;

export type FindingKind = 'stack' | 'pattern' | 'risk' | 'architecture' | 'domain';
const KINDS: FindingKind[] = ['stack', 'pattern', 'risk', 'architecture', 'domain'];

export interface DraftFinding {
  kind: FindingKind;
  title: string;
  detail: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  excerpt: string | null;
}

export interface AnalysisResult {
  findings: DraftFinding[];
  tokensUsed: number;
  filesAnalyzed: number;
  /** True when some batches failed — findings are real but incomplete (§5). */
  partial: boolean;
  /**
   * Why batches failed, when any did. Carried so a scan that produced nothing
   * can say what actually went wrong instead of reporting an empty success.
   */
  failureReason?: string;
}

// ── Strict mode (§2.5) ───────────────────────────────────────────────────────
// Structure only: imports, declarations, routes, schema shapes. Lower question
// specificity, higher privacy. Deliberately regex-based rather than a parser
// per language — the analyser is language-agnostic and so is this.
const STRUCTURAL = [
  /^\s*(import|from|require|use|include|using|package)\b.*/,
  /^\s*(export\s+)?(async\s+)?(function|class|interface|type|enum|struct|trait|impl)\s+[\w<>]+.*/,
  /^\s*(public|private|protected|static|func|def|fn|sub)\s+[\w<>]+.*/,
  /^\s*(model|table|CREATE TABLE|ALTER TABLE|CREATE INDEX)\b.*/i,
  /^\s*(app|router|r|route)\.(get|post|put|patch|delete|use)\s*\(.*/,
  /^\s*@\w+.*/, // decorators — often the whole story in Nest/Spring/Django
];

function structuralSummary(text: string): string {
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length > 200) continue;
    if (STRUCTURAL.some((re) => re.test(line))) kept.push(line.trim());
    if (kept.length >= 60) break;
  }
  return kept.join('\n');
}

/** Number every line so the model can cite ranges that mean something. */
function numbered(text: string): string {
  return text
    .split('\n')
    .map((l, i) => `${i + 1}| ${l}`)
    .join('\n');
}

// ── Claude plumbing, mirroring generation.service ────────────────────────────
function isTransient(err: unknown): boolean {
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };
  if (e?.name === 'APIConnectionError' || e?.name === 'APIConnectionTimeoutError') return true;
  const code = e?.code ?? e?.cause?.code;
  if (code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  return typeof e?.status === 'number' && (e.status === 429 || e.status >= 500);
}

interface Called<T> {
  data: T;
  tokens: number;
}

/** One retry, transient failures only. Truncation is named rather than left to
 *  surface as unterminated JSON several frames later. */
async function call<T>(
  model: string,
  maxTokens: number,
  system: string,
  user: string,
  label: string,
): Promise<Called<T>> {
  if (!anthropic) {
    throw new AppError(
      503,
      'ANALYSIS_UNAVAILABLE',
      'Repository analysis is not configured on this server (no ANTHROPIC_API_KEY).',
    );
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      });
      if (res.stop_reason === 'max_tokens') {
        throw new Error(`${label} truncated at max_tokens (${maxTokens})`);
      }
      const block = res.content[0];
      if (!block || block.type !== 'text') throw new Error('unexpected response type');
      const text = block.text.replace(/```json|```/g, '').trim();
      return {
        data: JSON.parse(text) as T,
        tokens: (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0),
      };
    } catch (err) {
      const retrying = attempt === 1 && isTransient(err);
      // Message only — an error carrying a response body could echo source.
      console.error(
        `[scan:${label}] attempt ${attempt}/2 failed` + (retrying ? ', retrying' : ', giving up') +
          `: ${(err as Error).message}`,
      );
      if (!retrying) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${label} failed`);
}

/**
 * Turn a provider failure into a sentence a manager can act on.
 *
 * The raw message is a JSON blob from the API, and putting it in `RepoScan.error`
 * both reads badly and risks carrying whatever else the provider chose to echo
 * back. Classify the cases that have a real remedy and summarise the rest.
 */
function classify(err: unknown): string {
  const e = err as { status?: number; message?: string };
  const msg = e?.message ?? '';
  if (/credit balance is too low|insufficient.*credit|billing/i.test(msg)) {
    return 'the Anthropic account has no remaining credit — top it up and re-scan';
  }
  if (e?.status === 401 || /invalid x-api-key|authentication/i.test(msg)) {
    return 'the Anthropic API key was rejected';
  }
  if (e?.status === 429 || /rate.?limit/i.test(msg)) {
    return 'the Anthropic API rate limit was reached — try again shortly';
  }
  if (/truncated at max_tokens/i.test(msg)) return 'a response exceeded the token budget';
  if (/timed out|timeout/i.test(msg)) return 'the analysis request timed out';
  return 'the analyser did not return a usable response';
}

// ── Pass 1: per-batch observations ───────────────────────────────────────────
interface RawObservation {
  file_path: string;
  observation: string;
  line_start?: number;
  line_end?: number;
}

const OBSERVE_SYSTEM = `You read source files and report what they reveal about how a system is built.

You are language-agnostic: reason from what the code does, not from familiarity with the framework.

For each file, report AT MOST 2 observations, and only if genuinely notable. Prefer:
- architectural decisions (how components talk, where state lives, transactional boundaries)
- patterns worth interviewing on (outbox, idempotency keys, optimistic concurrency, retries, caching, queue semantics)
- risks (unbounded queries, missing error paths, race conditions, auth gaps, N+1s)
- domain concepts the code encodes (what business this is, what the entities mean)

Skip the boring: imports, boilerplate, config plumbing, formatting, style.

Write each observation as ONE sentence about the code — never quote the code itself.
Cite the tightest line range that supports it.

Return ONLY JSON:
{"observations":[{"file_path":"...","observation":"...","line_start":1,"line_end":12}]}
Empty array if nothing in the batch is notable.`;

function batches(files: SelectedFile[]): SelectedFile[][] {
  const out: SelectedFile[][] = [];
  let cur: SelectedFile[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length && (size + f.bytes > BATCH_BYTES || cur.length >= MAX_BATCH_FILES)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += f.bytes;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── Pass 2: synthesis ────────────────────────────────────────────────────────
const SYNTH_SYSTEM = `You turn observations about a codebase into findings an interviewer can build questions from.

You will get a stack profile and a list of observations with file citations.

Produce 6-12 findings. Each must be something a senior engineer on this team would recognise as true of THIS system, and that a candidate could be asked to reason about. Merge related observations; drop anything trivial or generic.

kind must be one of:
  stack        - what the system is built on, where that constrains design
  architecture - how the pieces fit and communicate
  pattern      - a deliberate technique in use (outbox, idempotency, CQRS, caching...)
  risk         - something that will bite under load, failure or concurrency
  domain       - what the business is and what the entities mean

title: a short noun phrase naming the thing, e.g. "Outbox table in order-service"
detail: 1-3 sentences describing what is true and why it matters. Describe the
        code; never reproduce it.
Carry through the most representative citation (file_path + line range) where one exists.

Return ONLY JSON:
{"findings":[{"kind":"pattern","title":"...","detail":"...","file_path":"...","line_start":1,"line_end":20}]}`;

interface RawFinding {
  kind?: string;
  title?: string;
  detail?: string;
  file_path?: string | null;
  line_start?: number | null;
  line_end?: number | null;
}

/** Read the cited lines back off disk. The model is never asked to quote code —
 *  quoting it would put source in the prompt AND the response. Capped hard. */
async function excerptFor(
  root: string,
  filePath: string | null,
  start: number | null,
  end: number | null,
  strict: boolean,
): Promise<string | null> {
  if (strict || !filePath || !start) return null;
  try {
    const text = await readFile(join(root, filePath), 'utf8');
    const lines = text.split('\n');
    const from = Math.max(1, start);
    const to = Math.min(lines.length, Math.max(from, end ?? from), from + MAX_EXCERPT_LINES - 1);
    const slice = lines.slice(from - 1, to);
    if (!slice.length) return null;
    // Long minified lines are not a citation, they are a payload.
    return slice.map((l) => (l.length > 200 ? `${l.slice(0, 200)}…` : l)).join('\n');
  } catch {
    return null;
  }
}

export async function analyzeRepo(opts: {
  root: string;
  files: SelectedFile[];
  stack: StackProfile;
  strictMode: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<AnalysisResult> {
  const { root, files, stack, strictMode } = opts;
  const groups = batches(files);
  const observations: RawObservation[] = [];
  let tokensUsed = 0;
  let filesAnalyzed = 0;
  let failedBatches = 0;
  let batchesRun = 0;
  let lastFailure: string | undefined;

  for (const [i, group] of groups.entries()) {
    const parts: string[] = [];
    for (const f of group) {
      try {
        const raw = await readFile(join(root, f.path), 'utf8');
        const body = strictMode ? structuralSummary(raw) : numbered(raw);
        if (!body.trim()) continue;
        parts.push(`=== ${f.path} ===\n${body}`);
        filesAnalyzed++;
      } catch {
        /* unreadable file — skip it, not a scan failure */
      }
    }
    if (!parts.length) continue;
    batchesRun++;

    try {
      const { data, tokens } = await call<{ observations?: RawObservation[] }>(
        ANALYSIS_MODEL,
        ANALYSIS_MAX_TOKENS,
        OBSERVE_SYSTEM,
        `Stack: ${stack.stack.join(', ') || 'unknown'}${
          stack.libraries.length ? ` (${stack.libraries.join(', ')})` : ''
        }\n\n${parts.join('\n\n')}`,
        `observe:${i + 1}/${groups.length}`,
      );
      tokensUsed += tokens;
      for (const o of data.observations ?? []) {
        if (o?.file_path && o?.observation) observations.push(o);
      }
    } catch (err) {
      // Design §5: keep what completed, label the scan partial. A batch that
      // fails costs coverage, not the whole scan — unless they ALL fail, which
      // the caller turns into an outright failure rather than an empty success.
      failedBatches++;
      lastFailure = classify(err);
    }
    opts.onProgress?.(i + 1, groups.length);
  }

  if (!observations.length) {
    // Nothing to synthesise from. Genuinely thin repositories land here too, so
    // the distinction that matters is whether anything actually ran: every
    // batch failing is a failure, not an empty result.
    return {
      findings: [],
      tokensUsed,
      filesAnalyzed,
      partial: failedBatches > 0,
      ...(failedBatches > 0 && failedBatches === batchesRun
        ? { failureReason: lastFailure ?? 'every analysis batch failed' }
        : {}),
    };
  }

  const synthUser = [
    `Stack: ${stack.stack.join(', ') || 'unknown'}`,
    stack.libraries.length ? `Libraries: ${stack.libraries.join(', ')}` : '',
    '',
    'Observations:',
    ...observations.map(
      (o) =>
        `- ${o.file_path}${o.line_start ? `:${o.line_start}-${o.line_end ?? o.line_start}` : ''} — ${o.observation}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  let raw: RawFinding[] = [];
  try {
    const { data, tokens } = await call<{ findings?: RawFinding[] }>(
      SYNTHESIS_MODEL,
      SYNTHESIS_MAX_TOKENS,
      SYNTH_SYSTEM,
      synthUser,
      'synthesise',
    );
    tokensUsed += tokens;
    raw = data.findings ?? [];
  } catch (err) {
    throw new AppError(
      502,
      'ANALYSIS_FAILED',
      `The analyser did not return usable findings: ${(err as Error).message}`,
    );
  }

  const findings: DraftFinding[] = [];
  for (const f of raw) {
    if (!f?.title || !f?.detail) continue;
    const kind = KINDS.includes(f.kind as FindingKind) ? (f.kind as FindingKind) : 'architecture';
    // Only cite a file the selection actually contained — the model must not
    // invent a path, and a citation that doesn't resolve is worse than none.
    const cited = f.file_path && files.some((s) => s.path === f.file_path) ? f.file_path : null;
    const start = cited ? (f.line_start ?? null) : null;
    const end = cited ? (f.line_end ?? null) : null;
    findings.push({
      kind,
      title: f.title.slice(0, 200),
      detail: f.detail.slice(0, 1_000),
      file_path: cited,
      line_start: start,
      line_end: end,
      excerpt: await excerptFor(root, cited, start, end, strictMode),
    });
  }

  return {
    findings,
    tokensUsed,
    filesAnalyzed,
    partial: failedBatches > 0,
    ...(failedBatches > 0 ? { failureReason: lastFailure } : {}),
  };
}
