import { useEffect, useRef } from 'react';

/**
 * Keeps a screen current without a manual reload.
 *
 * Candidate progress happens on someone else's machine, so an interviewer
 * watching a dashboard has no event to react to — the only options are polling
 * or refetching when they come back to the tab. This does both.
 *
 * Polling is paused while the tab is hidden: a background tab has nobody
 * looking at it, and there is no point spending requests on it. Coming back to
 * the tab triggers an immediate refetch, which is also the case that matters
 * most (you sent a link, switched away, and came back to check).
 */
export function useLiveRefresh(
  refetch: () => void | Promise<void>,
  { intervalMs = 15_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
) {
  // Held in a ref so a caller passing an inline closure doesn't restart the
  // timer on every render.
  const cb = useRef(refetch);
  cb.current = refetch;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (document.visibilityState === 'visible') void cb.current();
    };

    const id = setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void cb.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs, enabled]);
}
