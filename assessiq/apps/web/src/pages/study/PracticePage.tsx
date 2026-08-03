import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Shuffle,
  Timer,
  Send,
  BookOpen,
  Target,
  ShieldAlert,
  ThumbsUp,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import type { QuestionListItem } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  Select,
  Textarea,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

interface Scores {
  core: number;
  senior: number;
  trap: number;
  evidence: number;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Deterministic pseudo-scores derived from the answer (no Math.random).
function deriveScores(answer: string): Scores {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const chars = answer.trim().length;
  const clamp = (n: number) => Math.max(40, Math.min(95, Math.round(n)));
  return {
    core: clamp(48 + words * 1.4),
    senior: clamp(40 + words * 1.1 + (chars % 17)),
    trap: clamp(44 + words * 0.9 + (chars % 11)),
    evidence: clamp(42 + words * 1.2 + (chars % 13)),
  };
}

export default function PracticePage() {
  const [pool, setPool] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'writing' | 'scoring' | 'result'>('writing');
  const [scores, setScores] = useState<Scores | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    questionsApi
      .list({ limit: 20 })
      .then((r) => {
        if (!alive) return;
        setPool(r.questions);
        if (r.questions[0]) setSelectedId(r.questions[0].id);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  const selected = useMemo(() => pool.find((q) => q.id === selectedId), [pool, selectedId]);

  function beginTimer() {
    if (!running && phase === 'writing') setRunning(true);
  }

  function selectQuestion(id: string) {
    setSelectedId(id);
    resetAttempt();
  }

  function randomQuestion() {
    if (pool.length === 0) return;
    const i = pool.findIndex((q) => q.id === selectedId);
    const next = pool[(i + 1) % pool.length] ?? pool[0];
    if (next) selectQuestion(next.id);
  }

  function resetAttempt() {
    setAnswer('');
    setSeconds(0);
    setRunning(false);
    setPhase('writing');
    setScores(null);
  }

  function submit() {
    if (!answer.trim()) return;
    setRunning(false);
    setPhase('scoring');
    setTimeout(() => {
      setScores(deriveScores(answer));
      setPhase('result');
    }, 1200);
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Practice" subtitle="Answer under time, get instant AI-style feedback." />
        <Card>
          <CardBody className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
            <Spinner /> Loading questions…
          </CardBody>
        </Card>
      </>
    );
  }

  if (pool.length === 0 || !selected) {
    return (
      <>
        <PageHeader title="Practice" subtitle="Answer under time, get instant AI-style feedback." />
        <Card>
          <EmptyState icon={<Sparkles size={22} />} title="No questions available" hint="Try again in a moment." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Practice"
        subtitle="Answer under time pressure and get instant, AI-style coaching."
        actions={
          <Button variant="secondary" onClick={randomQuestion}>
            <Shuffle size={16} /> Random question
          </Button>
        }
      />

      {/* Question picker */}
      <Card className="p-3 mb-5">
        <Select value={selectedId} onChange={(e) => selectQuestion(e.target.value)}>
          {pool.map((q) => (
            <option key={q.id} value={q.id}>
              {q.topic} — {q.text.length > 70 ? `${q.text.slice(0, 70)}…` : q.text}
            </option>
          ))}
        </Select>
      </Card>

      {/* The prompt */}
      <Card className="mb-5">
        <CardBody className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">{selected.topic}</Badge>
              <Badge tone={difficultyTone[selected.difficulty] ?? 'slate'}>{selected.difficulty}</Badge>
              <Badge tone="slate">{selected.type}</Badge>
              {selected.domain && <Badge tone="violet">{selected.domain}</Badge>}
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-semibold tabular px-3 py-1 rounded-lg',
                running ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500',
              )}
            >
              <Timer size={15} /> {fmt(seconds)}
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold text-slate-800 leading-snug">{selected.text}</p>
        </CardBody>
      </Card>

      {phase !== 'result' && (
        <Card className="mb-5">
          <CardBody className="p-5">
            <Textarea
              rows={8}
              placeholder="Type your answer here. The timer starts when you begin…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onFocus={beginTimer}
              disabled={phase === 'scoring'}
            />
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {answer.trim().split(/\s+/).filter(Boolean).length} words
              </p>
              <Button onClick={submit} disabled={!answer.trim() || phase === 'scoring'}>
                {phase === 'scoring' ? (
                  <>
                    <Spinner className="border-white/40 border-t-white" /> Scoring…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Submit for feedback
                  </>
                )}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {phase === 'result' && scores && (
        <div className="space-y-5 animate-fade-in">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2">
                <Sparkles size={16} className="text-brand-500" /> AI feedback
              </h3>
              <span className="text-xs text-slate-400 tabular">answered in {fmt(seconds)}</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <ScoreRow label="Core answer" value={scores.core} />
              <ScoreRow label="Senior signal" value={scores.senior} />
              <ScoreRow label="Trap awareness" value={scores.trap} />
              <ScoreRow label="Evidence & specifics" value={scores.evidence} />

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg p-3.5 bg-emerald-50">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 text-emerald-700">
                    <ThumbsUp size={14} /> What you did well
                  </p>
                  <ul className="space-y-1.5 text-sm text-slate-600 leading-relaxed list-disc pl-4">
                    <li>Directly addressed the core of the question.</li>
                    <li>Structured the answer clearly and stayed on topic.</li>
                  </ul>
                </div>
                <div className="rounded-lg p-3.5 bg-amber-50">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 text-amber-700">
                    <TrendingUp size={14} /> To go deeper
                  </p>
                  <ul className="space-y-1.5 text-sm text-slate-600 leading-relaxed list-disc pl-4">
                    <li>Name a concrete tradeoff or failure mode to show seniority.</li>
                    <li>Back a claim with a metric or a real example.</li>
                  </ul>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* The real rubric to learn from */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-800">Model answer</h3>
              <span className="text-xs text-slate-400">how a senior would frame it</span>
            </CardHeader>
            <CardBody className="grid gap-3">
              <Rubric icon={<BookOpen size={14} />} label="Core answer" tone="text-slate-600 bg-slate-50" body={selected.core_answer_display} />
              <Rubric icon={<Target size={14} />} label="Senior signal" tone="text-teal-700 bg-teal-50" body={selected.senior_signal_display} />
              <Rubric icon={<ShieldAlert size={14} />} label="Trap" tone="text-rose-700 bg-rose-50" body={selected.trap_display} />
            </CardBody>
          </Card>

          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={resetAttempt}>
              <RotateCcw size={16} /> Try this again
            </Button>
            <Button onClick={randomQuestion}>
              <Shuffle size={16} /> Practice another
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span className="text-xs font-semibold text-slate-500 tabular">{value}%</span>
      </div>
      <ProgressBar value={value} />
    </div>
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
