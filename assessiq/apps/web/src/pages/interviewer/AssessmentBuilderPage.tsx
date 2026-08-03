import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Check, ArrowRight, Timer, ShieldCheck, ClipboardList, Sparkles } from 'lucide-react';
import type { CreateAssessmentRequest, QuestionListItem } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { assessmentsApi } from '../../api/assessments.api';
import { ApiRequestError } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  PageHeader,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

// Inline rounded switch — matches the SaaS light theme.
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-sm text-slate-700">{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand-500' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}

export default function AssessmentBuilderPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Config
  const [timerOn, setTimerOn] = useState(true);
  const [minutes, setMinutes] = useState(45);
  const [trackTabs, setTrackTabs] = useState(true);
  const [trackFocus, setTrackFocus] = useState(true);
  const [detectPaste, setDetectPaste] = useState(true);
  const [detectIdle, setDetectIdle] = useState(false);
  const [flagThreshold, setFlagThreshold] = useState(3);
  const [confidenceRating, setConfidenceRating] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      questionsApi
        .list({ search: search || undefined, limit: 100 })
        .then((r) => setQuestions(r.questions))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [search]);

  const proctoringOn = trackTabs || trackFocus || detectPaste || detectIdle;
  const canSave = title.trim().length > 0 && selected.size > 0 && !saving;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    // Set preserves click order → question_ids are ordered as selected.
    const body: CreateAssessmentRequest = {
      title: title.trim(),
      question_ids: Array.from(selected),
      timer_enabled: timerOn,
      ...(timerOn ? { timer_seconds: minutes * 60 } : {}),
      proctoring_config: {
        track_tab_switches: trackTabs,
        track_focus_loss: trackFocus,
        detect_paste: detectPaste,
        detect_idle: detectIdle,
        tab_switch_flag_threshold: flagThreshold,
      },
      confidence_rating_enabled: confidenceRating,
    };
    try {
      const created = await assessmentsApi.create(body);
      navigate(`/assessments/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create assessment');
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const q = `${selected.size} question${selected.size === 1 ? '' : 's'}`;
    const t = timerOn ? `${minutes}m timer` : 'no timer';
    const p = proctoringOn ? 'proctoring on' : 'proctoring off';
    return `${q} · ${t} · ${p}`;
  }, [selected.size, timerOn, minutes, proctoringOn]);

  return (
    <>
      <PageHeader
        title="New Assessment"
        subtitle="Pick questions, tune proctoring, and generate a shareable candidate link."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {saving ? <Spinner className="border-white/40 border-t-white" /> : <ArrowRight size={16} />}
              {saving ? 'Creating…' : 'Create assessment'}
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT — question picker */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div>
                <Input
                  placeholder="Assessment title — e.g. Senior Backend — Node"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(null);
                  }}
                  className="text-[15px] font-medium"
                />
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search the question bank…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-400">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Loading…
                </span>
              ) : (
                `${questions.length} question${questions.length === 1 ? '' : 's'}`
              )}
            </p>
            {selected.size > 0 && (
              <p className="text-xs font-medium text-brand-600">{selected.size} selected</p>
            )}
          </div>

          {!loading && questions.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="No questions match"
                hint="Try a different search term to find questions to add."
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {questions.map((q) => {
                const on = selected.has(q.id);
                return (
                  <Card
                    key={q.id}
                    hover={!on}
                    className={cn(
                      'cursor-pointer transition-shadow',
                      on && 'ring-2 ring-brand-300 shadow-glow',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(q.id)}
                      className="w-full text-left px-5 py-4 flex items-start gap-4"
                    >
                      <span
                        className={cn(
                          'mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                          on ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 bg-white',
                        )}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-slate-800 leading-snug">{q.text}</p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <Badge tone="brand">{q.topic}</Badge>
                          <Badge tone={difficultyTone[q.difficulty] ?? 'slate'}>{q.difficulty}</Badge>
                          <Badge tone="slate">{q.type}</Badge>
                          {q.domain && <Badge tone="violet">{q.domain}</Badge>}
                        </div>
                      </div>
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT — config panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Timer size={16} className="text-brand-500" /> Timing
              </h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <Toggle checked={timerOn} onChange={setTimerOn} label="Enable timer" />
              {timerOn && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Time limit (minutes)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    max={240}
                    value={minutes}
                    onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))}
                    className="tabular"
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <ShieldCheck size={16} className="text-brand-500" /> Proctoring
              </h3>
            </CardHeader>
            <CardBody className="space-y-3.5">
              <Toggle checked={trackTabs} onChange={setTrackTabs} label="Track tab switches" />
              <Toggle checked={trackFocus} onChange={setTrackFocus} label="Track focus loss" />
              <Toggle checked={detectPaste} onChange={setDetectPaste} label="Detect paste" />
              <Toggle checked={detectIdle} onChange={setDetectIdle} label="Detect idle" />
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Flag threshold
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={flagThreshold}
                  onChange={(e) => setFlagThreshold(Math.max(1, Number(e.target.value)))}
                  className="tabular"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Flag a session after this many proctoring events.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Sparkles size={16} className="text-brand-500" /> Scoring
              </h3>
            </CardHeader>
            <CardBody>
              <Toggle
                checked={confidenceRating}
                onChange={setConfidenceRating}
                label="Ask for confidence rating"
              />
            </CardBody>
          </Card>

          {/* Summary + create */}
          <Card className="bg-brand-soft border-brand-100">
            <CardBody className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Summary</p>
              <p className="text-sm text-slate-600 tabular">{summary}</p>
              <Button onClick={save} disabled={!canSave} className="w-full">
                {saving ? <Spinner className="border-white/40 border-t-white" /> : <ArrowRight size={16} />}
                {saving ? 'Creating…' : 'Create assessment'}
              </Button>
              {!canSave && !saving && (
                <p className="text-xs text-slate-400">
                  Add a title and at least one question to continue.
                </p>
              )}
              {error && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
                  {error}
                </p>
              )}
              <p className="text-xs text-slate-400">
                You'll add a shareable candidate link on the next screen.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
