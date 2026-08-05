import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  BookOpen,
  Target,
  ShieldAlert,
  X,
  Check,
  Minus,
  RotateCcw,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import type { StudyDeckItem, StudyRating } from '@assessiq/types';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  CardBody,
  PageHeader,
  ProgressBar,
  ScoreRing,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

export default function StudyModePage() {
  const [deck, setDeck] = useState<StudyDeckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Record<StudyRating, number>>({
    missed: 0,
    partial: 0,
    got_it: 0,
  });
  const [done, setDone] = useState(false);

  function loadDeck() {
    let alive = true;
    setLoading(true);
    setError(null);
    studyApi
      .deck()
      .then((r) => {
        if (alive) setDeck(r.due_today);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof ApiRequestError ? e.message : 'Could not load your deck. Please try again.',
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }

  useEffect(loadDeck, []);

  function reset() {
    setIndex(0);
    setRevealed(false);
    setDone(false);
    setTally({ missed: 0, partial: 0, got_it: 0 });
    loadDeck();
  }

  function rate(r: StudyRating) {
    const card = deck[index];
    if (card) {
      // Fire-and-advance — record in the background, ignore transient failures.
      void studyApi.recordProgress(card.question.id, r).catch(() => {});
    }
    setTally((t) => ({ ...t, [r]: t[r] + 1 }));
    if (index + 1 >= deck.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Today's review" subtitle="Spaced-repetition flashcards from the question bank." />
        <Card>
          <CardBody className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
            <Spinner /> Building your deck…
          </CardBody>
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Today's review" subtitle="Spaced-repetition flashcards from the question bank." />
        <Card>
          <EmptyState icon={<AlertTriangle size={22} />} title="Couldn't load your deck" hint={error} />
          <CardBody className="flex justify-center pb-8 pt-0">
            <Button variant="secondary" onClick={loadDeck}>
              <RotateCcw size={16} /> Try again
            </Button>
          </CardBody>
        </Card>
      </>
    );
  }

  if (deck.length === 0) {
    return (
      <>
        <PageHeader title="Today's review" subtitle="Spaced-repetition flashcards from the question bank." />
        <Card>
          <EmptyState
            icon={<Layers size={22} />}
            title="No cards due"
            hint="Nothing to review right now. Check back later or add more topics."
          />
          <CardBody className="flex justify-center pb-8 pt-0">
            <Link to="/study">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </CardBody>
        </Card>
      </>
    );
  }

  if (done) {
    const total = tally.missed + tally.partial + tally.got_it;
    const gotPct = total > 0 ? (tally.got_it / total) * 100 : 0;
    return (
      <>
        <PageHeader title="Review complete" subtitle="Nice work — here's how this session went." />
        <Card>
          <CardBody className="flex flex-col items-center text-center py-10 animate-fade-in">
            <ScoreRing value={gotPct} size={120} />
            <p className="mt-4 text-sm font-medium text-slate-600">
              You nailed {tally.got_it} of {total} cards
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-md">
              <TallyChip tone="emerald" label="Got it" value={tally.got_it} icon={<Check size={15} />} />
              <TallyChip tone="amber" label="Partial" value={tally.partial} icon={<Minus size={15} />} />
              <TallyChip tone="rose" label="Missed" value={tally.missed} icon={<X size={15} />} />
            </div>
            <div className="mt-8 flex items-center gap-3">
              <Button variant="secondary" onClick={reset}>
                <RotateCcw size={16} /> Review again
              </Button>
              <Link to="/study">
                <Button>Back to dashboard</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const item = deck[index];
  if (!item) return null;
  const card = item.question;
  const progress = ((index + (revealed ? 0.5 : 0)) / deck.length) * 100;

  return (
    <>
      <PageHeader title="Today's review" subtitle="Recall first, then reveal. Rate yourself honestly." />

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 tabular">
          Card {index + 1} of {deck.length}
        </p>
        <Link to="/study" className="text-xs font-medium text-slate-400 hover:text-slate-600">
          End session
        </Link>
      </div>
      <ProgressBar value={progress} tone="bg-brand-500" className="mb-5" />

      <Card key={card.id} className="animate-fade-in">
        <CardBody className="p-7">
          <div className="flex flex-wrap gap-1.5 mb-4">
            <Badge tone="brand">{card.topic}</Badge>
            <Badge tone={difficultyTone[card.difficulty] ?? 'slate'}>{card.difficulty}</Badge>
            <Badge tone="slate">{card.type}</Badge>
          </div>

          <p className="text-lg font-semibold text-slate-800 leading-snug">{card.text}</p>

          {!revealed ? (
            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setRevealed(true)}>
                <Eye size={16} /> Reveal answer
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-3 animate-fade-in">
              <Rubric icon={<BookOpen size={14} />} label="Core answer" tone="text-slate-600 bg-slate-50" body={card.core_answer_display} />
              <Rubric icon={<Target size={14} />} label="Senior signal" tone="text-teal-700 bg-teal-50" body={card.senior_signal_display} />
              <Rubric icon={<ShieldAlert size={14} />} label="Trap" tone="text-rose-700 bg-rose-50" body={card.trap_display} />

              <div className="mt-3 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3 text-center uppercase tracking-wide">
                  How well did you know this?
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <RateButton tone="rose" label="Missed" icon={<X size={16} />} onClick={() => rate('missed')} />
                  <RateButton tone="amber" label="Partial" icon={<Minus size={16} />} onClick={() => rate('partial')} />
                  <RateButton tone="emerald" label="Got it" icon={<Check size={16} />} onClick={() => rate('got_it')} />
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Rubric({
  icon,
  label,
  tone,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  body: string;
}) {
  const [text, bg] = tone.split(' ');
  return (
    <div className={cn('rounded-lg p-3.5', bg)}>
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1', text)}>
        {icon}
        {label}
      </p>
      <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

const rateTones: Record<'rose' | 'amber' | 'emerald', string> = {
  rose: 'border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300',
  amber: 'border-amber-200 text-amber-600 hover:bg-amber-50 hover:border-amber-300',
  emerald: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300',
};

function RateButton({
  tone,
  label,
  icon,
  onClick,
}: {
  tone: 'rose' | 'amber' | 'emerald';
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border bg-white text-sm font-semibold transition-all active:scale-95',
        rateTones[tone],
      )}
    >
      {icon}
      {label}
    </button>
  );
}

const chipTones: Record<'emerald' | 'amber' | 'rose', string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
};

function TallyChip({
  tone,
  label,
  value,
  icon,
}: {
  tone: 'emerald' | 'amber' | 'rose';
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl py-3 flex flex-col items-center', chipTones[tone])}>
      <span className="flex items-center gap-1 text-xs font-semibold">
        {icon} {label}
      </span>
      <span className="text-2xl font-bold tabular mt-1">{value}</span>
    </div>
  );
}
