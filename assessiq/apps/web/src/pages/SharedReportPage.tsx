import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link2Off, Sparkles } from 'lucide-react';
import type { ReportView } from '@assessiq/types';
import { ReportBody } from '../components/report/ReportBody';
import { Card, CardBody, EmptyState, Spinner } from '../components/ui';
import { reportsApi } from '../api/reports.api';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A report as someone outside the account sees it.
 *
 * READ-ONLY IN EVERY SENSE. There is no app shell, no navigation, no sidebar
 * and no route out of this page into anything else — not because those would
 * fail if clicked, but because a shared link should not suggest that a wider
 * account exists behind it. The server has already stripped the candidate
 * record (and with it their address) from what this page receives, and
 * ReportBody is rendered readOnly so no editing affordance is drawn at all.
 *
 * An expired, revoked or invented token gets one sentence and no detail.
 * Distinguishing "revoked" from "never existed" would confirm to someone
 * holding a dead link that it was once real.
 */
export default function SharedReportPage() {
  const { token } = useParams();
  const [report, setReport] = useState<ReportView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'pending' | 'gone'>('loading');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    reportsApi
      .getShared(token)
      .then((data) => {
        if (cancelled) return;
        if ('status' in data) {
          setState('pending');
        } else {
          setReport(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('gone');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (state === 'gone') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md">
          <EmptyState
            icon={<Link2Off size={22} />}
            title="This link is no longer active"
            hint="Ask whoever shared this report with you for a new link."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient">
            <Sparkles size={15} className="text-white" />
          </span>
          <span className="text-sm font-bold text-slate-800">
            Assess<span className="text-brand-600">IQ</span>
          </span>
          <span className="ml-auto text-xs text-slate-400">Shared report · read-only</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {state === 'pending' || !report ? (
          <Card>
            <CardBody className="flex flex-col items-center py-16 text-center">
              <Spinner className="mb-4 h-6 w-6" />
              <p className="text-sm font-medium text-slate-700">This report is still being scored.</p>
              <p className="mt-1 text-xs text-slate-400">Check back in a minute.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-800">
                {report.session.candidate_label ?? 'Candidate'}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {report.assessment.title} · submitted {fmtDate(report.session.submitted_at)}
              </p>
            </div>
            <ReportBody report={report} readOnly />
          </>
        )}
      </main>
    </div>
  );
}
