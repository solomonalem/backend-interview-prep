import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Users, CheckCircle2, Gauge, Copy, Check, Link2, Flag, ArrowUpRight } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
} from '../../components/ui';
import { assessments, candidates, type CandidateStatus } from '../../data/mock';

const statusMeta: Record<CandidateStatus, { label: string; tone: string }> = {
  not_opened: { label: 'Not opened', tone: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-600' },
  in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-600' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-100 text-emerald-600' },
  expired: { label: 'Expired', tone: 'bg-rose-100 text-rose-600' },
};

function token(id: string): string {
  return `xK9mP${id}qR7b`;
}

export default function AssessmentDetailPage() {
  const { id } = useParams();
  const assessment = assessments.find((a) => a.id === id) ?? assessments[0];
  const [copied, setCopied] = useState(false);

  if (!assessment) return null;

  const link = `https://assessiq.app/a/${token(assessment.id)}`;

  // Candidates belonging to this assessment (fall back to all if none match).
  const matched = candidates.filter((c) => c.assessment === assessment.title);
  const rows = matched.length > 0 ? matched : candidates;

  const submitted = rows.filter((c) => c.overall_pct !== null);
  const avg =
    submitted.length > 0
      ? Math.round(submitted.reduce((a, c) => a + (c.overall_pct ?? 0), 0) / submitted.length)
      : null;

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <PageHeader
        title={assessment.title}
        subtitle={`${assessment.question_count} questions · ${
          assessment.timer_minutes ? `${assessment.timer_minutes}m timer` : 'no timer'
        }`}
        actions={
          <>
            <Button variant="secondary" onClick={copyLink}>
              {copied ? (
                <>
                  <Check size={16} /> Copied!
                </>
              ) : (
                <>
                  <Copy size={16} /> Copy link
                </>
              )}
            </Button>
            <Button>
              <Link2 size={16} /> New link
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={<Users size={18} />} label="Candidates" value={rows.length} tone="brand" />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Completed"
          value={submitted.length}
          sub="scored & ready"
          tone="emerald"
        />
        <StatCard
          icon={<Gauge size={18} />}
          label="Avg score"
          value={avg !== null ? `${avg}%` : '—'}
          sub="all submissions"
          tone="amber"
        />
      </div>

      {/* Shareable link */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Shareable link</h3>
          <Badge tone="emerald">Active</Badge>
        </CardHeader>
        <div className="px-5 py-4 flex items-center gap-3">
          <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-700">
            {`https://assessiq.app/a/${token(assessment.id)}`}
          </code>
          <Button size="sm" variant="secondary" onClick={copyLink}>
            {copied ? (
              <>
                <Check size={14} /> Copied!
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Candidates table */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Candidates</h3>
          <span className="text-xs text-slate-400">{rows.length} total</span>
        </CardHeader>
        <div className="divide-y divide-slate-100">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
              <Avatar name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {c.submitted_at ? `Submitted ${c.submitted_at}` : 'Not yet submitted'}
                </p>
              </div>
              {c.flags > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                  <Flag size={12} /> {c.flags}
                </span>
              )}
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${statusMeta[c.status].tone}`}
              >
                {statusMeta[c.status].label}
              </span>
              <div className="w-14 text-right">
                {c.overall_pct !== null ? (
                  <span className="text-sm font-bold text-slate-800 tabular">{c.overall_pct}%</span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>
              <div className="w-24 text-right">
                {c.status === 'submitted' ? (
                  <Link
                    to={`/reports/${c.id}`}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                  >
                    View report <ArrowUpRight size={13} />
                  </Link>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
