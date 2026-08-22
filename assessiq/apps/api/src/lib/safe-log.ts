/**
 * Logging that cannot leak repository content (design §2.2: "Scan logs must not
 * contain file contents").
 *
 * The existing scan paths already log only `err.message`, and a sweep of real
 * scan logs found no source. The risk is not those paths — it is the ones
 * nobody wrote deliberately: a rethrown Prisma error carrying the row it failed
 * to insert (which for a finding includes `excerpt`), or an SDK error whose
 * message embeds a response body. Those reach `console.error(err)` and print
 * whatever they hold.
 *
 * So this allowlists what may be logged rather than trying to detect source in
 * a string. An error becomes four known fields, and the message is collapsed to
 * one line and truncated — a multi-line message is the signature of embedded
 * content, not of a description.
 */

const MAX_MESSAGE = 300;

export interface SafeError {
  name: string;
  message: string;
  code?: string;
  status?: number;
}

/**
 * Reduce any thrown value to something safe to print. Deliberately drops
 * `stack`, `cause`, `meta` and every other field — Prisma puts the offending
 * values in `meta`, and a stack can carry an inlined source frame.
 */
export function safeErr(err: unknown): SafeError {
  if (typeof err !== 'object' || err === null) {
    return { name: 'Error', message: oneLine(String(err)) };
  }
  const e = err as { name?: string; message?: string; code?: string; status?: number };
  return {
    name: typeof e.name === 'string' ? e.name.slice(0, 60) : 'Error',
    message: oneLine(typeof e.message === 'string' ? e.message : ''),
    ...(typeof e.code === 'string' ? { code: e.code.slice(0, 40) } : {}),
    ...(typeof e.status === 'number' ? { status: e.status } : {}),
  };
}

/** Collapse to a single line and cap it. Newlines are how code gets in. */
function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_MESSAGE ? `${flat.slice(0, MAX_MESSAGE)}…[truncated]` : flat;
}

/** `[scope] context — name: message` on one line, with nothing else attached. */
export function logErr(scope: string, context: string, err: unknown): void {
  const s = safeErr(err);
  const bits = [s.name, s.code, s.status !== undefined ? `HTTP ${s.status}` : null]
    .filter(Boolean)
    .join(' ');
  console.error(`[${scope}] ${context} — ${bits}: ${s.message}`);
}
