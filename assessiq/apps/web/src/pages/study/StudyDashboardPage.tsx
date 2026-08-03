import { Link } from 'react-router-dom';
import { Flame, CalendarClock, CheckCircle2, Trophy, ArrowUpRight, Target } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
  Badge,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { studyStats, weakTopics, topicProgress } from '../../data/mock';

export default function StudyDashboardPage() {
  const focus = [...weakTopics].sort((a, b) => a.confidence - b.confidence);
  const streak = Math.min(7, Math.max(0, studyStats.streak_days));

  return (
    <>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Flame size={18} />}
          label="Day streak"
          value={studyStats.streak_days}
          sub="keep it alive"
          tone="amber"
        />
        <StatCard
          icon={<CalendarClock size={18} />}
          label="Due today"
          value={studyStats.due_today}
          sub="cards to review"
          tone="brand"
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="This week"
          value={studyStats.reviewed_this_week}
          sub="cards reviewed"
          tone="emerald"
        />
        <StatCard
          icon={<Trophy size={18} />}
          label="Mastery"
          value={`${studyStats.mastery_pct}%`}
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
            {focus.map((t) => (
              <div key={t.topic}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-slate-700">{t.topic}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone="slate">{t.count} cards</Badge>
                    <span className="text-xs font-semibold text-slate-500 tabular w-9 text-right">
                      {t.confidence}%
                    </span>
                  </div>
                </div>
                <ProgressBar value={t.confidence} />
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Topic mastery */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Topic mastery</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {topicProgress.map((t) => {
              const pct = t.total > 0 ? (t.mastered / t.total) * 100 : 0;
              return (
                <div key={t.topic}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700">{t.topic}</p>
                    <span className="text-xs font-semibold text-slate-500 tabular">
                      {t.mastered}/{t.total}
                    </span>
                  </div>
                  <ProgressBar value={pct} tone="bg-brand-500" />
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
