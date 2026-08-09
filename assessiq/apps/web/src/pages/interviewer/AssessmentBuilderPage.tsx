import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Timer,
  ShieldCheck,
  ClipboardList,
  Sparkles,
  Briefcase,
  X,
  Layers,
  FileText,
  Wand2,
  PenLine,
} from 'lucide-react';
import type {
  CreateAssessmentRequest,
  DecodeJdResponse,
  Difficulty,
  QuestionDraft,
  QuestionMatchItem,
  QuestionType,
} from '@assessiq/types';
import { DIFFICULTIES, QUESTION_TYPES, supportedRolePresets } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { assessmentsApi } from '../../api/assessments.api';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';
import { QuestionCard } from '../../components/QuestionCard';
import { HeuristicNote, NoMatchNotice } from '../../components/DecodeNotices';
import { QuestionReviewPanel } from '../../components/QuestionReviewPanel';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Select,
  Textarea,
  PageHeader,
  Spinner,
  EmptyState,
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

function Chip({
  children,
  onRemove,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors';
  if (onRemove) {
    return (
      <span className={cn(base, 'border-brand-200 bg-brand-soft text-brand-700')}>
        {children}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${String(children)}`}
          className="text-brand-400 hover:text-brand-700"
        >
          <X size={12} strokeWidth={3} />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        active
          ? 'border-brand-300 bg-brand-soft text-brand-700'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  );
}

// The decode returns a role title, not a seniority enum. Read one out of it
// when it is unambiguous, and leave the field alone when it is not — a wrong
// pre-selection is worse than an empty one the manager fills in themselves.
// Checked most-senior-first so "Senior Staff Engineer" resolves to staff.
function seniorityFromRole(roleTitle: string): Difficulty | null {
  const r = roleTitle.toLowerCase();
  if (/\b(staff|principal|distinguished|architect)\b/.test(r)) return 'staff';
  if (/\b(senior|sr\.?|lead)\b/.test(r)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate|intern|associate)\b/.test(r)) return 'junior';
  if (/\b(mid|intermediate)\b/.test(r)) return 'mid';
  return null;
}

// How many decoded topics to push into the Technology field. The decode ranks
// them, so this takes the strongest few — filling all ten would make the match
// query so broad that the ranking stops meaning anything.
const MAX_AUTOFILL_TOPICS = 4;

// The pool is bank-first: the server returns what the bank has and only
// generates when this topic is nearly uncovered. No fixed pool size — padding
// to a number meant every search on a covered topic paid for generation.

export default function AssessmentBuilderPage() {
  const navigate = useNavigate();

  // ── JD on-ramp (alternative to filling the fields by hand) ─────────────────
  const [jdText, setJdText] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<DecodeJdResponse | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  // ── Position input ─────────────────────────────────────────────────────────
  const [role, setRole] = useState('');
  const [tech, setTech] = useState<string[]>([]);
  const [techDraft, setTechDraft] = useState('');
  const [seniority, setSeniority] = useState<Difficulty | ''>('');
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [topicHints, setTopicHints] = useState<string[]>([]);

  // ── Results ────────────────────────────────────────────────────────────────
  const [results, setResults] = useState<QuestionMatchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [poolNote, setPoolNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // ── Review (Stage B) ───────────────────────────────────────────────────────
  // A draft must pass through here before it can enter the tray.
  const [reviewDraft, setReviewDraft] = useState<QuestionDraft | null>(null);
  const [loadingReview, setLoadingReview] = useState<string | null>(null);
  const [ownText, setOwnText] = useState('');
  const [draftingOwn, setDraftingOwn] = useState(false);

  // ── Selection tray — the single source of truth for the assessment.
  // A Map keeps insertion order, so question_ids are ordered as selected.
  // Nothing is ever added here except by an explicit click.
  const [tray, setTray] = useState<Map<string, QuestionMatchItem>>(new Map());

  const [title, setTitle] = useState('');

  // ── Config ─────────────────────────────────────────────────────────────────
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

  // Topic suggestions, so the manager can see what the bank actually covers
  // instead of guessing at free text.
  useEffect(() => {
    questionsApi
      .list({ limit: 100 })
      .then((r) => setTopicHints([...new Set(r.questions.map((q) => q.topic))]))
      .catch(() => setTopicHints([]));
  }, []);

  // Only offer roles the bank can actually serve — an unservable role in the
  // dropdown just recreates the empty-results problem.
  const roles = useMemo(() => supportedRolePresets(topicHints), [topicHints]);

  const addTech = (value: string) => {
    const v = value.trim().replace(/,$/, '');
    if (!v) return;
    setTech((prev) => (prev.some((t) => t.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setTechDraft('');
  };

  // Picking a role pre-fills its expected topics. It replaces rather than
  // appends so switching roles doesn't silently accumulate the previous one's
  // topics; everything stays editable afterwards.
  const pickRole = (label: string) => {
    setRole(label);
    const preset = roles.find((r) => r.label === label);
    if (preset) setTech(preset.topics);
  };

  // Type-ahead over real bank topics, minus what's already added. Free text is
  // still allowed — a technology we have no questions for is a valid thing to
  // type, it just won't match anything until Stage B.
  const techSuggestions = useMemo(() => {
    const chosen = new Set(tech.map((t) => t.toLowerCase()));
    const q = techDraft.trim().toLowerCase();
    return topicHints
      .filter((h) => !chosen.has(h.toLowerCase()))
      .filter((h) => !q || h.toLowerCase().includes(q))
      .slice(0, 8);
  }, [topicHints, tech, techDraft]);

  const toggleType = (t: QuestionType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // Decode a pasted JD and pre-fill the structured fields. This only fills the
  // form — the manager still reviews it and runs the search themselves, and
  // question type is always left to them (the decode says nothing about it).
  const runDecode = async () => {
    if (!jdText.trim() || decoding) return;
    setDecoding(true);
    setDecodeError(null);
    setDecoded(null);
    try {
      const d = await studyApi.decodeJd(jdText);
      setDecoded(d);
      if (!d.matched) return; // nothing worth filling — don't write garbage
      const strong = d.topics.filter((t) => t.weight !== 'Low').map((t) => t.topic);
      setTech(strong.slice(0, MAX_AUTOFILL_TOPICS));

      // Pick the role whose expected topics overlap the decode most. Set it
      // directly rather than through pickRole, so it labels the position
      // without overwriting the chips we just took from the JD. Requires two
      // overlapping topics — one is too weak a signal to guess a role from.
      const decodedSet = new Set(strong.map((t) => t.toLowerCase()));
      const best = roles
        .map((r) => ({
          label: r.label,
          overlap: r.topics.filter((t) => decodedSet.has(t.toLowerCase())).length,
        }))
        .sort((a, b) => b.overlap - a.overlap)[0];
      if (best && best.overlap >= 2) setRole(best.label);

      const inferred = seniorityFromRole(d.role_title);
      if (inferred) setSeniority(inferred);
    } catch (e) {
      setDecodeError(
        e instanceof ApiRequestError ? e.message : 'Could not decode this job description.',
      );
    } finally {
      setDecoding(false);
    }
  };

  // Any in-flight AI call. Generation can run ~90s, during which changing the
  // position or firing a second search would land the manager in a state that
  // no longer matches the results coming back.
  const busy = searching || generating || decoding || draftingOwn;
  const canSearch = tech.length > 0 && seniority !== '' && !busy;

  const runSearch = async (generate = true) => {
    if (!canSearch) return;
    setSearching(true);
    setSearchError(null);
    setPoolNote(null);
    try {
      const r = await questionsApi.pool({
        technology: tech,
        seniority: seniority as Difficulty,
        ...(types.length ? { type: types } : {}),
        generate,
      });
      setResults(r.questions);
      const parts = [
        `${r.relevant_count} on-topic from your bank`,
        r.generated_count > 0 ? `${r.generated_count} newly generated for review` : null,
        r.loose_count > 0 ? `${r.loose_count} related by seniority` : null,
      ].filter(Boolean);
      setPoolNote(r.generation_error ?? parts.join(', ') + '.');
    } catch (e) {
      setSearchError(
        e instanceof ApiRequestError ? e.message : 'Could not search the question bank.',
      );
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  // Generate more on top of what's already shown, excluding it so drafts don't
  // repeat. Available even when the bank filled the pool on its own.
  const generateMore = async () => {
    if (!tech.length || seniority === '' || generating) return;
    setGenerating(true);
    setSearchError(null);
    try {
      const r = await questionsApi.generate({
        technology: tech[0]!,
        seniority: seniority as Difficulty,
        ...(types.length ? { type: types[0]! } : {}),
        count: 3,
        exclude: (results ?? []).map((q) => q.id),
      });
      const extra: QuestionMatchItem[] = r.questions.map((q) => ({
        id: q.id,
        text: q.text,
        topic: q.topic,
        difficulty: q.difficulty,
        type: q.type,
        domain: q.domain,
        status: q.status,
        core_answer_display: q.core_answer_display,
        senior_signal_display: q.senior_signal_display,
        trap_display: q.trap_display,
        matched_on: ['topic', 'difficulty'],
        match_score: 2,
      }));
      setResults((prev) => [...(prev ?? []), ...extra]);
      setPoolNote(`${extra.length} more generated — review before use.`);
    } catch (e) {
      setSearchError(e instanceof ApiRequestError ? e.message : 'Could not generate questions.');
    } finally {
      setGenerating(false);
    }
  };

  // Explicit selection only — this is the ONLY path into the tray.
  // A vetted bank question goes straight in. A draft cannot: it opens the
  // review panel first, so no unreviewed rubric can reach an assessment.
  const toggleQuestion = async (id: string) => {
    const found = results?.find((q) => q.id === id) ?? tray.get(id);
    if (!found) return;

    if (!tray.has(id) && found.status === 'draft') {
      setSearchError(null);
      setLoadingReview(id);
      try {
        // The pool carries only public fields; review needs the private
        // _guide rubric, so fetch the full draft.
        setReviewDraft(await questionsApi.getDraft(id));
      } catch (e) {
        setSearchError(
          e instanceof ApiRequestError ? e.message : 'Could not open this question for review.',
        );
      } finally {
        setLoadingReview(null);
      }
      return;
    }

    setTray((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, found);
      return next;
    });
    setError(null);
  };

  // Approving is what promotes a draft to vetted AND puts it in the tray — the
  // manager's single explicit act, never automatic.
  const onApproved = (q: QuestionDraft) => {
    const item: QuestionMatchItem = {
      id: q.id,
      text: q.text,
      topic: q.topic,
      difficulty: q.difficulty,
      type: q.type,
      domain: q.domain,
      status: q.status,
      core_answer_display: q.core_answer_display,
      senior_signal_display: q.senior_signal_display,
      trap_display: q.trap_display,
      matched_on: ['topic', 'difficulty'],
      match_score: 2,
    };
    setResults((prev) => (prev ?? []).map((r) => (r.id === q.id ? item : r)));
    setTray((prev) => new Map(prev).set(q.id, item));
    setReviewDraft(null);
    setError(null);
  };

  const onRejected = (id: string) => {
    setResults((prev) => (prev ?? []).filter((r) => r.id !== id));
    setReviewDraft(null);
  };

  // Manager writes the question; the AI drafts its rubric; it then goes through
  // the same review panel. A question without a rubric can never be scored, so
  // there is no path that skips this.
  const draftOwnQuestion = async () => {
    if (!ownText.trim() || draftingOwn) return;
    if (!tech.length || seniority === '') {
      setSearchError('Add a technology and seniority first — the rubric is calibrated to them.');
      return;
    }
    setDraftingOwn(true);
    setSearchError(null);
    try {
      const draft = await questionsApi.draftRubric({
        text: ownText.trim(),
        topic: tech[0]!,
        seniority: seniority as Difficulty,
        ...(types.length ? { type: types[0]! } : {}),
      });
      setReviewDraft(draft);
      setOwnText('');
    } catch (e) {
      setSearchError(e instanceof ApiRequestError ? e.message : 'Could not draft a rubric.');
    } finally {
      setDraftingOwn(false);
    }
  };

  const removeFromTray = (id: string) => {
    setTray((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const trayItems = useMemo(() => [...tray.values()], [tray]);
  const canSave = title.trim().length > 0 && tray.size > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body: CreateAssessmentRequest = {
      title: title.trim(),
      question_ids: trayItems.map((q) => q.id),
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

  const proctoringOn = trackTabs || trackFocus || detectPaste || detectIdle;
  const summary = useMemo(() => {
    const q = `${tray.size} question${tray.size === 1 ? '' : 's'}`;
    const t = timerOn ? `${minutes}m timer` : 'no timer';
    const p = proctoringOn ? 'proctoring on' : 'proctoring off';
    return `${q} · ${t} · ${p}`;
  }, [tray.size, timerOn, minutes, proctoringOn]);

  return (
    <>
      {reviewDraft && (
        <QuestionReviewPanel
          draft={reviewDraft}
          onApproved={onApproved}
          onRejected={onRejected}
          onClose={() => setReviewDraft(null)}
        />
      )}
      <PageHeader
        title="New Assessment"
        subtitle="Describe the position, pick the questions you want, then generate a candidate link."
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
        {/* LEFT — position input + results */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <Input
                placeholder="Assessment title — e.g. Senior Backend — Node"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                className="text-[15px] font-medium"
              />
            </CardBody>
          </Card>

          {/* JD on-ramp — an alternative to filling the fields below by hand */}
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <FileText size={16} className="text-brand-500" /> Paste a job description
              </h3>
              <span className="text-xs text-slate-400">optional shortcut</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <fieldset disabled={busy} className={cn('space-y-3', busy && 'opacity-60')}>
              <Textarea
                rows={5}
                placeholder="Paste the job description and we'll fill in the position fields below…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">
                  Sent to our server and an AI provider to decode it. We don't store it.
                </p>
                <Button variant="secondary" onClick={runDecode} disabled={!jdText.trim() || busy}>
                  {decoding ? <Spinner /> : <Wand2 size={16} />}
                  {decoding ? 'Decoding…' : 'Decode'}
                </Button>
              </div>
              </fieldset>
              {decodeError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
                  {decodeError}
                </p>
              )}
              {decoded?.matched && decoded.source === 'heuristic' && <HeuristicNote />}
              {decoded?.matched && (
                <p className="text-xs text-slate-500">
                  Filled from <span className="font-medium">{decoded.role_title}</span>
                  {decoded.domain && <> · {decoded.domain}</>} — review the fields below, then
                  search.
                </p>
              )}
            </CardBody>
          </Card>

          {decoded && !decoded.matched && (
            <NoMatchNotice
              detectedDomain={decoded.detected_domain}
              action="You can enter the position details manually below, or try a tech role like backend engineering."
            />
          )}

          {/* Position input */}
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Briefcase size={16} className="text-brand-500" /> The position
              </h3>
              <span className="text-xs text-slate-400">or fill in by hand</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <fieldset disabled={busy} className={cn('space-y-4', busy && 'opacity-60')}>
              <div>
                <Label>Title / role</Label>
                <Input
                  list="assessiq-roles"
                  placeholder="Select or type a role — e.g. Backend Engineer"
                  value={role}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRole(v);
                    // Fill topics only on an exact preset hit, so typing a
                    // free-text title never clobbers the chips mid-keystroke.
                    if (roles.some((r) => r.label === v)) pickRole(v);
                  }}
                />
                <datalist id="assessiq-roles">
                  {roles.map((r) => (
                    <option key={r.label} value={r.label} />
                  ))}
                </datalist>
                <p className="mt-1.5 text-xs text-slate-400">
                  Only roles we have questions for are listed. Picking one fills the technologies
                  below.
                </p>
              </div>

              <div>
                <Label>Technologies *</Label>
                <Input
                  placeholder="Type a technology and press Enter — e.g. Node.js, Kafka"
                  value={techDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(',')) addTech(v);
                    else setTechDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTech(techDraft);
                    } else if (e.key === 'Backspace' && !techDraft && tech.length) {
                      setTech((prev) => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => addTech(techDraft)}
                />
                {tech.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tech.map((t) => (
                      <Chip key={t} onRemove={() => setTech((p) => p.filter((x) => x !== t))}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                )}
                {techSuggestions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-400">
                      {techDraft.trim() ? 'In the bank, matching:' : 'In the bank:'}
                    </span>
                    {techSuggestions.map((h) => (
                      <Chip key={h} onClick={() => addTech(h)}>
                        {h}
                      </Chip>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-slate-400">
                  Anything can be added — technologies we have no questions for yet simply won't
                  match.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Seniority *</Label>
                  <Select
                    value={seniority}
                    onChange={(e) => setSeniority(e.target.value as Difficulty | '')}
                  >
                    <option value="">Select seniority…</option>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Question type (optional)</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUESTION_TYPES.map((t) => (
                      <Chip key={t} active={types.includes(t)} onClick={() => toggleType(t)}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <p className="text-xs text-slate-400">
                  We match loosely — questions matching only some of these still appear, ranked lower.
                </p>
                <Button onClick={() => runSearch()} disabled={!canSearch}>
                  {searching ? (
                    <Spinner className="border-white/40 border-t-white" />
                  ) : (
                    <Search size={16} />
                  )}
                  {searching ? 'Searching…' : 'Find questions'}
                </Button>
              </div>
              </fieldset>
              {searchError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
                  {searchError}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Write your own — an equal path to Find questions, not a footnote
              buried under the results, so it is visible before any search. */}
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <PenLine size={16} className="text-brand-500" /> Or write your own question
              </h3>
              <span className="text-xs text-slate-400">we'll draft the rubric</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <fieldset disabled={busy} className={cn(busy && 'opacity-60')}>
                <Textarea
                  rows={3}
                  placeholder="Type your question — we'll draft its scoring rubric for you to review…"
                  value={ownText}
                  onChange={(e) => setOwnText(e.target.value)}
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-xs text-slate-400">
                    Every question needs a rubric to be scorable — you'll review and edit it before
                    it's saved.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={draftOwnQuestion}
                    disabled={!ownText.trim() || busy}
                  >
                    {draftingOwn ? <Spinner /> : <Wand2 size={16} />}
                    {draftingOwn ? 'Drafting…' : 'Draft rubric'}
                  </Button>
                </div>
              </fieldset>
            </CardBody>
          </Card>

          {/* Long-running AI work needs to look like work, not a hang. */}
          {(searching || generating) && (
            <Card className="border-brand-200 bg-brand-soft">
              <CardBody className="flex items-start gap-3">
                <Spinner className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {generating ? 'Generating questions…' : 'Building your question pool…'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    If the bank can't cover this position we write new questions and their rubrics,
                    which takes up to a couple of minutes. The position fields are locked until this
                    finishes so the results match what you asked for.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Results */}
          {results === null ? (
            <Card>
              <EmptyState
                icon={<Briefcase size={22} />}
                title="Describe the position to start"
                hint="Add a technology and pick a seniority, then search the bank for matching questions."
              />
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="No questions matched"
                hint="Try a different technology or seniority — the bank may not cover this area yet."
              />
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-xs text-slate-400">
                  {results.length} in the pool, bank questions first
                  {poolNote && <span className="ml-1.5 text-slate-500">· {poolNote}</span>}
                </p>
                {tray.size > 0 && (
                  <p className="text-xs font-medium text-brand-600">{tray.size} in this assessment</p>
                )}
              </div>
              <fieldset disabled={busy} className={cn('space-y-2.5', busy && 'opacity-60')}>
                {results.map((q) => (
                  <div key={q.id} className="relative">
                    <QuestionCard
                      question={q}
                      selected={tray.has(q.id)}
                      onToggle={toggleQuestion}
                      matchedOn={q.matched_on}
                    />
                    {loadingReview === q.id && (
                      <span className="absolute right-4 top-4">
                        <Spinner />
                      </span>
                    )}
                  </div>
                ))}
              </fieldset>

              <div className="flex justify-center pt-1">
                <Button variant="secondary" onClick={generateMore} disabled={busy}>
                  {generating ? <Spinner /> : <Sparkles size={16} />}
                  {generating ? 'Generating…' : 'Generate more with AI'}
                </Button>
              </div>
            </>
          )}

        </div>

        {/* RIGHT — tray + config */}
        <div className="space-y-6">
          {/* Selection tray */}
          <Card className={cn(tray.size > 0 && 'ring-1 ring-brand-200')}>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Layers size={16} className="text-brand-500" /> Questions in this assessment
              </h3>
              <Badge tone={tray.size > 0 ? 'brand' : 'slate'}>{tray.size}</Badge>
            </CardHeader>
            <CardBody className="space-y-2">
              {tray.size === 0 ? (
                <p className="text-xs text-slate-400">
                  Nothing added yet. Select questions from the results — nothing is added for you.
                </p>
              ) : (
                trayItems.map((q, i) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                  >
                    <span className="mt-0.5 text-xs font-semibold text-slate-400 tabular w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700 leading-snug line-clamp-2">{q.text}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {q.topic} · {q.difficulty}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromTray(q.id)}
                      aria-label="Remove from assessment"
                      className="mt-0.5 shrink-0 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

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
                  <Label>Time limit (minutes)</Label>
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
                <Label>Flag threshold</Label>
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
