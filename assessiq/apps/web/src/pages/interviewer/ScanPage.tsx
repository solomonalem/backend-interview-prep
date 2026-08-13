import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Layers,
  AlertTriangle,
  Puzzle,
  Building2,
  FileCode2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { FindingKind, FindingView, ScanFindingsResponse } from '@assessiq/types';
import { FINDING_KINDS } from '@assessiq/types';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Spinner,
  EmptyState,
} from '../../components/ui';
import { integrationsApi } from '../../api/integrations.api';
import { ApiRequestError } from '../../api/client';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';

// Each kind answers a different interview question, so they are grouped rather
// than listed — a manager scanning for risks shouldn't have to read the stack.
const KIND_META: Record<
  FindingKind,
  { label: string; icon: React.ReactNode; tone: 'brand' | 'amber' | 'rose' | 'sky' | 'violet'; blurb: string }
> = {
  architecture: {
    label: 'Architecture',
    icon: <Layers size={15} />,
    tone: 'brand',
    blurb: 'How the pieces fit together and talk to each other',
  },
  pattern: {
    label: 'Patterns',
    icon: <Puzzle size={15} />,
    tone: 'violet',
    blurb: 'Deliberate techniques the team has chosen',
  },
  risk: {
    label: 'Risks',
    icon: <AlertTriangle size={15} />,
    tone: 'rose',
    blurb: 'What will bite under load, failure or concurrency',
  },
  stack: {
    label: 'Stack',
    icon: <Boxes size={15} />,
    tone: 'sky',
    blurb: 'What it is built on, and where that constrains design',
  },
  domain: {
    label: 'Domain',
    icon: <Building2 size={15} />,
    tone: 'amber',
    blurb: 'What the business is and what the entities mean',
  },
};

const RUNNING = ['queued', 'cloning', 'analyzing'];

const STATUS_TEXT: Record<string, string> = {
  queued: 'Queued — waiting for a worker',
  cloning: 'Fetching a snapshot of the repository',
  analyzing: 'Reading the selected files',
  done: 'Complete',
  failed: 'Failed',
};

function Citation({ f }: { f: FindingView }) {
  if (!f.file_path) return null;
  const range =
    f.line_start != null ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `–${f.line_end}` : ''}` : '';
  return (
    <div className="mt-2.5">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <FileCode2 size={12} />
        <span className="font-mono text-[11px] text-slate-500">
          {f.file_path}
          {range}
        </span>
      </p>
      {f.excerpt && (
        <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <code>{f.excerpt}</code>
        </pre>
      )}
    </div>
  );
}

export default function ScanPage() {
  const { id } = useParams();
  const [data, setData] = useState<ScanFindingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await integrationsApi.findings(id));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.status === 404
          ? 'not_found'
          : 'Could not load this scan.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = !!data && RUNNING.includes(data.scan.status);
  // Poll only while there is something to watch — a finished scan never changes.
  useLiveRefresh(load, { intervalMs: 3_000, enabled: running });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error === 'not_found' || !data) {
    return (
      <Card>
        <EmptyState
          icon={<FileCode2 size={22} />}
          title="Scan not available"
          hint="This scan either doesn't exist or isn't yours."
        />
      </Card>
    );
  }

  const { scan, findings } = data;
  const stats = scan.stats;

  return (
    <>
      <PageHeader
        title={scan.repo_full_name || 'Repository scan'}
        subtitle={STATUS_TEXT[scan.status] ?? scan.status}
        actions={
          <Link
            to="/settings/integrations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft size={15} /> Integrations
          </Link>
        }
      />

      {running && (
        <Card className="mb-6 border-brand-200 bg-brand-soft">
          <CardBody className="flex items-start gap-3">
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-brand-600" />
            <div>
              <p className="text-sm font-medium text-slate-800">
                {STATUS_TEXT[scan.status] ?? 'Working'}…
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This page updates itself. Your code is analysed in a temporary workspace and
                deleted the moment the scan finishes — only the findings below are kept.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {scan.status === 'failed' && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Scan failed.</span> {scan.error ?? 'No detail recorded.'}
          </span>
        </div>
      )}

      {scan.partial && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">Partial results.</span> Some batches failed, so these
            findings are real but do not cover the whole selection. Re-scanning may fill the gaps.
          </span>
        </div>
      )}

      {stats && (
        <Card className="mb-6">
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Files in repo', value: stats.files_seen },
                { label: 'Selected to read', value: stats.files_selected },
                { label: 'Analysed', value: stats.files_analyzed },
                { label: 'Tokens used', value: stats.tokens_used.toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                  <p className="text-lg font-bold leading-none text-slate-800 tabular">{s.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
            {/* The ratio is the whole design: cheap code picks, the model reads little. */}
            {stats.files_seen > 0 && (
              <p className="text-xs text-slate-400">
                The model read{' '}
                <span className="font-medium text-slate-600">
                  {((stats.files_selected / stats.files_seen) * 100).toFixed(1)}%
                </span>{' '}
                of the repository — the rest was ruled out before any AI ran.
              </p>
            )}
            {(stats.stack.length > 0 || stats.libraries.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">Detected:</span>
                {stats.stack.map((s) => (
                  <Badge key={s} tone="brand">
                    {s}
                  </Badge>
                ))}
                {stats.libraries.map((l) => (
                  <Badge key={l} tone="slate">
                    {l}
                  </Badge>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCode2 size={22} />}
            title={running ? 'No findings yet' : 'No findings'}
            hint={
              running
                ? 'Findings appear as the analysis completes.'
                : 'The analyser found nothing notable enough to build a question from. A very small or very generic repository can legitimately produce this.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">Findings</h2>
            <span className="text-xs text-slate-400">
              {findings.length} across {new Set(findings.map((f) => f.kind)).size} categories
            </span>
          </div>

          {FINDING_KINDS.filter((k) => findings.some((f) => f.kind === k)).map((kind) => {
            const meta = KIND_META[kind];
            const group = findings.filter((f) => f.kind === kind);
            return (
              <Card key={kind}>
                <CardHeader>
                  <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                    <span className="text-brand-500">{meta.icon}</span> {meta.label}
                  </h3>
                  <Badge tone={meta.tone}>{group.length}</Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <p className="text-xs text-slate-400">{meta.blurb}</p>
                  {group.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3.5"
                    >
                      <p className="text-sm font-semibold text-slate-800">{f.title}</p>
                      <p className="mt-1 max-w-[95ch] text-sm leading-relaxed text-slate-600">
                        {f.detail}
                      </p>
                      <Citation f={f} />
                    </div>
                  ))}
                </CardBody>
              </Card>
            );
          })}

          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>
              These are derived observations, not your source. The repository was analysed in a
              temporary workspace that has been deleted; nothing beyond the text above and the
              citations was stored.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
