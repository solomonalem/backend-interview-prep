import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Github,
  ShieldCheck,
  Link2,
  Link2Off,
  Lock,
  AlertTriangle,
  CheckCircle2,
  BookLock,
  RefreshCw,
  Download,
} from 'lucide-react';
import type { IntegrationStatusResponse, SyncCandidate } from '@assessiq/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Spinner,
  EmptyState,
} from '../../components/ui';
import { integrationsApi } from '../../api/integrations.api';
import { ApiRequestError } from '../../api/client';

// What GitHub's redirect can tell us, in the manager's language. The callback
// always lands here with one of these rather than dumping JSON in the browser.
const CALLBACK_MESSAGE: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  connected: { tone: 'ok', text: 'GitHub connected. The repositories you picked are listed below.' },
  sync_ready: {
    tone: 'ok',
    text: 'GitHub confirmed your identity. Pick the installation to adopt below.',
  },
  sync_none: {
    tone: 'warn',
    text: 'GitHub says you have no installations of this app. Install it first, then sync.',
  },
  sync_failed: {
    tone: 'warn',
    text: 'The sync could not be completed — nothing was changed. Try starting it again.',
  },
  // Only for setup_action=request — an owner genuinely has to approve. Telling
  // every no-installation case this was wrong for personal accounts, which
  // have no owner to wait on.
  approval_pending: {
    tone: 'warn',
    text: 'Your organisation requires an owner to approve this app. The connection completes once they do — nothing more is needed from you.',
  },
  no_installation: {
    tone: 'warn',
    text: "GitHub sent you back without telling us which installation, so nothing changed. If the app is already installed, use “Sync from GitHub” to link it.",
  },
  unauthenticated: {
    tone: 'warn',
    text: 'Your session had expired when GitHub sent you back, so nothing was connected. Try again now that you are signed in.',
  },
  error: {
    tone: 'warn',
    text: 'GitHub sent you back, but the installation could not be completed. Nothing was saved — try connecting again.',
  },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'sync' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SyncCandidate[]>([]);

  const callback = params.get('github');
  const notice = callback ? CALLBACK_MESSAGE[callback] : undefined;

  const load = useCallback(async () => {
    try {
      setData(await integrationsApi.github());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not load your integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // After the authorisation leg, the verified installations are waiting
  // server-side. Fetch them so the manager can adopt one.
  useEffect(() => {
    if (callback !== 'sync_ready') return;
    integrationsApi
      .syncCandidates()
      .then((r) => setCandidates(r.candidates))
      .catch(() => setError('Could not load the installations GitHub confirmed.'));
  }, [callback]);

  const adopt = async (installationId: string) => {
    setBusy(installationId);
    setError(null);
    try {
      await integrationsApi.syncAdopt(installationId);
      setCandidates([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not adopt that installation.');
    } finally {
      setBusy(null);
    }
  };

  const startSync = async () => {
    setBusy('sync');
    setError(null);
    try {
      const { url } = await integrationsApi.syncStart();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not start the sync.');
      setBusy(null);
    }
  };

  // Clear the callback marker once read, so a refresh doesn't re-announce it.
  useEffect(() => {
    if (!callback) return;
    const t = setTimeout(() => {
      params.delete('github');
      setParams(params, { replace: true });
    }, 8000);
    return () => clearTimeout(t);
  }, [callback, params, setParams]);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const { url } = await integrationsApi.installUrl();
      // Full navigation, not a popup: GitHub redirects back to us afterwards.
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not start the GitHub connection.');
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setError(null);
    try {
      await integrationsApi.disconnect();
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not disconnect.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const integration = data?.integration ?? null;
  const connected = integration?.status === 'active';

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connect a repository so questions can be grounded in the system a candidate would actually work on."
      />

      {notice && (
        <div
          className={
            notice.tone === 'ok'
              ? 'mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
              : 'mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'
          }
        >
          {notice.tone === 'ok' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <Github size={16} className="text-slate-700" /> GitHub
          </h3>
          {connected ? (
            <Badge tone="emerald">Connected</Badge>
          ) : integration ? (
            <Badge tone="amber">Disconnected</Badge>
          ) : (
            <Badge tone="slate">Not connected</Badge>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          {/* What we can and cannot do, stated before they grant anything. */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: <Lock size={15} />, text: 'Read-only access to the code' },
              { icon: <ShieldCheck size={15} />, text: 'Only the repositories you pick' },
              { icon: <BookLock size={15} />, text: 'Your source code is never stored' },
            ].map((p) => (
              <div
                key={p.text}
                className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-3"
              >
                <span className="mt-0.5 shrink-0 text-brand-600">{p.icon}</span>
                <span className="text-xs text-slate-600 leading-snug">{p.text}</span>
              </div>
            ))}
          </div>

          {data && !data.configured && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">No GitHub App is configured on this server.</span>{' '}
                Connecting is unavailable until an administrator registers the app and sets{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">GITHUB_APP_ID</code>{' '}
                and{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">
                  GITHUB_APP_PRIVATE_KEY
                </code>{' '}
                — see <span className="font-medium">docs/github-app-setup.md</span>.
              </span>
            </div>
          )}

          {integration && (
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">Account</dt>
                <dd className="font-medium text-slate-700">{integration.account_login}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Connected</dt>
                <dd className="font-medium text-slate-700">{fmtDate(integration.connected_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Analysis mode</dt>
                <dd className="font-medium text-slate-700">
                  {integration.strict_mode ? 'Strict — structure only' : 'Standard'}
                </dd>
              </div>
            </dl>
          )}

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2.5 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect} disabled={busy !== null || !data?.configured}>
              {busy === 'connect' ? (
                <Spinner className="border-white/40 border-t-white" />
              ) : (
                <Link2 size={16} />
              )}
              {connected ? 'Reconnect or change repositories' : 'Connect GitHub'}
            </Button>
            {/* Recovery path. GitHub only redirects back on some install paths
                — editing an installation from GitHub's own settings page is a
                common one that doesn't — so the connection can exist there and
                be absent here. */}
            {data?.sync_available && (
              <Button variant="secondary" onClick={startSync} disabled={busy !== null}>
                {busy === 'sync' ? <Spinner /> : <RefreshCw size={16} />}
                Sync from GitHub
              </Button>
            )}
            {connected && (
              <Button variant="secondary" onClick={disconnect} disabled={busy !== null}>
                {busy === 'disconnect' ? <Spinner /> : <Link2Off size={16} />}
                Disconnect
              </Button>
            )}
            <p className="text-xs text-slate-400">
              GitHub asks you which repositories to share — we only ever see the ones you pick.
            </p>
          </div>

          {data?.configured && !data.sync_available && (
            <p className="text-xs text-slate-400">
              Already installed on GitHub but not showing here? Syncing needs{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">GITHUB_CLIENT_ID</code>{' '}
              and{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                GITHUB_CLIENT_SECRET
              </code>{' '}
              — see docs/github-app-setup.md.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Only installations GitHub confirmed belong to this manager. The server
          refuses to adopt anything outside this list. */}
      {candidates.length > 0 && (
        <Card className="mb-6 ring-1 ring-brand-200">
          <CardHeader>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Download size={16} className="text-brand-500" /> Installations GitHub confirmed are
              yours
            </h3>
            <Badge tone="brand">{candidates.length}</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-xs text-slate-400">
              Adopting links the installation to this account. Nothing is read from your code by
              doing so.
            </p>
            {candidates.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    {c.account_login}{' '}
                    <span className="font-normal text-slate-400">({c.account_type})</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {c.repository_selection === 'all' ? (
                      <span className="text-amber-600">
                        all repositories — consider narrowing this on GitHub
                      </span>
                    ) : (
                      'selected repositories'
                    )}
                  </p>
                </div>
                <Button onClick={() => adopt(c.id)} disabled={busy !== null}>
                  {busy === c.id ? (
                    <Spinner className="border-white/40 border-t-white" />
                  ) : (
                    <Download size={15} />
                  )}
                  Adopt
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Repositories</h3>
          {integration && integration.repos.length > 0 && (
            <Badge tone="slate">{integration.repos.length}</Badge>
          )}
        </CardHeader>
        <CardBody>
          {!integration || integration.repos.length === 0 ? (
            <EmptyState
              icon={<Github size={22} />}
              title={connected ? 'No repositories shared' : 'Nothing connected yet'}
              hint={
                connected
                  ? 'The installation exists but no repositories were selected. Reconnect and pick at least one.'
                  : 'Connect GitHub and pick the repositories you want questions grounded in.'
              }
            />
          ) : (
            <div className="space-y-2">
              {integration.repos.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.full_name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      default branch <span className="text-slate-500">{r.default_branch}</span>
                    </p>
                  </div>
                  {/* Scanning is Slice 2 — the button is stated as coming, not
                      shown as broken. */}
                  <Button variant="secondary" disabled title="Scanning arrives in the next slice">
                    Scan
                  </Button>
                </div>
              ))}
              {integration.status === 'revoked' && (
                <p className="pt-1 text-xs text-slate-400">
                  This integration is disconnected. The repositories above are kept for reference —
                  reconnect to scan them again.
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
