import { Eye } from 'lucide-react';

/**
 * On every screen of a preview, not just the first.
 *
 * A manager who walks away and comes back to a timer counting down needs to
 * know, at a glance and without scrolling, that this is not a real session —
 * and a candidate must never see this component at all, which is why it is
 * rendered from the preview routes rather than from anything a link can reach.
 */
export function PreviewBanner() {
  return (
    <div className="mb-4 flex w-full max-w-2xl items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900">
      <Eye size={14} className="shrink-0" />
      PREVIEW — this is exactly what your candidate sees. Nothing here is recorded.
    </div>
  );
}
