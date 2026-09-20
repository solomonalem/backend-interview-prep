import { SNIPPET_MAX_CHARS, isSnippetLanguage } from '@assessiq/types';

/**
 * Server-side handling of the code sketch attached to an answer.
 *
 * ONE THING THIS FILE DOES NOT DO, and never will: run any of it. A sketch is
 * text that a language model reads. There is no sandbox, no runtime, no
 * compile check and no test harness behind any of these functions — that is
 * HackerRank's product, not this one, and the judgement we want ("what does
 * this code reveal about how they think?") is the scorer's job.
 */

export interface StoredSnippet {
  code: string | null;
  language: string | null;
}

/**
 * What actually goes in the two columns.
 *
 * Empty, whitespace-only, or absent all collapse to null/null: "attached
 * nothing" and "attached a box full of spaces" are the same fact, and storing
 * the second as an empty string would make every later `snippet_code !== null`
 * check quietly wrong. The language follows the code — it is a property of the
 * sketch, not a setting that outlives it.
 *
 * The cap is re-applied here as well as in the route schema. Not belt and
 * braces for its own sake: this is the last point before a write, and a column
 * whose contents can only have come through this function is one fewer thing
 * to reason about.
 */
export function normalizeSnippet(
  code?: string | null,
  language?: string | null,
): StoredSnippet {
  const trimmed = (code ?? '').trim();
  if (trimmed.length === 0) return { code: null, language: null };
  return {
    code: trimmed.slice(0, SNIPPET_MAX_CHARS),
    // An unrecognised language is dropped rather than rejected at this depth —
    // the route already refused anything off the list, so reaching here with
    // one means a caller we control passed something odd, and losing the
    // highlight hint is a better outcome than losing the sketch.
    language: isSnippetLanguage(language) ? language : 'auto',
  };
}

/**
 * The answer as a model should see it: the prose, then the sketch in a clearly
 * delimited block that says what it is.
 *
 * Used by the scorer, by the defense scorer, and by probe generation, so all
 * three are reading the same artifact. If they diverged, a probe could quote a
 * line of code the scorer never saw.
 */
export function answerWithSnippet(
  text: string,
  code: string | null,
  language: string | null,
): string {
  if (!code) return text;
  const named = isSnippetLanguage(language) && language !== 'auto' ? language : 'unspecified';
  return `${text}\n\n${SNIPPET_MARKER_PREFIX}${named}]\n${code}`;
}

const SNIPPET_MARKER_PREFIX = '[Candidate attached a code sketch — ';
const SNIPPET_MARKER_RE = /^\[Candidate attached a code sketch — .*\]$/m;

/**
 * The composed answer with OUR scaffolding line removed.
 *
 * Only one caller needs this: the probe generator refuses to write a follow-up
 * when there is too little to quote, and that measurement has to be of what the
 * candidate wrote. Counting the marker line would let ~45 characters of our own
 * text push a near-empty answer past the threshold.
 */
export function withoutSnippetMarker(text: string): string {
  return text.replace(SNIPPET_MARKER_RE, '');
}
