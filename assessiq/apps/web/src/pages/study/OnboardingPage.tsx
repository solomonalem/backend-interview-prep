import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Wand2, FileText, ArrowRight, Layers, AlertTriangle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Label,
  Textarea,
  Spinner,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';
import type { DecodeJdResponse, JdWeight } from '@assessiq/types';

const weightTone: Record<JdWeight, 'rose' | 'amber' | 'violet' | 'slate'> = {
  Critical: 'rose',
  High: 'amber',
  Differentiator: 'violet',
  Low: 'slate',
};

export default function OnboardingPage() {
  const [jd, setJd] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecodeJdResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!jd.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await studyApi.decodeJd(jd);
      setResult(data);
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.message : 'Could not decode this job description.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader title="Target a role" subtitle="Paste a job description and we'll build a weighted study plan around it." />

      {/* Hero */}
      <Card className="mb-6 overflow-hidden">
        <div className="bg-brand-gradient px-6 py-7 text-white">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80">
            <Sparkles size={16} /> AI role decoder
          </div>
          <h2 className="mt-2 text-xl font-bold">Turn any job description into a focused prep plan</h2>
          <p className="mt-1 text-sm text-white/80 max-w-xl">
            We extract the role, domain, and the topics that actually get tested — then weight them so you
            study what matters most.
          </p>
        </div>
      </Card>

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div>
            <Label>Job description</Label>
            <Textarea
              rows={7}
              placeholder="Paste the full job description here…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <FileText size={13} /> We analyze the description to weight your plan.
            </p>
            <Button onClick={run} disabled={!jd.trim() || loading}>
              {loading ? (
                <>
                  <Spinner className="border-white/40 border-t-white" /> Analyzing…
                </>
              ) : (
                <>
                  <Wand2 size={16} /> Decode with AI
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={15} className="shrink-0" />
              {error}
            </div>
          )}
        </CardBody>
      </Card>

      {result && (
        <div className="animate-fade-in space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-lg bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-800">{result.role_title}</h3>
                  <p className="text-xs text-slate-400">Decoded from your job description</p>
                </div>
              </div>
              <Badge tone={result.domain ? 'sky' : 'slate'}>{result.domain ?? 'General'}</Badge>
            </CardHeader>
            <CardBody className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Weighted focus
              </p>
              {result.topics.map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                      <Layers size={15} />
                    </span>
                    <p className="text-sm font-medium text-slate-700 truncate">{t.topic}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 tabular w-20 text-right hidden sm:block">
                      {t.question_count} questions
                    </span>
                    <Badge tone={weightTone[t.weight]} className={cn('w-28 justify-center')}>
                      {t.weight}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="flex justify-center">
            <Link to="/study">
              <Button size="lg">
                Build my study plan <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
