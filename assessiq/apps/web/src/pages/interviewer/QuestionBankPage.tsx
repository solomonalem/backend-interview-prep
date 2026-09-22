import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Target,
  ShieldAlert,
  BookOpen,
  Library,
  FileCode2,
  FileText,
  Pencil,
  Archive,
  ArchiveRestore,
  Download,
  Upload,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type {
  Difficulty,
  QuestionDraft,
  QuestionFilters,
  QuestionListItem,
  QuestionSort,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from '@assessiq/types';
import {
  BANK_PAGE_SIZES,
  DIFFICULTIES,
  QUESTION_SORTS,
  QUESTION_TYPES,
} from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { ApiRequestError } from '../../api/client';
import { QuestionEditPanel } from '../../components/questions/QuestionEditPanel';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  PageHeader,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

const SOURCES: { value: QuestionSource; label: string }[] = [
  { value: 'manual', label: 'Written by hand' },
  { value: 'generated', label: 'AI-generated' },
  { value: 'repo_grounded', label: 'From your codebase' },
  { value: 'document_grounded', label: 'From a document' },
];

/**
 * The bank, at the size it actually reaches.
 *
 * It used to fetch the first 100 questions oldest-first and stop, which meant
 * the newest question a manager generated was the one they could not find. It
 * now pages server-side and filters on every axis the bank actually has —
 * because "search harder" is not a substitute for being able to look.
 */
export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [status, setStatus] = useState<QuestionStatus | ''>('');
  const [source, setSource] = useState<QuestionSource | ''>('');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<QuestionSort>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(BANK_PAGE_SIZES[0]);

  const importInput = useRef<HTMLInputElement>(null);

  const filters: QuestionFilters = useMemo(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(tag ? { tag } : {}),
      ...(archived ? { archived: true } : {}),
      sort,
      page,
      limit: pageSize,
    }),
    [search, difficulty, type, status, source, tag, archived, sort, page, pageSize],
  );

  const load = useCallback(() => {
    setLoading(true);
    questionsApi
      .bank(filters)
      .then((r) => {
        setQuestions(r.questions);
        setTotal(r.total);
        setPages(r.pages);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'Could not load the bank'),
      )
      .finally(() => setLoading(false));
  }, [filters]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Any filter change starts again at page one — staying on page 7 of a
  // different result set shows an empty list and looks broken.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(1), [search, difficulty, type, status, source, tag, archived, sort, pageSize]);

  const openEditor = async (id: string) => {
    setError(null);
    try {
      setEditing(await questionsApi.full(id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not open that question');
    }
  };

  const setArchivedState = async (q: QuestionListItem, active: boolean) => {
    if (busyId) return;
    setBusyId(q.id);
    setError(null);
    try {
      await questionsApi.update(q.id, { is_active: active });
      setNotice(
        active
          ? 'Restored — it can be used in new assessments again.'
          : 'Archived. Assessments that already use it are untouched.',
      );
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update that question');
    } finally {
      setBusyId(null);
    }
  };

  const onImportFile = async (file: File) => {
    setError(null);
    setNotice(null);
    try {
      const parsed = JSON.parse(await file.text()) as { questions?: unknown };
      if (!Array.isArray(parsed.questions)) throw new Error('shape');
      const res = await questionsApi.import({ questions: parsed.questions as never });
      setNotice(
        `Imported ${res.imported} question${res.imported === 1 ? '' : 's'} as drafts for review` +
          (res.skipped ? ` · ${res.skipped} skipped (${res.notes[0] ?? ''})` : '.'),
      );
      load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "That file isn't a question export.",
      );
    }
  };

  const clearFilters = () => {
    setSearch('');
    setDifficulty('');
    setType('');
    setStatus('');
    setSource('');
    setTag('');
    setArchived(false);
  };
  const filtersActive =
    Boolean(search || difficulty || type || status || source || tag) || archived;

  return (
    <>
      <PageHeader
        title="Question Bank"
        subtitle="Rubric-scored questions with senior-signal and trap layers. Click to inspect, edit, tag or archive."
        actions={
          <div className="flex gap-2">
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => importInput.current?.click()}>
              <Upload size={15} /> Import
            </Button>
            <Button variant="secondary" onClick={() => void questionsApi.exportAll()}>
              <Download size={15} /> Export
            </Button>
          </div>
        }
      />

      <Card className="p-3 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search question text or topic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as QuestionSort)}
              className="sm:w-44"
            >
              {QUESTION_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as QuestionStatus | '')}
              className="w-auto min-w-[9rem]"
            >
              <option value="">Any status</option>
              <option value="vetted">Vetted</option>
              <option value="draft">Draft</option>
            </Select>
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
              className="w-auto min-w-[9rem]"
            >
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </Select>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType | '')}
              className="w-auto min-w-[9rem]"
            >
              <option value="">Any type</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as QuestionSource | '')}
              className="w-auto min-w-[11rem]"
            >
              <option value="">Any source</option>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setArchived((v) => !v)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition',
                archived
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
              )}
            >
              {archived ? 'Showing archived' : 'Show archived'}
            </button>
            {tag && (
              <button
                type="button"
                onClick={() => setTag('')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700"
              >
                <TagIcon size={13} /> {tag} <X size={13} />
              </button>
            )}
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {notice && (
        <p className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Loading…
            </span>
          ) : (
            `${total} question${total === 1 ? '' : 's'}${archived ? ' archived' : ''}`
          )}
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="w-auto py-1 text-xs"
          >
            {BANK_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!loading && questions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Library size={22} />}
            title="No questions match"
            hint="Try clearing a filter, or search for a topic instead."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q) => {
            const open = expanded === q.id;
            return (
              <Card key={q.id} hover={!open} className={cn(open && 'ring-1 ring-brand-200')}>
                <div className="flex items-start gap-3 px-5 py-4">
                  <button
                    onClick={() => setExpanded(open ? null : q.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {q.status === 'draft' && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          Draft — needs review
                        </span>
                      )}
                      {!q.is_active && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                          Archived
                        </span>
                      )}
                      {q.source === 'repo_grounded' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <FileCode2 size={11} /> Grounded in your codebase
                        </span>
                      )}
                      {q.source === 'document_grounded' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                          <FileText size={11} /> Grounded in your document
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium leading-snug text-slate-800">{q.text}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{q.topic}</Badge>
                      <Badge tone={difficultyTone[q.difficulty] ?? 'slate'}>{q.difficulty}</Badge>
                      <Badge tone="slate">{q.type}</Badge>
                      {q.domain && <Badge tone="violet">{q.domain}</Badge>}
                      {q.tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTag(t);
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-brand-100 hover:text-brand-700"
                        >
                          <TagIcon size={10} /> {t}
                        </button>
                      ))}
                    </div>
                    {/* How it has actually performed — the thing that tells a
                        manager whether a question is earning its place. */}
                    {q.usage && (
                      <p className="mt-2 text-[11px] text-slate-400 tabular">
                        used in {q.usage.times_used} assessment
                        {q.usage.times_used === 1 ? '' : 's'}
                        {q.usage.avg_score !== null && (
                          <>
                            {' · '}avg {q.usage.avg_score}% over {q.usage.answer_count} answer
                            {q.usage.answer_count === 1 ? '' : 's'}
                          </>
                        )}
                      </p>
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openEditor(q.id)}
                      title="Edit this question and its rubric"
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void setArchivedState(q, !q.is_active)}
                      disabled={busyId === q.id}
                      title={q.is_active ? 'Archive — removes it from retrieval' : 'Restore'}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-amber-600"
                    >
                      {q.is_active ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : q.id)}
                      className="rounded-lg p-1.5 text-slate-400"
                    >
                      <ChevronDown
                        size={18}
                        className={cn('transition-transform', open && 'rotate-180')}
                      />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="grid animate-fade-in gap-3 px-5 pb-5 pt-1">
                    <Rubric icon={<BookOpen size={14} />} label="Core answer" tone="text-slate-600 bg-slate-50" body={q.core_answer_display} />
                    <Rubric icon={<Target size={14} />} label="Senior signal" tone="text-teal-700 bg-teal-50" body={q.senior_signal_display} />
                    <Rubric icon={<ShieldAlert size={14} />} label="Trap" tone="text-rose-700 bg-rose-50" body={q.trap_display} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft size={14} /> Previous
          </Button>
          <span className="text-xs text-slate-500 tabular">
            Page {page} of {pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {editing && (
        <QuestionEditPanel
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice('Saved. Assessments already using it keep the version they were built with.');
            load();
          }}
        />
      )}
    </>
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
      <p className={cn('mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', text)}>
        {icon}
        {label}
      </p>
      <p className="text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
