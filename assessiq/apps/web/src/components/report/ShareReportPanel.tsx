import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Share2, X } from 'lucide-react';
import type { ReportShareSummary } from '@assessiq/types';
import { reportsApi } from '../../api/reports.api';
import { ApiRequestError } from '../../api/client';
import { Button, Card, CardBody, Spinner } from '../ui';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Read-only links to this report, and the ability to close them off again.
 *
 * Several links rather than one is deliberate and visible here: handing the
 * same link to two people and later wanting to cut off one of them only works
 * if they were different links to begin with. A revoked link stays on the list
 * so the manager can see that it existed and is now dead.
 */
export function ShareReportPanel({ sessionId }: { sessionId: string }) {
  const [shares, setShares] = useState<ReportShareSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await reportsApi.listShares(sessionId);
      setShares(res.shares);
      // Already sharing? Then the panel opens showing it, rather than hiding
      // live links behind a button that looks like it would create a new one.
      if (res.shares.some((s) => !s.revoked_at)) setOpen(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load share links');
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const share = await reportsApi.createShare(sessionId);
      setShares((prev) => [share, ...(prev ?? [])]);
      setOpen(true);
      await navigator.clipboard.writeText(share.url).catch(() => {});
      setCopied(share.id);
      setTimeout(() => setCopied(null), 1800);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create a share link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    try {
      const updated = await reportsApi.revokeShare(shareId);
      setShares((prev) => (prev ?? []).map((s) => (s.id === shareId ? updated : s)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not revoke that link');
    }
  };

  const copy = async (share: ReportShareSummary) => {
    await navigator.clipboard.writeText(share.url);
    setCopied(share.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const live = (shares ?? []).filter((s) => !s.revoked_at);

  return (
    <Card className="mb-6">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Share2 size={15} className="text-slate-400" /> Share this report
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              A read-only link. Whoever opens it sees the scores and the reasoning — no account,
              no editing, nothing else of yours.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {shares !== null && live.length > 0 && !open && (
              <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                {live.length} active
              </Button>
            )}
            <Button variant="secondary" onClick={() => void create()} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Link2 size={15} />} Create link
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {open && shares !== null && shares.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {shares.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <code
                  className={cnTruncate(Boolean(s.revoked_at))}
                  title={s.url}
                >
                  {s.url}
                </code>
                {s.revoked_at ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    Revoked {fmtDate(s.revoked_at)}
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-400">
                      created {fmtDate(s.created_at)}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => void copy(s)}>
                      {copied === s.id ? <Check size={13} /> : <Copy size={13} />}
                      {copied === s.id ? 'Copied' : 'Copy'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void revoke(s.id)}>
                      <X size={13} /> Revoke
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// A revoked link is shown struck through rather than removed — it is evidence
// of something the manager did.
function cnTruncate(revoked: boolean): string {
  return revoked
    ? 'flex-1 truncate font-mono text-xs text-slate-400 line-through'
    : 'flex-1 truncate font-mono text-xs text-slate-600';
}
