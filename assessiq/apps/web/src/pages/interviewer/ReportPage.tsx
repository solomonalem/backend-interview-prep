import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, Send } from 'lucide-react';
import type { ReportView, SetScoreOverrideRequest } from '@assessiq/types';
import { Button, Card, CardBody, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { ReportBody } from '../../components/report/ReportBody';
import { ShareReportPanel } from '../../components/report/ShareReportPanel';
import { SendAssessmentDialog } from '../../components/candidates/SendAssessmentDialog';
import { reportsApi } from '../../api/reports.api';
import { ApiRequestError } from '../../api/client';

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
 * The manager's view of a report: loading, polling while scoring finishes, the
 * header, and the two things only an owner can do — override a score, and hand
 * the report to someone else.
 *
 * What the report LOOKS like lives in ReportBody, which the shared read-only
 * page renders too.
 */
export default function ReportPage() {
  const { id } = useParams(); // session id
  const [report, setReport] = useState<ReportView | null>(null);
  // Part of the same flow as the candidate page's button — same dialog, same
  // endpoint, this candidate already chosen.
  const [sendingAnother, setSendingAnother] = useState(false);
  const [pending, setPending] = useState<{ scored: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await reportsApi.get(id);
        if (cancelled) return;
        if ('status' in data) {
          setPending({ scored: data.answers_scored, total: data.total_answers });
          timer.current = setTimeout(load, 3000); // poll while scoring
        } else {
          setReport(data);
          setPending(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiRequestError && err.status === 404 ? 'not_found' : 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  // Both write paths return the whole report, because an override also moves
  // the session total and verdict. Re-deriving those on the client would let
  // the page drift from the server's arithmetic.
  const saveOverride = async (questionId: string, body: SetScoreOverrideRequest) => {
    if (!id) return;
    setReport(await reportsApi.setOverride(id, questionId, body));
  };

  const removeOverride = async (questionId: string) => {
    if (!id) return;
    setReport(await reportsApi.clearOverride(id, questionId));
  };

  if (loading && !pending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<FileText size={22} />}
          title={error === 'not_found' ? 'Report not available' : 'Could not load report'}
          hint={
            error === 'not_found'
              ? "This session either doesn't exist, hasn't been submitted, or isn't yours."
              : 'Something went wrong fetching the report.'
          }
        />
      </Card>
    );
  }

  if (pending) {
    return (
      <>
        <PageHeader title="Report" subtitle="Scoring in progress…" />
        <Card>
          <CardBody className="flex flex-col items-center justify-center py-16 text-center">
            <Spinner className="h-6 w-6 mb-4" />
            <p className="text-sm font-medium text-slate-700">Scoring answers…</p>
            <p className="mt-1 text-xs text-slate-400">
              {pending.scored} of {pending.total} scored — this page refreshes automatically.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  if (!report) return null;
  const { session, assessment } = report;

  return (
    <>
      <PageHeader
        title={
          // The name links to the person's record when there is one — a report
          // is one event in a history, and the history is a click away.
          session.candidate ? (
            <Link
              to={`/candidates/${session.candidate.id}`}
              className="transition hover:text-brand-700"
            >
              {session.candidate_label ?? session.candidate.name}
            </Link>
          ) : (
            (session.candidate_label ?? 'Candidate')
          )
        }
        subtitle={`${assessment.title} · submitted ${fmtDate(session.submitted_at)}`}
        actions={
          <div className="flex gap-2">
            {session.candidate && (
              <Button variant="secondary" onClick={() => setSendingAnother(true)}>
                <Send size={15} /> Send another assessment
              </Button>
            )}
            <Button variant="secondary" disabled title="coming soon">
              <Download size={16} /> Download PDF
            </Button>
          </div>
        }
      />

      {sendingAnother && session.candidate && (
        <SendAssessmentDialog
          candidate={{ name: session.candidate.name, email: session.candidate.email }}
          onClose={() => setSendingAnother(false)}
        />
      )}
      <ShareReportPanel sessionId={session.id} />

      <ReportBody
        report={report}
        onSaveOverride={saveOverride}
        onClearOverride={removeOverride}
      />
    </>
  );
}
