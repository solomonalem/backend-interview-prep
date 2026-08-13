import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';

// Layers 1 and 2 of the scan (design §5): work out what the repo is and which
// few files are worth an LLM's attention. Both are plain code — no AI, no
// network. The point is that the model reads ~40 files, never the repository.

/** Design §5.3 cap. A sample, not an audit — tunable, and reported in stats. */
export const MAX_SELECTED_FILES = 40;

/** Beyond this a "source file" is generated, vendored, or minified. */
const MAX_FILE_BYTES = 120 * 1024;

/** Directory names that never carry signal about how a team builds things. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', '__pycache__', '.mypy_cache',
  '.pytest_cache', '.gradle', '.idea', '.vscode', 'coverage', '.turbo', '.cache',
  'Pods', 'DerivedData', 'site-packages', '.terraform', 'migrations_backup',
]);

/** Binaries, media, and anything whose bytes mean nothing to a reader. */
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.bmp',
  '.mp4', '.mov', '.mp3', '.wav', '.pdf', '.zip', '.gz', '.tar', '.bz2', '.7z',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.map', '.min.js', '.min.css',
  '.so', '.dylib', '.dll', '.exe', '.class', '.jar', '.wasm', '.bin', '.db',
  '.sqlite', '.pyc', '.lock', '.snap', '.pem', '.key', '.crt',
]);

/** Lockfiles: enormous, generated, and say nothing a manifest doesn't. */
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Gemfile.lock',
  'poetry.lock', 'Pipfile.lock', 'composer.lock', 'Cargo.lock', 'go.sum',
  'gradle.lockfile', 'migration_lock.toml', '.DS_Store',
]);

/**
 * At most this many files from any one directory. Without it a directory of
 * near-identical files — twelve migrations, twenty route handlers — eats the
 * whole budget and the sample stops representing the system. Breadth beats
 * depth when you only get 40 files.
 */
const MAX_PER_DIR = 4;

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.py', '.rb', '.php',
  '.java', '.kt', '.scala', '.rs', '.cs', '.swift', '.ex', '.exs', '.erl',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.sql', '.graphql', '.proto', '.prisma',
  '.tf', '.yaml', '.yml', '.json', '.toml', '.sh',
]);

// ── Layer 1: stack detection from manifests (design §5.2) ────────────────────
// Filename → what its presence proves. This is what makes the feature
// stack-agnostic: the manifest, not the language, is the tell.
const MANIFESTS: Record<string, string> = {
  'package.json': 'Node.js',
  'go.mod': 'Go',
  'requirements.txt': 'Python',
  'pyproject.toml': 'Python',
  'Pipfile': 'Python',
  'pom.xml': 'Java (Maven)',
  'build.gradle': 'Java/Kotlin (Gradle)',
  'build.gradle.kts': 'Java/Kotlin (Gradle)',
  'Cargo.toml': 'Rust',
  'Gemfile': 'Ruby',
  'composer.json': 'PHP',
  'mix.exs': 'Elixir',
  'pubspec.yaml': 'Dart/Flutter',
  Dockerfile: 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'schema.prisma': 'Prisma ORM',
  'serverless.yml': 'Serverless',
  'Chart.yaml': 'Helm',
};

/**
 * Dependency names worth naming in the stack profile. Matched as substrings of
 * a manifest's dependency keys, so "@nestjs/core" hits "nestjs". Deliberately
 * short: this labels the architecture, it does not inventory the lockfile.
 */
const NOTABLE_DEPS = [
  'express', 'fastify', 'nestjs', 'koa', 'hapi', 'next', 'react', 'vue', 'svelte',
  'angular', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'knex', 'drizzle',
  'graphql', 'apollo', 'trpc', 'socket.io', 'bullmq', 'bull', 'kafkajs', 'amqplib',
  'redis', 'ioredis', 'pg', 'mysql', 'mongodb', 'elasticsearch', 'opensearch',
  'stripe', 'aws-sdk', '@aws-sdk', 'firebase', 'supabase', 'passport', 'jsonwebtoken',
  'django', 'flask', 'fastapi', 'celery', 'sqlalchemy', 'pydantic',
  'rails', 'sinatra', 'sidekiq', 'gin-gonic', 'echo', 'fiber', 'gorm', 'spring',
];

export interface StackProfile {
  /** Human labels, e.g. ["Node.js", "Docker", "Prisma ORM"]. */
  stack: string[];
  /** Notable libraries found in manifests, e.g. ["express", "bullmq"]. */
  libraries: string[];
  /** Manifest paths that produced the above — citations for a stack finding. */
  manifests: string[];
}

/**
 * Manifests that actually declare dependencies. Others (schema.prisma,
 * Dockerfile, Chart.yaml) are recognised for the stack label only — sweeping
 * them for library names reads prose and comments as dependencies, which is
 * how a Postgres repo ends up reporting "mongodb" because the word appears in
 * a comment. A wrong stack profile produces a wrong question, so this is
 * narrow on purpose.
 */
const DEP_MANIFESTS = new Set([
  'package.json', 'composer.json', 'go.mod', 'requirements.txt', 'Pipfile',
  'pyproject.toml', 'Gemfile', 'Cargo.toml', 'build.gradle', 'build.gradle.kts',
  'pom.xml', 'mix.exs', 'pubspec.yaml',
]);

/** Pull dependency names out of whichever manifest format this is. */
function depsFromManifest(name: string, text: string): string[] {
  if (!DEP_MANIFESTS.has(name)) return [];
  try {
    if (name === 'package.json' || name === 'composer.json') {
      const j = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
      return [
        ...Object.keys(j.dependencies ?? {}),
        ...Object.keys(j.devDependencies ?? {}),
        ...Object.keys(j.require ?? {}),
      ];
    }
    // go.mod / requirements.txt / Gemfile / Cargo.toml / pyproject.toml are all
    // line-oriented enough that a token sweep beats a real parser here — we
    // only need to know which names appear, not their versions or constraints.
    return text
      .split('\n')
      .slice(0, 400)
      .flatMap((l) => l.match(/[\w@/.-]{3,}/g) ?? []);
  } catch {
    return []; // malformed manifest is not a scan failure
  }
}

/**
 * Build the stack profile from manifest paths the inventory walk already found.
 *
 * This used to walk the tree itself, depth-capped at 2 — which silently missed
 * everything in a monorepo, where the real manifests live at apps/api/… and the
 * schema deeper still. Reusing the full walk costs nothing and cannot miss.
 */
export async function detectStack(root: string, manifestPaths: string[]): Promise<StackProfile> {
  const stack = new Set<string>();
  const libraries = new Set<string>();
  const manifests: string[] = [];

  for (const rel of manifestPaths) {
    const name = basename(rel);
    if (name === 'workflows') {
      stack.add('GitHub Actions CI');
      manifests.push(rel);
      continue;
    }
    const label = MANIFESTS[name];
    if (!label) continue;
    stack.add(label);
    manifests.push(rel);
    try {
      const text = await readFile(join(root, rel), 'utf8');
      for (const d of depsFromManifest(name, text)) {
        const hit = NOTABLE_DEPS.find((n) => d.toLowerCase().includes(n));
        if (hit) libraries.add(hit);
      }
    } catch {
      /* unreadable manifest — the label alone still stands */
    }
  }

  return {
    stack: [...stack].sort(),
    libraries: [...libraries].sort(),
    manifests: manifests.slice(0, 12),
  };
}

// ── Layer 2: which files are worth reading (design §5.3) ─────────────────────
// Path and filename conventions are near-universal across languages, so this
// ranks without knowing the language. Higher score = more likely to reveal how
// the system is actually put together.
const SIGNALS: { pattern: RegExp; weight: number; why: string }[] = [
  { pattern: /(^|\/)(services?|domain|usecases?)\//i, weight: 6, why: 'service layer' },
  { pattern: /(^|\/)(handlers?|controllers?|routes?|endpoints?)\//i, weight: 5, why: 'entry points' },
  // `api/` is as often a package name (apps/api/…) as a routing directory, and
  // as a package name it tags an entire workspace. Kept, but weak enough that
  // it cannot by itself lift a file into the selection.
  { pattern: /(^|\/)api\//i, weight: 2, why: 'api package' },
  { pattern: /(^|\/)(workers?|jobs?|queues?|consumers?|tasks?)\//i, weight: 6, why: 'async work' },
  { pattern: /(^|\/)(db|database|repositories|models?|entities|store)\//i, weight: 5, why: 'persistence' },
  { pattern: /migrations?/i, weight: 5, why: 'schema evolution' },
  { pattern: /schema|\.prisma$|\.sql$/i, weight: 5, why: 'data model' },
  { pattern: /auth|session|token|permission|rbac/i, weight: 5, why: 'authorisation' },
  { pattern: /payment|billing|invoice|checkout|ledger|order/i, weight: 5, why: 'money paths' },
  { pattern: /(^|\/)(middleware|interceptors?)\//i, weight: 3, why: 'cross-cutting' },
  { pattern: /config|settings|env/i, weight: 2, why: 'configuration' },
  // \block\b rather than `lock` — the bare substring matched migration_lock,
  // lockfile, and every other incidental use of the word.
  { pattern: /cache|redis|\block(s|ing)?\b|idempoten|retry|circuit/i, weight: 4, why: 'reliability' },
  { pattern: /kafka|rabbit|sqs|pubsub|event|outbox/i, weight: 5, why: 'messaging' },
  { pattern: /(^|\/)(lib|utils?|helpers?|common)\//i, weight: 1, why: 'shared code' },
  { pattern: /\.(test|spec)\.|(^|\/)(tests?|__tests__|e2e)\//i, weight: -4, why: 'test' },
  { pattern: /(^|\/)(docs?|examples?|samples?|fixtures?|mocks?|seeds?)\//i, weight: -3, why: 'not production' },
  { pattern: /(^|\/)(styles?|assets?|public|static|locales?|i18n)\//i, weight: -4, why: 'presentation' },
  { pattern: /\.d\.ts$|\.generated\.|_pb\.|\.pb\./i, weight: -6, why: 'generated' },
];

export interface SelectedFile {
  /** Repo-relative, POSIX-style — this becomes a citation. */
  path: string;
  bytes: number;
  score: number;
  /** Which signals matched, for explaining the selection in stats. */
  reasons: string[];
}

export interface Inventory {
  filesSeen: number;
  selected: SelectedFile[];
  /** Every manifest found anywhere in the tree — feeds detectStack. */
  manifestPaths: string[];
}

/**
 * The bucket a file counts against for the per-directory cap.
 *
 * Normally its directory. But every migration tool gives each migration its own
 * timestamped folder — prisma/migrations/20260801191031_init/migration.sql —
 * so a plain directory key sees twelve directories of one file each and the cap
 * never bites. Timestamped folders therefore count against their parent, which
 * is what a human means by "the migrations".
 */
function groupOf(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length < 2) return '.';
  const parent = parts[parts.length - 2] ?? '';
  if (/^\d{6,}[_-]/.test(parent) || /^v?\d+[_.]/.test(parent)) {
    return parts.slice(0, -2).join('/') || '.';
  }
  return parts.slice(0, -1).join('/');
}

function scoreOf(relPath: string): { score: number; reasons: string[] } {
  const p = relPath.split(sep).join('/');
  let score = 0;
  const reasons: string[] = [];
  for (const s of SIGNALS) {
    if (s.pattern.test(p)) {
      score += s.weight;
      if (s.weight > 0) reasons.push(s.why);
    }
  }
  // A README is worth one slot: it usually states the domain in prose, which is
  // exactly the "domain" finding kind and is cheap to read.
  if (/^readme(\.md)?$/i.test(basename(p))) {
    score += 4;
    reasons.push('project overview');
  }
  // Shallow files tend to be entry points; deeply nested ones tend to be detail.
  score -= Math.max(0, p.split('/').length - 4);
  return { score, reasons };
}

/**
 * Walk the tree, drop what cannot carry signal, rank the rest, take the top N.
 * Returns the total seen as well, so stats can say "40 of 1,340".
 */
export async function inventory(
  root: string,
  cap = MAX_SELECTED_FILES,
): Promise<Inventory> {
  const candidates: SelectedFile[] = [];
  const manifestPaths: string[] = [];
  let filesSeen = 0;

  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) continue; // never follow links out of the workspace
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name === 'workflows' && basename(dir) === '.github') {
          manifestPaths.push(relative(root, full).split(sep).join('/'));
          continue; // the directory's existence is the signal; its YAML isn't
        }
        if (e.name.startsWith('.') && e.name !== '.github') continue;
        await walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      filesSeen++;

      if (MANIFESTS[e.name]) manifestPaths.push(relative(root, full).split(sep).join('/'));

      if (SKIP_FILES.has(e.name)) continue;
      const ext = extname(e.name).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;
      const isCode = CODE_EXT.has(ext);
      const isDoc = /^readme(\.md)?$/i.test(e.name);
      if (!isCode && !isDoc && !MANIFESTS[e.name]) continue;

      let size = 0;
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }
      if (size === 0 || size > MAX_FILE_BYTES) continue;

      const rel = relative(root, full).split(sep).join('/');
      const { score, reasons } = scoreOf(rel);
      candidates.push({ path: rel, bytes: size, score, reasons });
    }
  };

  await walk(root);

  // Highest signal first; ties broken by shorter path, which favours the
  // top-level file over a variant buried three directories down.
  candidates.sort((a, b) => b.score - a.score || a.path.length - b.path.length);

  // Take in score order but cap per directory, then backfill from what the cap
  // displaced. The result is the same budget spread across more of the system.
  const perDir = new Map<string, number>();
  const selected: SelectedFile[] = [];
  const displaced: SelectedFile[] = [];
  for (const f of candidates) {
    if (selected.length >= cap) break;
    const n = perDir.get(groupOf(f.path)) ?? 0;
    if (n >= MAX_PER_DIR) {
      displaced.push(f);
      continue;
    }
    perDir.set(groupOf(f.path), n + 1);
    selected.push(f);
  }
  for (const f of displaced) {
    if (selected.length >= cap) break;
    selected.push(f);
  }

  return { filesSeen, selected, manifestPaths };
}
