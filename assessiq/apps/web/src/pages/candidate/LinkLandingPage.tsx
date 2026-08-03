import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ListChecks,
  Clock,
  FileText,
  ShieldAlert,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { Button, Card, CardBody } from '../../components/ui';
import { cn } from '../../lib/cn';

// Static mock metadata for the assessment behind this link (public page — no API).
const ASSESSMENT = {
  title: 'Senior Backend Engineer — Assessment',
  company: 'Acme Health',
  questions: 5,
  timeLimit: '45 minutes',
  format: 'One question at a time',
};

const EXPECTATIONS = [
  'You answer one question at a time — the next is revealed after you submit.',
  'There is no going back to a question once you submit it.',
  'A countdown timer runs for the whole session; it starts when you begin.',
  "You'll rate how confident you are in each of your answers.",
];

export default function LinkLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  const start = () => {
    if (!ready) return;
    navigate(`/a/${token}/session`);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="bg-brand-gradient px-8 py-8 text-white relative overflow-hidden">
            <div className="absolute -top-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
            <p className="relative text-xs font-semibold uppercase tracking-wide text-white/70">
              {ASSESSMENT.company}
            </p>
            <h1 className="relative mt-1.5 text-2xl font-bold leading-tight">{ASSESSMENT.title}</h1>
            <p className="relative mt-2 text-sm text-white/80 max-w-md">
              Welcome. Take a moment to read the details below, then begin whenever you're ready.
            </p>
          </div>

          <CardBody className="p-8 space-y-8">
            {/* Meta row */}
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={ListChecks} value={`${ASSESSMENT.questions} questions`} label="Total" />
              <Stat icon={Clock} value={ASSESSMENT.timeLimit} label="Time limit" />
              <Stat icon={FileText} value={ASSESSMENT.format} label="Format" />
            </div>

            {/* What to expect */}
            <div>
              <h2 className="text-sm font-semibold text-slate-800">What to expect</h2>
              <ul className="mt-3 space-y-2.5">
                {EXPECTATIONS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Proctoring disclosure */}
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <span className="h-9 w-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <ShieldAlert size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Session monitoring</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  This session passively logs tab switches, focus loss, paste events, and idle time.
                  This is shared with the interviewer as context — it is never used for automatic
                  disqualification.
                </p>
              </div>
            </div>

            {/* Consent + start */}
            <div className="border-t border-slate-100 pt-6 space-y-5">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ready}
                  onChange={(e) => setReady(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
                />
                <span className="text-sm text-slate-700">I understand and I'm ready to begin.</span>
              </label>

              <Button size="lg" onClick={start} disabled={!ready} className="w-full">
                Start assessment <ArrowRight size={18} />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center')}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={16} />
      </span>
      <p className="mt-2 text-sm font-semibold text-slate-800 leading-tight">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-400">{label}</p>
    </div>
  );
}
