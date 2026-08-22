import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Layers,
  AlertTriangle,
  Puzzle,
  Building2,
  FileCode2,
  ShieldCheck,
  Loader2,
  Wand2,
  CheckSquare,
  Square,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react';
import type {
  Difficulty,
  GroundedQuestionsResponse,
  FindingKind,
  FindingView,
  QuestionDraft,
  ScanFindingsResponse,
} from '@assessiq/types';
import { DIFFICULTIES, FINDING_KINDS } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { QuestionReviewPanel } from '../../components/QuestionReviewPanel';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui';
import { integrationsApi } from '../../api/integrations.api';
import { ApiRequestError } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { cn } from '../../lib/cn';

// Each kind answers a different interview question, so they are grouped rather
// than listed — a manager scanning for risks shouldn't have to read the stack.
const KIND_META: Record<
  FindingKind,
  { label: string; icon: React.ReactNode; tone: 'brand' | 'amber' | 'rose' | 'sky' | 'violet'; blurb: string }
> = {
  architecture: {
    label: 'Architecture',
    icon: <Layers size={15} />,
    tone: 'brand',
    blurb: 'How the pieces fit together and talk to each other',
  },
  pattern: {
    label: 'Patterns',
    icon: <Puzzle size={15} />,
    tone: 'violet',
    blurb: 'Deliberate techniques the team has chosen',
  },
  risk: {
    label: 'Risks',
    icon: <AlertTriangle size={15} />,
    tone: 'rose',
    blurb: 'What will bite under load, failure or concurrency',
  },
  stack: {
    label: 'Stack',
    icon: <Boxes size={15} />,
    tone: 'sky',
    blurb: 'What it is built on, and where that constrains design',
  },
  domain: {
    label: 'Domain',
    icon: <Building2 size={15} />,
    tone: 'amber',
    blurb: 'What the business is and what the entities mean',
  },
};

const RUNNING = ['queued', 'cloning', 'analyzing'];

const STATUS_TEXT: Record<string, string> = {
  queued: 'Queued — waiting for a worker',
  cloning: 'Fetching a snapshot of the repository',
  analyzing: 'Reading the selected files',
  done: 'Complete',
  failed: 'Failed',
};

function Citation({ f }: { f: FindingView }) {
  if (!f.file_path) return null;
  const range =
    f.line_start != null ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `–${f.line_end}` : ''}` : '';
  return (
    <div className="mt-2.5">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <FileCode2 size={12} />
        <span className="font-mono text-[11px] text-slate-500">
          {f.file_path}
          {range}
        </span>
      </p>
      {f.excerpt && (
        <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <code>{f.excerpt}</code>
        </pre>
      )}
    </div>
  );
}

export default function ScanPage() {
  const { id } = useParams();
  const [data, setData] = useState<ScanFindingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Grounded generation (design §6) ────────────────────────────────────────
  // Nothing is pre-selected: which findings matter depends on the role being
  // hired for, and that is the manager's judgement, not ours.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seniority, setSeniority] = useState<Difficulty>('senior');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<QuestionDraft | null>(null);
  // Questions this repo has produced, read from the server rather than held in
  // the browser — so leaving the page and coming back loses nothing.
  const [grounded, setGrounded] = useState<GroundedQuestionsResponse | null>(null);
  // How many drafts we are still expecting from jobs we just enqueued. Purely
  // a progress hint; the list itself is always the source of truth.
  const [awaiting, setAwaiting] = useState(0);
  const [justApproved, setJustApproved] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await integrationsApi.findings(id));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.status === 404
          ? 'not_found'
          : 'Could not load this scan.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadGrounded = useCallback(async () => {
    if (!id) return;
    try {
      const g = await questionsApi.grounded(id);
      setGrounded(g);
      // Stop the progress hint once the drafts we were waiting on have landed.
      setAwaiting((n) => (n > 0 && g.drafts.length >= n ? 0 : n));
    } catch {
      /* the list is a read-through; a transient failure just retries next tick */
    }
  }, [id]);

  useEffect(() => {
    void load();
    void loadGrounded();
  }, [load, loadGrounded]);

  // Poll while jobs are outstanding. Generation is a Claude call per finding,
  // so drafts trickle in over tens of seconds.
  useLiveRefresh(loadGrounded, { intervalMs: 4_000, enabled: awaiting > 0 });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = async () => {
    if (!picked.size || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const r = await questionsApi.generateFromRepo({
        finding_ids: [...picked],
        seniority,
      });
      // Returns as soon as the jobs are queued. Each finishes by writing a
      // draft, which shows up in the list below — nothing blocks, and leaving
      // the page costs nothing.
      setAwaiting((grounded?.drafts.length ?? 0) + r.expected);
      setPicked(new Set());
      void loadGrounded();
    } catch (e) {
      setGenError(e instanceof ApiRequestError ? e.message : 'Could not generate questions.');
    } finally {
      setGenerating(false);
    }
  };

  // Reviewing returns to the LIST, never to another modal. Which question to
  // deal with next is the manager's choice, not a sequence we impose.
  const afterReview = (approvedTitle?: string) => {
    setReviewing(null);
    setJustApproved(approvedTitle ?? null);
    void loadGrounded();
  };

  const running = !!data && RUNNING.includes(data.scan.status);
  // Poll only while there is something to watch — a finished scan never changes.
  useLiveRefresh(load, { intervalMs: 3_000, enabled: running });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error === 'not_found' || !data) {
    return (
      <Card>
        <EmptyState
          icon={<FileCode2 size={22} />}
          title="Scan not available"
          hint="This scan either doesn't exist or isn't yours."
        />
      </Card>
    );
  }

  const { scan, findings } = data;
  const stats = scan.stats;

  return (
    <>
      {/* The SAME review panel the rest of the app uses. A repo-grounded
          question earns no shortcut to vetted (design §6). */}
      {reviewing && (
        <QuestionReviewPanel
          draft={reviewing}
          onApproved={(q) => afterReview(q.topic)}
          onRejected={() => afterReview()}
          onClose={() => setReviewing(null)}
        />
      )}
      <PageHeader
        title={scan.repo_full_name || 'Repository scan'}
        subtitle={STATUS_TEXT[scan.status] ?? scan.status}
        actions={
          <Link
            to="/settings/integrations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft size={15} /> Integrations
          </Link>
        }
      />

      {running && (
        <Card className="mb-6 border-brand-200 bg-brand-soft">
          <CardBody className="flex items-start gap-3">
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-brand-600" />
            <div>
              <p className="text-sm font-medium text-slate-800">
                {STATUS_TEXT[scan.status] ?? 'Working'}…
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This page updates itself. Your code is analysed in a temporary workspace and
                deleted the moment the scan finishes — only the findings below are kept.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {scan.status === 'failed' && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Scan failed.</span> {scan.error ?? 'No detail recorded.'}
          </span>
        </div>
      )}

      {scan.partial && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Partial results.</span> Some batches failed, so these
            findings are real but do not cover the whole selection. Re-scanning may fill the gaps.
          </span>
        </div>
      )}

      {stats && (
        <Card className="mb-6">
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Files in repo', value: stats.files_seen },
                { label: 'Selected to read', value: stats.files_selected },
                { label: 'Analysed', value: stats.files_analyzed },
                { label: 'Tokens used', value: stats.tokens_used.toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                  <p className="text-lg font-bold leading-none text-slate-800 tabular">{s.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
            {/* The ratio is the whole design: cheap code picks, the model reads little. */}
            {stats.files_seen > 0 && (
              <p className="text-xs text-slate-400">
                The model read{' '}
                <span className="font-medium text-slate-600">
                  {((stats.files_selected / stats.files_seen) * 100).toFixed(1)}%
                </span>{' '}
                of the repository — the rest was ruled out before any AI ran.
              </p>
            )}
            {(stats.stack.length > 0 || stats.libraries.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">Detected:</span>
                {stats.stack.map((s) => (
                  <Badge key={s} tone="brand">
                    {s}
                  </Badge>
                ))}
                {stats.libraries.map((l) => (
                  <Badge key={l} tone="slate">
                    {l}
                  </Badge>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCode2 size={22} />}
            title={running ? 'No findings yet' : 'No findings'}
            hint={
              running
                ? 'Findings appear as the analysis completes.'
                : 'The analyser found nothing notable enough to build a question from. A very small or very generic repository can legitimately produce this.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">Findings</h2>
            <span className="text-xs text-slate-400">
              {findings.length} across {new Set(findings.map((f) => f.kind)).size} categories
            </span>
          </div>

          {/* Turn findings into questions. Which findings matter depends on the
              role, so the manager picks — nothing is selected for them. */}
          <Card className={cn(picked.size > 0 && 'ring-1 ring-brand-200')}>
            <CardHeader>
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Wand2 size={16} className="text-brand-500" /> Generate questions from findings
              </h3>
              <Badge tone={picked.size ? 'brand' : 'slate'}>{picked.size} selected</Badge>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-xs text-slate-400">
                Select the findings that matter for the role. Each becomes a question a candidate
                can reason about — described in neutral terms, with nothing identifying your
                repository. Every one still goes through review before it can be used.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <Label>Seniority</Label>
                  <Select
                    value={seniority}
                    onChange={(e) => setSeniority(e.target.value as Difficulty)}
                    disabled={generating}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={generate} disabled={!picked.size || generating}>
                  {generating ? (
                    <Spinner className="border-white/40 border-t-white" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  {generating
                    ? 'Queueing…'
                    : `Generate from ${picked.size || 'selected'} finding${picked.size === 1 ? '' : 's'}`}
                </Button>
                {picked.size > 0 && !generating && (
                  <button
                    type="button"
                    onClick={() => setPicked(new Set())}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}

              </div>
              {awaiting > 0 && (
                <p className="flex items-center gap-2 text-xs text-brand-700">
                  <Loader2 size={13} className="animate-spin" />
                  Writing questions in the background — they appear below as they finish. You can
                  keep browsing findings or leave this page.
                </p>
              )}
              {genError && (
                <p className="rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
                  {genError}
                </p>
              )}
            </CardBody>
          </Card>


          {/* Where the questions from this repo went (problem A: approving used
              to end in a dead end — "added to your bank" with no way to reach
              it). Drafts are reviewable in any order; vetted ones link to the
              builder, which is where they become an assessment. */}
          {(grounded && (grounded.counts.draft > 0 || grounded.counts.vetted > 0)) || awaiting > 0 ? (
            <Card className="ring-1 ring-brand-200">
              <CardHeader>
                <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                  <ClipboardList size={16} className="text-brand-500" /> Questions from this repo
                </h3>
                <div className="flex items-center gap-1.5">
                  <Badge tone={grounded?.counts.vetted ? 'emerald' : 'slate'}>
                    {grounded?.counts.vetted ?? 0} vetted
                  </Badge>
                  <Badge tone={grounded?.counts.draft ? 'amber' : 'slate'}>
                    {grounded?.counts.draft ?? 0} awaiting review
                  </Badge>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {justApproved && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>
                      <span className="font-medium">Added to your bank</span> — vetted and ready to
                      use in an assessment.
                    </span>
                    <Link
                      to="/build"
                      className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                    >
                      Use in an assessment
                    </Link>
                    <Link
                      to="/bank"
                      className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                    >
                      View in the bank
                    </Link>
                  </div>
                )}

                {/* Awaiting review — click any one, in any order. */}
                {grounded && grounded.drafts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Ready for review
                    </p>
                    {grounded.drafts.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setReviewing(q)}
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-slate-800 line-clamp-2">{q.text}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {q.topic} · {q.difficulty}
                            {q.grounding ? ` · from "${q.grounding.finding_title}"` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-amber-700">Review →</span>
                      </button>
                    ))}
                  </div>
                )}

                {awaiting > 0 && (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 size={13} className="animate-spin text-brand-500" />
                    More on the way…
                  </p>
                )}

                {/* Vetted — the destination. */}
                {grounded && grounded.vetted.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      In your bank, ready to use
                    </p>
                    {grounded.vetted.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                      >
                        <p className="text-sm text-slate-700 line-clamp-2">{q.text}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {q.topic} · {q.difficulty}
                        </p>
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-slate-500">
                      Find these under{' '}
                      <Link to="/build" className="font-medium text-brand-600 hover:text-brand-700">
                        New Assessment → “Or use a question from your codebase”
                      </Link>
                      , then add them to the tray like any other vetted question.
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          {FINDING_KINDS.filter((k) => findings.some((f) => f.kind === k)).map((kind) => {
            const meta = KIND_META[kind];
            const group = findings.filter((f) => f.kind === kind);
            return (
              <Card key={kind}>
                <CardHeader>
                  <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                    <span className="text-brand-500">{meta.icon}</span> {meta.label}
                  </h3>
                  <Badge tone={meta.tone}>{group.length}</Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-slate-400">{meta.blurb}</p>
                  {group.map((f) => {
                    const on = picked.has(f.id);
                    return (
                      <div
                        key={f.id}
                        className={cn(
                          'rounded-lg border px-4 py-3.5 transition-colors',
                          on
                            ? 'border-brand-300 bg-brand-soft ring-1 ring-brand-200'
                            : 'border-slate-100 bg-slate-50/60',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(f.id)}
                          aria-pressed={on}
                          disabled={generating}
                          className="flex w-full items-start gap-3 text-left"
                        >
                          <span className={cn('mt-0.5 shrink-0', on ? 'text-brand-600' : 'text-slate-300')}>
                            {on ? <CheckSquare size={16} /> : <Square size={16} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-800">{f.title}</span>
                            <span className="mt-1 block max-w-[95ch] text-sm leading-relaxed text-slate-600">
                              {f.detail}
                            </span>
                          </span>
                        </button>
                        <div className="pl-7">
                          <Citation f={f} />
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            );
          })}

          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>
              These are derived observations, not your source. The repository was analysed in a
              temporary workspace that has been deleted; nothing beyond the text above and the
              citations was stored.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
