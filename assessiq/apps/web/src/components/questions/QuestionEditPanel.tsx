import { useState } from 'react';
import { Save, Tag as TagIcon, X } from 'lucide-react';
import type { QuestionDraft, UpdateQuestionRequest } from '@assessiq/types';
import { questionsApi } from '../../api/questions.api';
import { ApiRequestError } from '../../api/client';
import { Button, Input, Label, Spinner, Textarea } from '../ui';

/**
 * Edit a question and its rubric in place.
 *
 * The same four guide fields and three display fields the review panel shows,
 * on a question that is already vetted. STATUS IS NEVER TOUCHED here: fixing a
 * rubric that turned out too harsh should not un-vet the question or send it
 * back through review, and it does not.
 *
 * The panel says what editing does and does not reach, because the honest
 * answer is surprising: assessments already built from this question keep the
 * version they were built with.
 */
export function QuestionEditPanel({
  question,
  onClose,
  onSaved,
}: {
  question: QuestionDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(question.text);
  const [topic, setTopic] = useState(question.topic);
  const [core, setCore] = useState(question.core_answer_guide);
  const [senior, setSenior] = useState(question.senior_signal_guide);
  const [trap, setTrap] = useState(question.trap_guide);
  const [evidence, setEvidence] = useState(question.evidence_guide);
  const [coreD, setCoreD] = useState(question.core_answer_display);
  const [seniorD, setSeniorD] = useState(question.senior_signal_display);
  const [trapD, setTrapD] = useState(question.trap_display);
  const [tags, setTags] = useState<string[]>(question.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagDraft('');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const body: UpdateQuestionRequest = {
      text,
      topic,
      core_answer_guide: core,
      senior_signal_guide: senior,
      trap_guide: trap,
      evidence_guide: evidence,
      core_answer_display: coreD,
      senior_signal_display: seniorD,
      trap_display: trapD,
      tags,
    };
    try {
      await questionsApi.update(question.id, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this question');
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, rows = 3) => (
    <div>
      <Label>{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="font-semibold text-slate-800">Edit question</h2>
            <p className="text-xs text-slate-500">
              Stays {question.status === 'vetted' ? 'vetted' : 'a draft'} — editing never changes
              that. Assessments already built from this question keep the version they were built
              with.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {field('Question', text, setText, 3)}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Topic</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  >
                    <TagIcon size={10} /> {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={tags.length ? '' : 'add a tag…'}
                  className="min-w-[6rem] flex-1 border-0 p-0 text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Scoring rubric — private, never shown to candidates
            </p>
            <div className="space-y-3">
              {field('Core answer (25%)', core, setCore)}
              {field('Senior signal (35%)', senior, setSenior)}
              {field('Trap to avoid (25%)', trap, setTrap)}
              {field('Evidence / example (15%)', evidence, setEvidence)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Study-mode text — shown to job seekers after they answer
            </p>
            <div className="space-y-3">
              {field('Core answer', coreD, setCoreD, 2)}
              {field('Senior signal', seniorD, setSeniorD, 2)}
              {field('Trap', trapD, setTrapD, 2)}
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner className="border-white/40 border-t-white" /> : <Save size={15} />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
