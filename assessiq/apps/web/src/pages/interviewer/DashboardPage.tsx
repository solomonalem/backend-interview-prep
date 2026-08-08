import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CheckCircle2, Gauge, FileText, Plus, Inbox, FilePlus2 } from 'lucide-react';
import type { AssessmentListItem, LinkStatus } from '@assessiq/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
  Avatar,
  Spinner,
  EmptyState,
} from '../../components/ui';
import { assessmentsApi } from '../../api/assessments.api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

const statusMeta: Record<LinkStatus, { label: string; tone: string }> = {
  not_opened: { label: 'Not opened', tone: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-600' },
  in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-600' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-100 text-emerald-600' },
  expired: { label: 'Expired', tone: 'bg-rose-100 text-rose-600' },
};

function timerText(a: AssessmentListItem): string {
  return a.timer_enabled && a.timer_seconds ? `${Math.round(a.timer_seconds / 60)}m` : 'no timer';
}

export default function DashboardPage() {
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await assessmentsApi.list();
      setAssessments(r.assessments);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Candidate submissions land while the interviewer is elsewhere, so keep the
  // statuses current instead of waiting for a manual reload.
  useLiveRefresh(load);

  const allLinks = assessments.flatMap((a) =>
    a.links.map((l) => ({ ...l, assessmentTitle: a.title, assessmentId: a.id })),
  );
  const submitted = allLinks.filter((l) => l.overall_score !== null);
  const avg =
    submitted.length > 0
      ? Math.round(submitted.reduce((s, l) => s + (l.overall_score ?? 0), 0) / submitted.length)
      : null;

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle="Your assessments and candidate activity at a glance."
      actions={
        <Link to="/build">
          <Button>
            <Plus size={16} /> New Assessment
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

  if (assessments.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<FilePlus2 size={22} />}
            title="No assessments yet"
            hint="Create your first assessment to start sending proctored, rubric-scored tests."
          />
          <div className="flex justify-center pb-8 -mt-4">
            <Link to="/build">
              <Button>
                <Plus size={16} /> New Assessment
              </Button>
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<FileText size={18} />} label="Assessments" value={assessments.length} tone="brand" />
        <StatCard icon={<Users size={18} />} label="Links / candidates" value={allLinks.length} tone="sky" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={submitted.length} sub="scored & ready" tone="emerald" />
        <StatCard icon={<Gauge size={18} />} label="Avg score" value={avg !== null ? `${avg}%` : '—'} sub="all submissions" tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent candidate links */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Recent candidates</h3>
            <span className="text-xs text-slate-400">{allLinks.length} links</span>
          </CardHeader>
          {allLinks.length === 0 ? (
            <EmptyState
              icon={<Inbox size={22} />}
              title="No candidate links yet"
              hint="Open an assessment and generate a link to invite a candidate."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {allLinks.slice(0, 8).map((l) => (
                <Link
                  key={l.id}
                  to={`/assessments/${l.assessmentId}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
                >
                  <Avatar name={l.candidate_label ?? 'Unlabeled'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {l.candidate_label ?? 'Unlabeled'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{l.assessmentTitle}</p>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${statusMeta[l.status].tone}`}>
                    {statusMeta[l.status].label}
                  </span>
                  <div className="w-16 text-right">
                    {l.overall_score !== null ? (
                      <span className="text-sm font-bold text-slate-800 tabular">{l.overall_score}%</span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Assessments */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Assessments</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {assessments.map((a) => {
              const total = a.links.length;
              const done = a.links.filter((l) => l.overall_score !== null).length;
              return (
                <Link key={a.id} to={`/assessments/${a.id}`} className="block group">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700 group-hover:text-brand-700 truncate">
                      {a.title}
                    </p>
                    <Badge tone="slate">{a.question_count}q</Badge>
                  </div>
                  <ProgressBar value={total ? (done / total) * 100 : 0} tone="bg-brand-500" />
                  <p className="mt-1.5 text-xs text-slate-400">
                    {done}/{total} completed · {timerText(a)}
                  </p>
                </Link>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
