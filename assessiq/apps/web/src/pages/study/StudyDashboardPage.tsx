import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame,
  CalendarClock,
  Target as TargetIcon,
  Trophy,
  ArrowUpRight,
  Target,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
  Badge,
  Spinner,
  EmptyState,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';
import type { StudyDeckResponse } from '@assessiq/types';

export default function StudyDashboardPage() {
  const [deck, setDeck] = useState<StudyDeckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    studyApi
      .deck()
      .then((data) => {
        if (alive) setDeck(data);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof ApiRequestError ? e.message : 'Could not load your study deck.',
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const header = (
    <PageHeader
      title="Your prep"
      subtitle="Spaced review keyed to where you're weakest. Show up daily — the plan does the rest."
      actions={
        <Link to="/study/session">
          <Button>
            <Target size={16} /> Start today's review
          </Button>
        </Link>
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex items-center justify-center py-24">
          <Spinner className="h-6 w-6" />
        </div>
      </>
    );
  }

  if (error || !deck) {
    return (
      <>
        {header}
        <Card>
          <CardBody>
            <EmptyState
              icon={<AlertTriangle size={20} />}
              title="We couldn't load your prep"
              hint={error ?? 'Please try again in a moment.'}
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const focus = deck.weak_topics; // already sorted weakest-first
  const mastery =
    focus.length > 0
      ? Math.round(focus.reduce((sum, t) => sum + t.avg_confidence, 0) / focus.length)
      : 0;
  const streak = Math.min(7, Math.max(0, deck.streak_days));

  return (
    <>
      {header}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Flame size={18} />}
          label="Day streak"
          value={deck.streak_days}
          sub="keep it alive"
          tone="amber"
        />
        <StatCard
          icon={<CalendarClock size={18} />}
          label="Due today"
          value={deck.due_today.length}
          sub="cards to review"
          tone="brand"
        />
        <StatCard
          icon={<TargetIcon size={18} />}
          label="Focus areas"
          value={deck.weak_topics.length}
          sub="topics to drill"
          tone="emerald"
        />
        <StatCard
          icon={<Trophy size={18} />}
          label="Mastery"
          value={`${mastery}%`}
          sub="across all topics"
          tone="sky"
        />
      </div>

      {/* Streak strip */}
      <Card className="mb-6">
        <CardBody className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">7-day streak</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {streak} day{streak === 1 ? '' : 's'} in a row — don't break the chain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 7 }).map((_, i) => {
              const filled = i < streak;
              return (
                <span
                  key={i}
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center transition-all',
                    filled
                      ? 'bg-brand-gradient text-white shadow-glow'
                      : 'bg-slate-100 text-slate-300',
                  )}
                >
                  <Flame size={15} />
                </span>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Focus areas */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Focus areas</h3>
            <Link
              to="/study/session"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
            >
              Drill these <ArrowUpRight size={13} />
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {focus.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={20} />}
                title="No reviews yet"
                hint="Start today's review to build your focus areas."
              />
            ) : (
              focus.map((t) => (
                <div key={t.topic}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700">{t.topic}</p>
                    <div className="flex items-center gap-2">
                      <Badge tone="slate">{t.question_count} cards</Badge>
                      <span className="text-xs font-semibold text-slate-500 tabular w-9 text-right">
                        {Math.round(t.avg_confidence)}%
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={t.avg_confidence} />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Topic mastery */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Topic mastery</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {focus.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={20} />}
                title="No reviews yet"
                hint="Start today's review to start building mastery."
              />
            ) : (
              focus.map((t) => (
                <div key={t.topic}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700">{t.topic}</p>
                    <span className="text-xs font-semibold text-slate-500 tabular">
                      {t.question_count} reviewed
                    </span>
                  </div>
                  <ProgressBar value={t.avg_confidence} tone="bg-brand-500" />
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
