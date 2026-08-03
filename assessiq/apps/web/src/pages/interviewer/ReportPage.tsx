import {
  Download,
  ShieldCheck,
  MonitorSmartphone,
  EyeOff,
  ClipboardPaste,
  Clock,
  Check,
  AlertTriangle,
  MessageSquare,
  Gauge,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  ScoreRing,
  difficultyTone,
  verdictTone,
  verdictLabel,
} from '../../components/ui';
import { sampleReport } from '../../data/mock';
import { cn } from '../../lib/cn';

const confidenceMeta: Record<string, { tone: 'emerald' | 'rose' | 'sky'; label: string }> = {
  well_calibrated: { tone: 'emerald', label: 'Well calibrated' },
  overconfident: { tone: 'rose', label: 'Overconfident' },
  underconfident: { tone: 'sky', label: 'Underconfident' },
};

// A compact labeled component bar. `emphasis` styles the headline signal.
function ComponentBar({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={cn(
            'text-xs font-medium',
            emphasis ? 'text-brand-700 font-semibold' : 'text-slate-500',
          )}
        >
          {label}
          {emphasis && <span className="ml-1.5 text-[10px] font-semibold text-brand-500">35%</span>}
        </span>
        <span className="text-xs font-bold text-slate-700 tabular">{value}%</span>
      </div>
      <ProgressBar value={value} tone={emphasis ? 'bg-brand-500' : undefined} />
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  alert: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3.5 py-3',
        alert ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white',
      )}
    >
      <span
        className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center',
          alert ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500',
        )}
      >
        {icon}
      </span>
      <div>
        <p className="text-lg font-bold text-slate-800 tabular leading-none">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { session, assessment, overall, proctoring, questions } = sampleReport;
  const timeUsedMin = Math.round(session.time_used_ms / 60_000);
  const clean =
    proctoring.tab_switch_count <= 1 &&
    proctoring.focus_loss_count === 0 &&
    proctoring.paste_count === 0 &&
    proctoring.idle_count <= 1;

  return (
    <>
      <PageHeader
        title={session.candidate_label}
        subtitle={`${assessment.title} · submitted ${session.submitted_at}`}
        actions={
          <Button variant="secondary" disabled title="coming soon">
            <Download size={16} /> Download PDF
          </Button>
        }
      />

      {/* HERO */}
      <Card className="mb-6">
        <CardBody className="grid gap-8 md:grid-cols-[auto_1fr_1.2fr] md:items-center">
          {/* Score ring */}
          <div className="flex flex-col items-center gap-3">
            <ScoreRing value={overall.total_pct} size={120} />
            <span className="text-xs font-medium text-slate-400">Overall</span>
          </div>

          {/* Verdict + facts */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1.5">Verdict</p>
              <Badge
                tone={verdictTone[overall.verdict] ?? 'slate'}
                className="text-sm px-3 py-1"
              >
                {verdictLabel(overall.verdict)}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Started</dt>
                <dd className="font-medium text-slate-700">{session.started_at}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Submitted</dt>
                <dd className="font-medium text-slate-700">{session.submitted_at}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Time used</dt>
                <dd className="font-medium text-slate-700 tabular">{timeUsedMin} min</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Submission</dt>
                <dd className="font-medium text-slate-700">
                  {session.auto_submitted ? 'Auto-submitted' : 'Manual'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Component averages */}
          <div className="rounded-xl bg-slate-50/70 p-5 space-y-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Score components
            </p>
            <ComponentBar label="Senior signal" value={overall.senior_signal_avg} emphasis />
            <ComponentBar label="Core" value={overall.core_avg} />
            <ComponentBar label="Trap" value={overall.trap_avg} />
            <ComponentBar label="Evidence" value={overall.evidence_avg} />
          </div>
        </CardBody>
      </Card>

      {/* PROCTORING */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <ShieldCheck size={16} className="text-brand-500" /> Proctoring
          </h3>
          {clean && <Badge tone="emerald">Clean session</Badge>}
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatChip
              icon={<MonitorSmartphone size={18} />}
              label="Tab switches"
              value={proctoring.tab_switch_count}
              alert={proctoring.tab_switch_count > 2}
            />
            <StatChip
              icon={<EyeOff size={18} />}
              label="Focus loss"
              value={proctoring.focus_loss_count}
              alert={proctoring.focus_loss_count > 2}
            />
            <StatChip
              icon={<ClipboardPaste size={18} />}
              label="Paste events"
              value={proctoring.paste_count}
              alert={proctoring.paste_count > 0}
            />
            <StatChip
              icon={<Clock size={18} />}
              label="Idle periods"
              value={proctoring.idle_count}
              alert={proctoring.idle_count > 2}
            />
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-sm text-slate-600 leading-relaxed">{proctoring.context_note}</p>
          </div>
        </CardBody>
      </Card>

      {/* PER-QUESTION */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-sm font-semibold text-slate-700">Question breakdown</h2>
        <span className="text-xs text-slate-400">{questions.length} questions</span>
      </div>

      <div className="space-y-5">
        {questions.map((q) => {
          const conf = confidenceMeta[q.confidence_flag] ?? {
            tone: 'slate' as const,
            label: q.confidence_flag.replace(/_/g, ' '),
          };
          return (
            <Card key={q.position}>
              <CardBody className="space-y-5">
                {/* Header row */}
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge tone="slate">Q{q.position + 1}</Badge>
                      <Badge tone="brand">{q.topic}</Badge>
                      <Badge tone={difficultyTone[q.difficulty] ?? 'slate'}>{q.difficulty}</Badge>
                    </div>
                    <p className="text-[15px] font-medium text-slate-800 leading-snug">{q.text}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-2xl font-bold tabular leading-none',
                        q.total_pct >= 70
                          ? 'text-emerald-600'
                          : q.total_pct >= 45
                            ? 'text-amber-600'
                            : 'text-rose-600',
                      )}
                    >
                      {q.total_pct}%
                    </p>
                    <p className="mt-1 text-xs text-slate-400">score</p>
                  </div>
                </div>

                {/* Component bars */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
                  <ComponentBar label="Senior signal" value={q.senior_signal_pct} emphasis />
                  <ComponentBar label="Core" value={q.core_pct} />
                  <ComponentBar label="Trap" value={q.trap_pct} />
                  <ComponentBar label="Evidence" value={q.evidence_pct} />
                </div>

                {/* Hit vs missed */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-emerald-50/60 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2.5">
                      <Check size={14} /> What they demonstrated
                    </p>
                    <ul className="space-y-2">
                      {q.hit.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span className="leading-snug">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-amber-50/60 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2.5">
                      <AlertTriangle size={14} /> What they missed
                    </p>
                    <ul className="space-y-2">
                      {q.missed.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                          <span className="leading-snug">{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Live probe */}
                <div className="flex items-start gap-3 rounded-lg bg-brand-soft border border-brand-100 p-4">
                  <MessageSquare size={18} className="mt-0.5 shrink-0 text-brand-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-0.5">
                      Recommended live probe
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">{q.probe}</p>
                  </div>
                </div>

                {/* Confidence */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-2 text-sm text-slate-500">
                    <Gauge size={15} className="text-slate-400" />
                    Self-rated{' '}
                    <span className="font-semibold text-slate-700 tabular">{q.confidence}/5</span>
                  </span>
                  <Badge tone={conf.tone}>{conf.label}</Badge>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
