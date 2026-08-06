import { Check, Plus } from 'lucide-react';
import type { QuestionListItem, QuestionMatchKey } from '@assessiq/types';
import { Badge, Card, difficultyTone } from './ui';
import { cn } from '../lib/cn';

// Human labels for match keys — the API speaks in column names, the manager
// should not have to.
const MATCH_LABEL: Record<QuestionMatchKey, string> = {
  topic: 'topic',
  difficulty: 'seniority',
  type: 'type',
};

export function MatchHint({ matchedOn }: { matchedOn: QuestionMatchKey[] }) {
  if (matchedOn.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-slate-400">
      matches: {matchedOn.map((k) => MATCH_LABEL[k]).join(' + ')}
      {matchedOn.length === 3 && <span className="ml-1.5 text-brand-600">· full match</span>}
    </p>
  );
}

/**
 * One question in a selectable list. `selected` drives the visual state; the
 * parent owns selection, so this component never auto-selects anything.
 */
export function QuestionCard({
  question,
  selected,
  onToggle,
  matchedOn,
}: {
  question: QuestionListItem;
  selected: boolean;
  onToggle: (id: string) => void;
  matchedOn?: QuestionMatchKey[];
}) {
  return (
    <Card
      hover={!selected}
      className={cn('transition-shadow', selected && 'ring-2 ring-brand-300 shadow-glow')}
    >
      <button
        type="button"
        onClick={() => onToggle(question.id)}
        aria-pressed={selected}
        className="w-full text-left px-5 py-4 flex items-start gap-4"
      >
        <span
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
            selected ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 bg-white',
          )}
        >
          {selected ? <Check size={13} strokeWidth={3} /> : <Plus size={13} className="text-slate-400" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-slate-800 leading-snug">{question.text}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge tone="brand">{question.topic}</Badge>
            <Badge tone={difficultyTone[question.difficulty] ?? 'slate'}>{question.difficulty}</Badge>
            <Badge tone="slate">{question.type}</Badge>
            {question.domain && <Badge tone="violet">{question.domain}</Badge>}
          </div>
          {matchedOn && <MatchHint matchedOn={matchedOn} />}
        </div>
      </button>
    </Card>
  );
}
