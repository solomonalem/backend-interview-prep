import { useEffect, useState } from 'react';
import { Plus, X, ChevronDown, BookMarked, Sparkles, Trash2, AlertCircle } from 'lucide-react';
import type { StoryDTO, StoryType } from '@assessiq/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Label,
  Input,
  Textarea,
  Select,
  Spinner,
  EmptyState,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { studyApi } from '../../api/study.api';
import { ApiRequestError } from '../../api/client';

const typeTone: Record<StoryType, 'rose' | 'amber' | 'brand' | 'violet'> = {
  incident: 'rose',
  bug_fix: 'amber',
  feature: 'brand',
  architecture: 'violet',
};

const typeLabel: Record<StoryType, string> = {
  incident: 'Incident',
  bug_fix: 'Bug fix',
  feature: 'Feature',
  architecture: 'Architecture',
};

const TYPES: StoryType[] = ['bug_fix', 'feature', 'incident', 'architecture'];

interface Draft {
  title: string;
  type: StoryType;
  situation: string;
  task: string;
  action: string;
  result: string;
}

const emptyDraft: Draft = {
  title: '',
  type: 'bug_fix',
  situation: '',
  task: '',
  action: '',
  result: '',
};

function errMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return 'Something went wrong. Please try again.';
}

export default function StoryBankPage() {
  const [list, setList] = useState<StoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { stories } = await studyApi.listStories();
        if (alive) setList(stories);
      } catch (e) {
        if (alive) setLoadError(errMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await studyApi.createStory({
        title: draft.title.trim(),
        type: draft.type,
        situation: draft.situation.trim(),
        task: draft.task.trim(),
        action: draft.action.trim(),
        result: draft.result.trim(),
      });
      const { suggested_tags, ...story } = created;
      setList((l) => [story, ...l]);
      setDraft(emptyDraft);
      setAdding(false);
      setExpanded(story.id);
      setSuggested(suggested_tags ?? []);
    } catch (e) {
      setFormError(errMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(emptyDraft);
    setFormError(null);
    setAdding(false);
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await studyApi.deleteStory(id);
      setList((l) => l.filter((s) => s.id !== id));
      setExpanded((cur) => (cur === id ? null : cur));
    } catch (e) {
      setActionError(errMessage(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Story Bank"
        subtitle="Your STAR stories, ready to pull in behavioral rounds. Capture them while they're fresh."
        actions={
          <Button
            onClick={() => {
              setSuggested(null);
              setAdding((a) => !a);
            }}
            variant={adding ? 'secondary' : 'primary'}
          >
            {adding ? (
              <>
                <X size={16} /> Close
              </>
            ) : (
              <>
                <Plus size={16} /> Add story
              </>
            )}
          </Button>
        }
      />

      {adding && (
        <Card className="mb-6 animate-fade-in ring-1 ring-brand-200">
          <CardHeader>
            <h3 className="font-semibold text-slate-800">New story</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid sm:grid-cols-[1fr,200px] gap-4">
              <div>
                <Label>Title</Label>
                <Input
                  placeholder="e.g. Cut checkout p99 from 3s to 200ms"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as StoryType }))}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <StarField
              label="Situation"
              value={draft.situation}
              onChange={(v) => setDraft((d) => ({ ...d, situation: v }))}
              placeholder="Set the scene — what was happening?"
            />
            <StarField
              label="Task"
              value={draft.task}
              onChange={(v) => setDraft((d) => ({ ...d, task: v }))}
              placeholder="What were you responsible for?"
            />
            <StarField
              label="Action"
              value={draft.action}
              onChange={(v) => setDraft((d) => ({ ...d, action: v }))}
              placeholder="What did you specifically do?"
            />
            <StarField
              label="Result"
              value={draft.result}
              onChange={(v) => setDraft((d) => ({ ...d, result: v }))}
              placeholder="What changed? Quantify the impact."
            />

            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Sparkles size={13} className="text-brand-400" /> We'll suggest tags for you on save.
            </p>

            {formError && (
              <p className="flex items-center gap-1.5 text-sm text-rose-600">
                <AlertCircle size={14} /> {formError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!draft.title.trim() || saving}>
                {saving ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  'Save story'
                )}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {suggested && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-700 ring-1 ring-brand-200 animate-fade-in">
          <Sparkles size={14} className="text-brand-500" />
          <span className="font-medium">Suggested tags:</span>
          {suggested.length > 0 ? (
            suggested.map((t) => (
              <Badge key={t} tone="brand">
                {t}
              </Badge>
            ))
          ) : (
            <span className="text-brand-500">none for this one</span>
          )}
        </div>
      )}

      {actionError && (
        <p className="mb-4 flex items-center gap-1.5 text-sm text-rose-600">
          <AlertCircle size={14} /> {actionError}
        </p>
      )}

      {loading ? (
        <Card>
          <CardBody className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Spinner /> Loading your stories…
          </CardBody>
        </Card>
      ) : loadError ? (
        <Card>
          <EmptyState
            icon={<AlertCircle size={22} />}
            title="Couldn't load your stories"
            hint={loadError}
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookMarked size={22} />}
            title="No stories yet"
            hint="Add your first STAR story so it's ready for the behavioral round."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {list.map((s) => {
            const open = expanded === s.id;
            return (
              <Card key={s.id} hover={!open} className={cn(open && 'ring-1 ring-brand-200')}>
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => setExpanded(open ? null : s.id)}
                    className="flex-1 min-w-0 text-left px-5 py-4 flex items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-slate-800 leading-snug">{s.title}</p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Badge tone={typeTone[s.type]}>{typeLabel[s.type]}</Badge>
                        {s.tags.map((t) => (
                          <Badge key={t} tone="slate">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <ChevronDown
                      size={18}
                      className={cn('text-slate-400 mt-0.5 transition-transform', open && 'rotate-180')}
                    />
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    disabled={deletingId === s.id}
                    aria-label="Delete story"
                    className="mr-3 mt-4 shrink-0 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                  >
                    {deletingId === s.id ? <Spinner /> : <Trash2 size={16} />}
                  </button>
                </div>

                {open && (
                  <div className="px-5 pb-5 pt-1 grid gap-3 animate-fade-in">
                    <StarBlock label="Situation" body={s.situation} />
                    <StarBlock label="Task" body={s.task} />
                    <StarBlock label="Action" body={s.action} />
                    <StarBlock label="Result" body={s.result} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function StarField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea rows={2} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function StarBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg p-3.5 bg-slate-50">
      <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-slate-500">{label}</p>
      <p className="text-sm text-slate-600 leading-relaxed">
        {body || <span className="text-slate-300">—</span>}
      </p>
    </div>
  );
}
