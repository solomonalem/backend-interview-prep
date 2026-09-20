/**
 * The code sketch a candidate can attach to any answer.
 *
 * SINGLE SOURCE OF TRUTH for both apps: the dropdown the candidate picks from,
 * the values the server will accept, and the labels the report prints are all
 * derived from this one list. A language that is offered but rejected — or
 * stored but unhighlightable — is the failure mode this module exists to
 * prevent.
 *
 * STRATEGIC BOUNDARY, recorded here because this is the file someone will read
 * first when they wonder how far this goes: a sketch is READ, never RUN. There
 * is no execution, no sandbox, no runtime, no test case, and none of those is
 * a missing piece of this feature. Claude reads code natively; judging what a
 * sketch reveals is the scorer's job.
 */

export const SNIPPET_LANGUAGES = [
  'auto',
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'java',
  'csharp',
  'go',
  'rust',
  'ruby',
  'php',
  'sql',
  'bash',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'html',
  'css',
  'yaml',
  'json',
] as const;

export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

/**
 * The default. Nothing is pinned: the report's highlighter detects what it can
 * and labels the block generically. Chosen as the default because a candidate
 * under a clock should not have to classify their own code before they can
 * type it.
 */
export const SNIPPET_DEFAULT_LANGUAGE: SnippetLanguage = 'auto';

/**
 * Enforced on BOTH sides — the client so the limit is visible while typing,
 * the server because a client-side cap is a courtesy rather than a rule.
 */
export const SNIPPET_MAX_CHARS = 5000;

/** Display names. `auto` has no language to name, so the block is just "Code". */
export const SNIPPET_LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  auto: 'Code',
  plaintext: 'Plain text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  sql: 'SQL',
  bash: 'Bash',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  json: 'JSON',
};

export function isSnippetLanguage(value: unknown): value is SnippetLanguage {
  return typeof value === 'string' && (SNIPPET_LANGUAGES as readonly string[]).includes(value);
}

/** The label a report prints above the block. */
export function snippetLanguageLabel(language: string | null): string {
  return isSnippetLanguage(language) ? SNIPPET_LANGUAGE_LABELS[language] : 'Code';
}
