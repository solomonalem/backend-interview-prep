/**
 * The first balanced `{...}` in a model reply, or null.
 *
 * Tolerates the two things models actually do around JSON — wrapping it in a
 * code fence and prefacing it with a sentence — without tolerating a reply
 * that is only prose. Brace counting is string-aware so a `{` inside a value
 * (a path, a regex in a snippet) cannot unbalance it.
 *
 * Lives here rather than in a service because two different pipelines need it:
 * repo analysis and the document sufficiency check. Both talk to models that
 * reject assistant prefill, so pulling the object out of whatever came back is
 * the only way to make prose structurally survivable.
 */
export function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  return null; // unterminated — truncation, not prose
}
