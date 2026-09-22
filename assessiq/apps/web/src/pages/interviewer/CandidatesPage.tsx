import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserPlus, Users } from 'lucide-react';
import type { CandidateListItem } from '@assessiq/types';
import { candidatesApi } from '../../api/candidates.api';
import { ApiRequestError } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Spinner,
  verdictLabel,
  verdictTone,
} from '../../components/ui';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The manager's people.
 *
 * Note what this page is not: it is not a login list, a portal, or anything
 * the people on it can see. Every row is a record its subject will never know
 * exists — they were sent a link and they clicked it.
 */
export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateListItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q?: string) => {
    try {
      const res = await candidatesApi.list(q);
      setCandidates(res.candidates);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load candidates');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Search runs on the server so it covers records with no activity yet.
  useEffect(() => {
    const id = setTimeout(() => void load(search.trim() || undefined), 250);
    return () => clearTimeout(id);
  }, [search, load]);

  const add = async () => {
    if (!name.trim() || !email.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await candidatesApi.create({ name: name.trim(), email: email.trim() });
      setName('');
      setEmail('');
      setAdding(false);
      await load(search.trim() || undefined);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add this candidate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Everyone you've assessed — and everything you've sent them."
        actions={
          <Button onClick={() => setAdding((v) => !v)}>
            <UserPlus size={16} /> Add candidate
          </Button>
        }
      />

      {adding && (
        <Card className="mb-5">
          <CardBody className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Kim" />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                onKeyDown={(e) => e.key === 'Enter' && void add()}
              />
            </div>
            <Button onClick={() => void add()} disabled={!name.trim() || !email.trim() || saving}>
              {saving ? <Spinner className="border-white/40 border-t-white" /> : 'Save'}
            </Button>
          </CardBody>
        </Card>
      )}

      <Card className="mb-5">
        <CardBody className="py-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>
        </CardBody>
      </Card>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <Card>
        {candidates === null ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={search ? 'No candidates match that' : 'No candidates yet'}
            hint={
              search
                ? undefined
                : 'Records appear on their own whenever you send an assessment to an email address.'
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {candidates.map((c) => (
              <Link
                key={c.id}
                to={`/candidates/${c.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{c.email}</span>
                </span>
                <span className="hidden w-28 text-xs text-slate-500 sm:block tabular">
                  {c.assessments_sent} sent
                </span>
                <span className="hidden w-24 text-xs text-slate-400 sm:block tabular">
                  {fmtDate(c.last_activity_at)}
                </span>
                <span className="w-36 text-right">
                  {c.latest_verdict ? (
                    <Badge tone={verdictTone[c.latest_verdict] ?? 'slate'}>
                      {verdictLabel(c.latest_verdict)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </span>
                <span className="w-12 text-right text-sm font-semibold text-slate-700 tabular">
                  {c.latest_score !== null ? `${c.latest_score}%` : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
