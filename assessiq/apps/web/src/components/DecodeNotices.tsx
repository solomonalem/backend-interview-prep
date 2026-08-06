import { SearchX, TriangleAlert } from 'lucide-react';
import { Card, EmptyState } from './ui';

/**
 * Shown when a decode came back `matched: false` — the JD does not overlap the
 * question bank. Deliberately explicit: the alternative is a table of grey
 * "Low" rows that reads as a broken screen.
 */
export function NoMatchNotice({
  detectedDomain,
  action = 'Try a tech role like backend engineering.',
}: {
  detectedDomain?: string | null;
  /** Trailing sentence — differs between the job-seeker screen and the builder. */
  action?: string;
}) {
  // Name the discipline when the decoder identified one. Saying "this looks
  // like a civil engineering role" is far more useful than a generic no-match,
  // and it makes the scope limit legible rather than looking like a failure.
  const hint = detectedDomain
    ? `AssessIQ currently supports technology and IT roles only. This looks like a ${detectedDomain} role, which we don't cover yet. ${action}`
    : `AssessIQ currently supports technology and IT roles only — we couldn't map this to a role we cover. ${action}`;

  return (
    <Card className="animate-fade-in">
      <EmptyState icon={<SearchX size={22} />} title="Outside what AssessIQ covers" hint={hint} />
    </Card>
  );
}

/**
 * Shown when `source === 'heuristic'` — the AI call failed and a keyword match
 * answered instead. A degraded result must never look like a real one.
 */
export function HeuristicNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <TriangleAlert size={15} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-medium">AI unavailable — approximate match.</span> These topics came
        from keyword matching, so they may be less accurate than usual.
      </span>
    </div>
  );
}
