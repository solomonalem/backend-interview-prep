import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Mail,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { CandidateDetail, CandidateJourneyEntry, LinkStatus } from '@assessiq/types';
import { candidatesApi } from '../../api/candidates.api';
import { ApiRequestError } from '../../api/client';
import { SendAssessmentDialog } from '../../components/candidates/SendAssessmentDialog';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  Textarea,
  verdictLabel,
  verdictTone,
} from '../../components/ui';
import { cn } from '../../lib/cn';

const statusMeta: Record<LinkStatus, { label: string; tone: string }> = {
  not_opened: { label: 'Not started', tone: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-600' },
  in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-600' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-100 text-emerald-600' },
  expired: { label: 'Expired', tone: 'bg-rose-100 text-rose-600' },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One assessment sent to this person, and whatever became of it. */
function JourneyRow({ entry }: { entry: CandidateJourneyEntry }) {
  const [copied, setCopied] = useState(false);
  const meta = statusMeta[entry.status];

  const copy = async () => {
    await navigator.clipboard.writeText(entry.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          {entry.assessment_title}
        </span>
        <span className="block text-xs text-slate-400">sent {fmtDate(entry.sent_at)}</span>
      </span>

      <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', meta.tone)}>
        {meta.label}
      </span>

      {entry.verdict && (
        <Badge tone={verdictTone[entry.verdict] ?? 'slate'}>{verdictLabel(entry.verdict)}</Badge>
      )}

      <span className="w-12 text-right text-sm font-semibold text-slate-700 tabular">
        {entry.overall_score !== null ? `${entry.overall_score}%` : ''}
      </span>

      {/* A finished assessment offers its report; an unfinished one offers the
          link again, which is the only useful thing left to do with it. */}
      {entry.session_id && entry.status === 'submitted' ? (
        <Link to={`/reports/${entry.session_id}`}>
          <Button size="sm" variant="secondary">
            <FileText size={13} /> Report
          </Button>
        </Link>
      ) : (
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy link'}
        </Button>
      )}
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await candidatesApi.get(id);
      setCandidate(res);
      setNotes(res.notes ?? '');
      setNotesDirty(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load this candidate');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = async () => {
    if (!id || savingNotes) return;
    setSavingNotes(true);
    try {
      await candidatesApi.update(id, { notes: notes.trim() || null });
      setNotesDirty(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const saveName = async () => {
    if (!id || !nameDraft.trim()) {
      setEditingName(false);
      return;
    }
    try {
      const res = await candidatesApi.update(id, { name: nameDraft.trim() });
      setCandidate(res);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not rename this candidate');
    } finally {
      setEditingName(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      await candidatesApi.remove(id);
      navigate('/candidates');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this record');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <Card>
        <EmptyState icon={<UserRound size={22} />} title="Candidate not found" hint={error ?? undefined} />
      </Card>
    );
  }

  const submitted = candidate.journey.filter((j) => j.status === 'submitted');

  return (
    <>
      <PageHeader
        title={candidate.name}
        subtitle={candidate.email}
        actions={
          <div className="flex gap-2">
            <Link to="/candidates">
              <Button variant="secondary">
                <ArrowLeft size={15} /> All candidates
              </Button>
            </Link>
            <Button onClick={() => setSending(true)}>
              <Send size={15} /> Send an assessment
            </Button>
          </div>
        }
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Record
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-rose-600"
              >
                <Trash2 size={13} /> Delete record
              </button>
            </div>

            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(candidate.name);
                  setEditingName(true);
                }}
                className="text-left text-lg font-semibold text-slate-800 transition hover:text-brand-700"
              >
                {candidate.name}
              </button>
            )}

            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Mail size={14} /> {candidate.email}
            </p>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesDirty(true);
                }}
                onBlur={() => notesDirty && void saveNotes()}
                placeholder="Anything you want to remember about this candidate…"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {savingNotes ? 'Saving…' : notesDirty ? 'Unsaved — click away to save' : 'Saved'}
                {' · '}
                Yours only. The candidate has no account here and never sees this.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-800 tabular">
                {candidate.journey.length}
              </p>
              <p className="text-xs text-slate-400">Sent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 tabular">{submitted.length}</p>
              <p className="text-xs text-slate-400">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 tabular">
                {submitted.length > 0
                  ? `${Math.round(
                      submitted.reduce((sum, j) => sum + (j.overall_score ?? 0), 0) /
                        submitted.length,
                    )}%`
                  : '—'}
              </p>
              <p className="text-xs text-slate-400">Avg score</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">History</h3>
          <span className="text-xs text-slate-400">
            {candidate.journey.length} {candidate.journey.length === 1 ? 'assessment' : 'assessments'}
          </span>
        </div>
        {candidate.journey.length === 0 ? (
          <EmptyState
            icon={<Send size={22} />}
            title="Nothing sent yet"
            hint="Send them an assessment and it will appear here."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {candidate.journey.map((entry) => (
              <JourneyRow key={entry.link_id} entry={entry} />
            ))}
          </div>
        )}
      </Card>

      {sending && (
        <SendAssessmentDialog
          candidate={{ name: candidate.name, email: candidate.email }}
          onClose={() => setSending(false)}
          onSent={() => void load()}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-semibold text-slate-800">Delete {candidate.name}'s record?</h2>
            {/* Stated before the click, not discovered after it: "delete
                candidate" reads like it might take the assessments too. */}
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This removes the record and your notes. Every assessment you sent them stays exactly
              where it is — the links still work, the sessions and reports are untouched. They
              simply stop being filed under this person.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete record
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
