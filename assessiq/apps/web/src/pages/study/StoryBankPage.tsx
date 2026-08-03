import { useRef, useState } from 'react';
import { Plus, X, ChevronDown, BookMarked, Sparkles } from 'lucide-react';
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
  EmptyState,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { stories as seedStories, type MockStory } from '../../data/mock';

const typeTone: Record<MockStory['type'], 'rose' | 'amber' | 'brand' | 'violet'> = {
  incident: 'rose',
  bug_fix: 'amber',
  feature: 'brand',
  architecture: 'violet',
};

const typeLabel: Record<MockStory['type'], string> = {
  incident: 'Incident',
  bug_fix: 'Bug fix',
  feature: 'Feature',
  architecture: 'Architecture',
};

const TYPES: MockStory['type'][] = ['bug_fix', 'feature', 'incident', 'architecture'];

// Deterministic tag suggestions per type (no Math.random).
const suggestedTags: Record<MockStory['type'], string[]> = {
  incident: ['RCA', 'On-call'],
  bug_fix: ['Reliability', 'Testing'],
  feature: ['Product', 'Delivery'],
  architecture: ['System Design', 'Scale'],
};

interface Draft {
  title: string;
  type: MockStory['type'];
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

export default function StoryBankPage() {
  const [list, setList] = useState<MockStory[]>(seedStories);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const counter = useRef(0);

  function nextId(): string {
    counter.current += 1;
    const rnd = globalThis.crypto?.randomUUID?.();
    return rnd ?? `story-${list.length + counter.current}`;
  }

  function save() {
    if (!draft.title.trim()) return;
    const story: MockStory = {
      id: nextId(),
      title: draft.title.trim(),
      type: draft.type,
      situation: draft.situation.trim(),
      task: draft.task.trim(),
      action: draft.action.trim(),
      result: draft.result.trim(),
      tags: suggestedTags[draft.type],
    };
    setList((l) => [story, ...l]);
    setDraft(emptyDraft);
    setAdding(false);
    setExpanded(story.id);
  }

  function cancel() {
    setDraft(emptyDraft);
    setAdding(false);
  }

  return (
    <>
      <PageHeader
        title="Story Bank"
        subtitle="Your STAR stories, ready to pull in behavioral rounds. Capture them while they're fresh."
        actions={
          <Button onClick={() => setAdding((a) => !a)} variant={adding ? 'secondary' : 'primary'}>
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
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as MockStory['type'] }))}
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

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!draft.title.trim()}>
                Save story
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {list.length === 0 ? (
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
                <button
                  onClick={() => setExpanded(open ? null : s.id)}
                  className="w-full text-left px-5 py-4 flex items-start gap-4"
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
