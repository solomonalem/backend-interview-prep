import { useEffect, useState } from 'react';
import { AlertTriangle, LayoutTemplate, Trash2, X } from 'lucide-react';
import type { TemplateDetail, TemplateSummary } from '@assessiq/types';
import { templatesApi } from '../../api/templates.api';
import { ApiRequestError } from '../../api/client';
import { Button, Spinner } from '../ui';
import { cn } from '../../lib/cn';

/**
 * Pick a starting point.
 *
 * A template never creates anything: choosing one fills the builder in and
 * hands it back to the manager, who still reads what is being asked and still
 * presses create. The dialog says so, because "start from a template" in most
 * products means "and it's done".
 */
export function TemplatePicker({
  onApply,
  onClose,
}: {
  onApply: (template: TemplateDetail) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    templatesApi
      .list()
      .then((r) => setTemplates(r.templates))
      .catch(() => setError('Could not load templates'));
  };
  useEffect(load, []);

  const apply = async (id: string) => {
    if (applying) return;
    setApplying(id);
    setError(null);
    try {
      onApply(await templatesApi.get(id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not open that template');
    } finally {
      setApplying(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await templatesApi.remove(id);
      load();
    } catch {
      setError('Could not delete that template');
    }
  };

  const builtIns = (templates ?? []).filter((t) => t.built_in);
  const mine = (templates ?? []).filter((t) => !t.built_in);

  const row = (t: TemplateSummary) => (
    <div
      key={t.id}
      className="flex items-start gap-3 rounded-lg border border-slate-200 px-3.5 py-3 transition hover:border-brand-300 hover:bg-brand-50/30"
    >
      <button type="button" onClick={() => void apply(t.id)} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold text-slate-800">{t.title}</p>
        {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
        <p className="mt-1 text-[11px] text-slate-400 tabular">
          {t.question_count} questions
          {t.timer_minutes ? ` · ${t.timer_minutes}m` : ' · no timer'}
          {t.probes_mode !== 'off' && ` · follow-ups ${t.probes_mode === 'all' ? 'on every answer' : 'where flagged'}`}
        </p>
      </button>
      {applying === t.id && <Spinner className="mt-1 h-4 w-4" />}
      {!t.built_in && applying !== t.id && (
        <button
          type="button"
          onClick={() => void remove(t.id)}
          title="Delete this template"
          className="mt-0.5 rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-800">
              <LayoutTemplate size={16} className="text-brand-500" /> Start from a template
            </h2>
            <p className="text-xs text-slate-500">
              Fills the builder in — nothing is created until you press the button.
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
          {templates === null ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Ready to send
                </p>
                {builtIns.map(row)}
                {builtIns.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No built-in templates — run <code>npm run db:seed</code> to add them.
                  </p>
                )}
              </div>
              {mine.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Yours
                  </p>
                  {mine.map(row)}
                </div>
              )}
            </>
          )}
          {error && (
            <p className={cn('flex items-center gap-1.5 text-sm text-rose-600')}>
              <AlertTriangle size={14} /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
