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
  AlertTriangle,
} from 'lucide-react';
import type { QuestionListItem, PracticeResponse } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';
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

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PracticePage() {
  const [pool, setPool] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'writing' | 'scoring' | 'result'>('writing');
  const [result, setResult] = useState<PracticeResponse | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
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
    setResult(null);
    setScoreError(null);
  }

  function submit() {
    if (!answer.trim() || !selected) return;
    setRunning(false);
    setScoreError(null);
    setPhase('scoring');
    studyApi
      .practice(selected.id, answer)
      .then((r) => {
        setResult(r);
        setPhase('result');
      })
      .catch((e) => {
        setScoreError(
          e instanceof ApiRequestError
            ? e.message
            : 'Scoring failed. Please try submitting again.',
        );
        setPhase('writing');
      });
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

  const score = result?.score;

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
            {scoreError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                <AlertTriangle size={15} /> {scoreError}
              </div>
            )}
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

      {phase === 'result' && result && score && (
        <div className="space-y-5 animate-fade-in">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2">
                <Sparkles size={16} className="text-brand-500" /> AI feedback
              </h3>
              <span className="text-xs text-slate-400 tabular">
                {score.total_pct}% overall · answered in {fmt(seconds)}
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <ScoreRow label="Core answer" value={score.core_pct} note={score.core_reasoning} />
              <ScoreRow label="Senior signal" value={score.senior_signal_pct} note={score.senior_signal_reasoning} />
              <ScoreRow label="Trap awareness" value={score.trap_pct} note={score.trap_reasoning} />
              <ScoreRow label="Evidence & specifics" value={score.evidence_pct} note={score.evidence_reasoning} />

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg p-3.5 bg-emerald-50">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 text-emerald-700">
                    <ThumbsUp size={14} /> What you did well
                  </p>
                  {score.what_was_hit.length > 0 ? (
                    <ul className="space-y-1.5 text-sm text-slate-600 leading-relaxed list-disc pl-4">
                      {score.what_was_hit.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Nothing stood out yet — add depth and specifics to earn credit here.
                    </p>
                  )}
                </div>
                <div className="rounded-lg p-3.5 bg-amber-50">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 text-amber-700">
                    <TrendingUp size={14} /> To go deeper
                  </p>
                  {score.what_was_missed.length > 0 ? (
                    <ul className="space-y-1.5 text-sm text-slate-600 leading-relaxed list-disc pl-4">
                      {score.what_was_missed.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Nothing major missing — strong, well-rounded answer.
                    </p>
                  )}
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
              <Rubric icon={<BookOpen size={14} />} label="Core answer" tone="text-slate-600 bg-slate-50" body={result.rubric.core_answer_display} />
              <Rubric icon={<Target size={14} />} label="Senior signal" tone="text-teal-700 bg-teal-50" body={result.rubric.senior_signal_display} />
              <Rubric icon={<ShieldAlert size={14} />} label="Trap" tone="text-rose-700 bg-rose-50" body={result.rubric.trap_display} />
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

function ScoreRow({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span className="text-xs font-semibold text-slate-500 tabular">{value}%</span>
      </div>
      <ProgressBar value={value} />
      {note && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{note}</p>}
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
      <p className="max-w-[95ch] text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
