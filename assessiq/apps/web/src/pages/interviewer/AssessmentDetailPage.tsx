import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  Gauge,
  Copy,
  Check,
  Link2,
  ArrowUpRight,
  ListChecks,
  Pencil,
  UserPlus,
  Mail,
  MailCheck,
  MailX,
  AlertTriangle,
} from 'lucide-react';
import type {
  CreateLinkResponse,
  DuplicateCandidate, AssessmentDetail, LinkStatus } from '@assessiq/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  PageHeader,
  StatCard,
  Spinner,
  EmptyState,
  difficultyTone,
} from '../../components/ui';
import { assessmentsApi } from '../../api/assessments.api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { candidateDisplayName, isUnlabeled } from '../../lib/candidateLabel';
import { cn } from '../../lib/cn';
import { ApiRequestError } from '../../api/client';

const statusMeta: Record<LinkStatus, { label: string; tone: string }> = {
  not_opened: { label: 'Not opened', tone: 'bg-slate-100 text-slate-500' },
  opened: { label: 'Opened', tone: 'bg-sky-100 text-sky-600' },
  in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-600' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-100 text-emerald-600' },
  expired: { label: 'Expired', tone: 'bg-rose-100 text-rose-600' },
};

function fullUrl(token: string): string {
  return `${window.location.origin}/a/${token}`;
}


/** Says what actually happened to the invite email. Delivery is never assumed. */
function InviteOutcome({ result }: { result: CreateLinkResponse }) {
  const name = result.candidate_label ?? 'Candidate';
  if (result.email_status === 'sent') {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <MailCheck size={15} className="mt-0.5 shrink-0" />
        Invite emailed to <strong>{result.candidate_email}</strong>.
      </p>
    );
  }
  if (result.email_status === 'failed') {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        <MailX size={15} className="mt-0.5 shrink-0" />
        <span>
          Link created for <strong>{name}</strong>, but the email to{' '}
          {result.candidate_email} did not send: {result.email_error}. Copy the link below and
          send it yourself.
        </span>
      </p>
    );
  }
  if (result.email_status === 'skipped_not_configured') {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <MailX size={15} className="mt-0.5 shrink-0" />
        Link created — email is not configured on this server, so nothing was sent. Copy the link
        below.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      <Link2 size={15} className="mt-0.5 shrink-0 text-slate-400" />
      Link created for <strong className="mx-1">{name}</strong> — copy it below.
    </p>
  );
}

export default function AssessmentDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  // Set when the API returns DUPLICATE_CANDIDATE — the manager confirms or cancels.
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  // Outcome of the last invite, so delivery is never silently assumed.
  const [inviteResult, setInviteResult] = useState<CreateLinkResponse | null>(null);
  // Inline rename — the label is the only handle on a candidate, so it has to
  // be fixable after the link exists.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await assessmentsApi.get(id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load assessment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A candidate can submit at any moment; reflect it without a manual reload.
  useLiveRefresh(load);

  const saveRename = async (linkId: string) => {
    if (!id || renaming) return;
    setRenaming(true);
    try {
      // Empty clears the label, falling back to the generated handle.
      await assessmentsApi.updateLink(id, linkId, renameDraft.trim() || null);
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not rename this candidate');
    } finally {
      setRenaming(false);
    }
  };

  const generate = async (confirmDuplicate = false) => {
    if (!id) return;
    setGenerating(true);
    setError(null);
    setInviteResult(null);
    try {
      const res = await assessmentsApi.createLink(id, {
        ...(label.trim() ? { candidate_label: label.trim() } : {}),
        ...(email.trim() ? { candidate_email: email.trim() } : {}),
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      });
      setLabel('');
      setEmail('');
      setDuplicate(null);
      setInviteResult(res);
      await load();
    } catch (err) {
      // A repeat candidate isn't an error to show — it's a question to ask.
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_CANDIDATE') {
        setDuplicate((err.body?.duplicate as DuplicateCandidate) ?? null);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not generate link');
      }
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(fullUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1600);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!detail) {
    return (
      <Card>
        <EmptyState icon={<ListChecks size={22} />} title="Assessment not found" hint={error ?? undefined} />
      </Card>
    );
  }

  const links = detail.links;
  const submitted = links.filter((l) => l.status === 'submitted');
  const scores = submitted.map((l) => l.session?.overall_score ?? 0);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const timerLabel =
    detail.timer_enabled && detail.timer_seconds
      ? `${Math.round(detail.timer_seconds / 60)}m timer`
      : 'no timer';

  return (
    <>
      <PageHeader
        title={detail.title}
        subtitle={`${detail.questions.length} questions · ${timerLabel}`}
        actions={
          <Link to="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={<Users size={18} />} label="Links / candidates" value={links.length} tone="brand" />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Completed"
          value={submitted.length}
          sub="scored & ready"
          tone="emerald"
        />
        <StatCard
          icon={<Gauge size={18} />}
          label="Avg score"
          value={avg !== null ? `${avg}%` : '—'}
          sub="all submissions"
          tone="amber"
        />
      </div>

      {/* Invite — one assessment, many candidates. */}
      <Card className="mb-6 bg-brand-soft border-brand-100">
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-brand-600" />
            <h3 className="font-semibold text-slate-800">Invite another candidate</h3>
            <span className="text-xs text-slate-500">
              — each invite is its own link, tracked separately
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="Name (optional) — e.g. Alex Chen"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Email (optional) — we'll send the link"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button onClick={() => generate()} disabled={generating}>
              {generating ? <Spinner className="border-white/40 border-t-white" /> : <Link2 size={16} />}
              {generating ? 'Creating…' : email.trim() ? 'Send invite' : 'Create link'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Both optional — leave them blank for a quick link you copy yourself.
          </p>

          {/* Duplicate warning — a question, not an error. */}
          {duplicate && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{duplicate.candidate_email}</strong>
                  {duplicate.candidate_label ? ` (${duplicate.candidate_label})` : ''} already
                  completed this assessment on{' '}
                  {new Date(duplicate.completed_at).toLocaleDateString(undefined, {
                    dateStyle: 'medium',
                  })}
                  {duplicate.overall_score !== null && <> — scored <strong>{duplicate.overall_score}%</strong></>}
                  . Send it again anyway?
                </span>
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => void generate(true)} disabled={generating}>
                  {generating ? <Spinner className="border-white/40 border-t-white" /> : null}
                  Send again
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDuplicate(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Delivery outcome — never assume it sent. */}
          {inviteResult && <InviteOutcome result={inviteResult} />}

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
              {error}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Links / candidates */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Candidate links</h3>
          <span className="text-xs text-slate-400">{links.length} total</span>
        </CardHeader>
        {links.length === 0 ? (
          <EmptyState
            icon={<Link2 size={22} />}
            title="No links yet"
            hint="Generate a link above and share it with a candidate."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {links.map((l) => {
              const meta = statusMeta[l.status];
              const name = candidateDisplayName(l);
              const editing = renamingId === l.id;
              return (
                <div key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <Avatar name={name} seed={l.token} size="sm" />
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={renameDraft}
                          placeholder="Candidate name"
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveRename(l.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="h-8 py-1 text-sm"
                        />
                        <Button size="sm" onClick={() => void saveRename(l.id)} disabled={renaming}>
                          {renaming ? <Spinner className="border-white/40 border-t-white" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRenamingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(l.id);
                          setRenameDraft(l.candidate_label ?? '');
                        }}
                        title="Rename this candidate"
                        className="group flex items-center gap-1.5 text-left"
                      >
                        <span
                          className={cn(
                            'text-sm font-medium truncate',
                            isUnlabeled(l) ? 'text-slate-500 italic' : 'text-slate-800',
                          )}
                        >
                          {name}
                        </span>
                        <Pencil
                          size={12}
                          className="shrink-0 text-slate-300 group-hover:text-brand-500"
                        />
                      </button>
                    )}
                    {l.candidate_email ? (
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <Mail size={11} className="shrink-0" />
                        {l.candidate_email}
                      </p>
                    ) : (
                      <code className="block truncate font-mono text-xs text-slate-400">
                        /a/{l.token}
                      </code>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <div className="w-12 text-right">
                    {l.session?.overall_score != null ? (
                      <span className="text-sm font-bold text-slate-800 tabular">
                        {l.session.overall_score}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => copy(l.token)}>
                    {copiedToken === l.token ? (
                      <>
                        <Check size={14} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy
                      </>
                    )}
                  </Button>
                  <div className="w-24 text-right">
                    {l.status === 'submitted' && l.session ? (
                      <Link
                        to={`/reports/${l.session.id}`}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                      >
                        View report <ArrowUpRight size={13} />
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Questions in this assessment */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Questions</h3>
          <span className="text-xs text-slate-400">{detail.questions.length} in order</span>
        </CardHeader>
        <div className="divide-y divide-slate-100">
          {detail.questions.map((q) => (
            <div key={q.question.id} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-md bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center tabular">
                {q.position + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 leading-snug">{q.question.text}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{q.question.topic}</Badge>
                  <Badge tone={difficultyTone[q.question.difficulty] ?? 'slate'}>
                    {q.question.difficulty}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
