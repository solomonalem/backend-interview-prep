import { SearchX, TriangleAlert } from 'lucide-react';
import { Card, EmptyState } from './ui';

/**
 * Shown when a decode came back `matched: false` — the JD does not overlap the
 * question bank. Deliberately explicit: the alternative is a table of grey
 * "Low" rows that reads as a broken screen.
 */
export function NoMatchNotice({ hint }: { hint?: string }) {
  return (
    <Card className="animate-fade-in">
      <EmptyState
        icon={<SearchX size={22} />}
        title="This job description doesn't overlap our question bank yet"
        hint={
          hint ??
          "We couldn't map it to any topic we have questions for. Try a backend-engineering role, or check back as the bank grows."
        }
      />
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
