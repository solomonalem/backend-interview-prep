import { Link } from 'react-router-dom';
import { Users, CheckCircle2, Gauge, FileText, ArrowUpRight, Flag, Plus } from 'lucide-react';
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
  verdictTone,
  verdictLabel,
} from '../../components/ui';
import { candidates, assessments, type CandidateStatus } from '../../data/mock';

const statusMeta: Record<CandidateStatus, { label: string; tone: string }> = {
  not_opened: { label: 'Not opened', tone: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-600' },
  in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-600' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-100 text-emerald-600' },
  expired: { label: 'Expired', tone: 'bg-rose-100 text-rose-600' },
};

export default function DashboardPage() {
  const submitted = candidates.filter((c) => c.overall_pct !== null);
  const avg = Math.round(submitted.reduce((a, c) => a + (c.overall_pct ?? 0), 0) / submitted.length);

  return (
    <>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users size={18} />} label="Candidates" value={candidates.length} sub="across 3 assessments" tone="brand" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={submitted.length} sub="scored & ready" tone="emerald" />
        <StatCard icon={<Gauge size={18} />} label="Avg score" value={`${avg}%`} sub="all submissions" tone="amber" />
        <StatCard icon={<FileText size={18} />} label="Assessments" value={assessments.length} sub="1 draft" tone="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent candidates */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Recent candidates</h3>
            <Link to="/reports/c1" className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
              View all <ArrowUpRight size={13} />
            </Link>
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {candidates.map((c) => (
              <Link
                key={c.id}
                to={c.overall_pct !== null ? `/reports/${c.id}` : '#'}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
              >
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.assessment}</p>
                </div>
                {c.flags > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <Flag size={12} /> {c.flags}
                  </span>
                )}
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${statusMeta[c.status].tone}`}>
                  {statusMeta[c.status].label}
                </span>
                <div className="w-16 text-right">
                  {c.overall_pct !== null ? (
                    <span className="text-sm font-bold text-slate-800 tabular">{c.overall_pct}%</span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Assessments */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-800">Assessments</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {assessments.map((a) => (
              <div key={a.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-slate-700">{a.title}</p>
                  <Badge tone="slate">{a.question_count}q</Badge>
                </div>
                <ProgressBar value={a.candidates ? (a.completed / a.candidates) * 100 : 0} tone="bg-brand-500" />
                <p className="mt-1.5 text-xs text-slate-400">
                  {a.completed}/{a.candidates} completed · {a.timer_minutes ? `${a.timer_minutes}m` : 'no timer'}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Verdict distribution */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Latest verdicts</h3>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          {submitted.map((c) => (
            <div key={c.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Avatar name={c.name} size="sm" />
              <div>
                <p className="text-xs font-medium text-slate-700">{c.name}</p>
                {c.verdict && (
                  <Badge tone={verdictTone[c.verdict] ?? 'slate'}>{verdictLabel(c.verdict)}</Badge>
                )}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
