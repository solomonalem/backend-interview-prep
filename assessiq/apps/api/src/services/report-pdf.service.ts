import type { ReportProbe, ReportQuestion, ReportView } from '@assessiq/types';
import { renderPdf } from '../lib/pdf.js';
import { AppError } from '../middleware/error.middleware.js';
import { getReport, getSharedReport } from './report.service.js';

/**
 * The report as a document.
 *
 * Built from the SAME ReportView the screen renders, which is the one property
 * that matters: the PDF can lay things out differently, but it cannot show
 * different numbers, a different verdict, or an override the page doesn't have.
 *
 * It carries the same neutrality rules as the report. Nothing about a
 * repository, a grounding document or a rubric guide appears here, because
 * none of it is in the view this is built from — the export cannot leak what
 * it was never given.
 */

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

const VERDICT_LABEL: Record<string, string> = {
  Strong_Senior: 'Strong Senior',
  Approaching_Senior: 'Approaching Senior',
  Mid_Level: 'Mid Level',
  Junior: 'Junior',
};

const PROBE_FLAG_LABEL: Record<string, string> = {
  defended: 'Defended their answer',
  partially_defended: 'Partially defended',
  not_defended: 'Could not defend',
};

function bar(label: string, value: number, ai?: number): string {
  // The AI's own number stays visible beside an overridden one — the same rule
  // the screen follows, for the same reason: the override is the human's
  // judgement ON the machine's, not a replacement for it.
  const aiNote = ai !== undefined && ai !== value ? `<span class="ai">AI ${ai}%</span>` : '';
  return `<div class="bar">
    <div class="bar-head"><span>${esc(label)}</span><span class="num">${value}%${aiNote}</span></div>
    <div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>
  </div>`;
}

function probeBlock(probe: ReportProbe): string {
  if (probe.status === 'generation_failed') {
    return `<div class="probe muted">A follow-up couldn't be generated for this answer.</div>`;
  }
  const flag = probe.flag ? `<span class="chip">${esc(PROBE_FLAG_LABEL[probe.flag] ?? probe.flag)}</span>` : '';
  const answer =
    probe.status === 'unanswered' || !probe.candidate_answer
      ? `<p class="muted italic">No response was given in the time allowed.</p>`
      : `<p class="pre">${esc(probe.candidate_answer)}</p>`;
  const numbers =
    probe.defense_pct !== null
      ? `<p class="meta">Follow-up <strong>${probe.defense_pct}%</strong>${
          probe.delta !== null
            ? ` · Difference <strong>${probe.delta > 0 ? '−' : probe.delta < 0 ? '+' : ''}${Math.abs(probe.delta)}</strong>`
            : ''
        } · scored on core and senior signal only</p>`
      : '';
  return `<div class="probe">
    <p class="label">Follow-up ${flag}</p>
    <p class="q">${esc(probe.text ?? '')}</p>
    ${answer}
    ${numbers}
  </div>`;
}

function questionBlock(q: ReportQuestion): string {
  const s = q.score;
  const ovr = s?.override ?? null;
  const total = ovr?.total_pct ?? s?.total_pct ?? null;

  const answer =
    q.answer === null
      ? `<p class="muted">Not answered — the candidate did not submit a response. It does not count toward the scores above.</p>`
      : `<div class="answer">
           <p class="label">Answer${q.answer.paste_detected ? ' <span class="chip warn">Pasted into this answer</span>' : ''}</p>
           <p class="pre">${esc(q.answer.text) || '<span class="muted italic">No answer provided</span>'}</p>
           ${
             q.answer.snippet_code
               ? `<p class="label mt">Code sketch${q.answer.snippet_language && q.answer.snippet_language !== 'auto' ? ` · ${esc(q.answer.snippet_language)}` : ''} <span class="muted">· attached by the candidate, not executed</span></p>
                  <pre class="code">${esc(q.answer.snippet_code)}</pre>`
               : ''
           }
         </div>`;

  const scores = s
    ? `<div class="bars">
         ${bar('Senior signal (35%)', ovr?.senior_signal_pct ?? s.senior_signal_pct, s.senior_signal_pct)}
         ${bar('Core (25%)', ovr?.core_pct ?? s.core_pct, s.core_pct)}
         ${bar('Trap (25%)', ovr?.trap_pct ?? s.trap_pct, s.trap_pct)}
         ${bar('Evidence (15%)', ovr?.evidence_pct ?? s.evidence_pct, s.evidence_pct)}
       </div>
       <div class="cols">
         <div>
           <p class="label">What they demonstrated</p>
           <ul>${s.what_was_hit.map((h) => `<li>${esc(h)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
         </div>
         <div>
           <p class="label">What they missed</p>
           <ul>${s.what_was_missed.map((m) => `<li>${esc(m)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
         </div>
       </div>
       <p class="reason"><strong>Core:</strong> ${esc(s.core_reasoning)}</p>
       <p class="reason"><strong>Senior signal:</strong> ${esc(s.senior_signal_reasoning)}</p>
       <p class="reason"><strong>Trap:</strong> ${esc(s.trap_reasoning)}</p>
       <p class="reason"><strong>Evidence:</strong> ${esc(s.evidence_reasoning)}</p>
       <p class="probe-rec"><strong>Recommended live probe:</strong> ${esc(s.recommended_probe)}</p>`
    : '';

  const override = ovr
    ? `<div class="override">
         <p class="label">Interviewer override · ${ovr.flag === 'adjusted' ? 'score corrected' : 'disagreed with this score'}${ovr.by ? ` · ${esc(ovr.by)}` : ''}</p>
         <p>${esc(ovr.note)}</p>
         <p class="muted">The AI's original score is shown beside every number above.</p>
       </div>`
    : '';

  return `<section class="q-block">
    <div class="q-head">
      <div>
        <span class="chip">Q${q.position + 1}</span>
        <span class="chip">${esc(q.question.topic)}</span>
        <span class="chip">${esc(q.question.difficulty)}</span>
      </div>
      <div class="q-score">${total !== null ? `${total}%` : '—'}</div>
    </div>
    <p class="q-text">${esc(q.question.text)}</p>
    ${answer}
    ${q.probe ? probeBlock(q.probe) : ''}
    ${override}
    ${scores}
  </section>`;
}

function template(report: ReportView): string {
  const { session, assessment, overall, proctoring, questions } = report;
  const ov = overall.override;
  const verdict = VERDICT_LABEL[ov?.verdict ?? overall.verdict] ?? (ov?.verdict ?? overall.verdict);

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(session.candidate_label ?? 'Candidate')} — ${esc(assessment.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.55; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #64748b; font-size: 11px; margin: 0 0 16px; }
  .hero { display: flex; gap: 18px; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
  .score { font-size: 34px; font-weight: 700; line-height: 1; }
  .score small { display: block; font-size: 10px; font-weight: 500; color: #94a3b8; margin-top: 3px; }
  .verdict { font-size: 14px; font-weight: 600; }
  .hero-meta { margin-left: auto; text-align: right; color: #64748b; font-size: 10px; }
  .bars { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin: 8px 0; }
  .bar-head { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 2px; }
  .bar-head .num { font-weight: 700; color: #334155; }
  .ai { color: #94a3b8; font-weight: 500; margin-left: 5px; }
  .track { height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
  .fill { height: 100%; background: #6366f1; }
  .panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
  .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; margin: 0 0 4px; }
  .label.mt { margin-top: 8px; }
  .chip { display: inline-block; background: #f1f5f9; color: #475569; border-radius: 999px; padding: 1px 7px; font-size: 9px; font-weight: 600; margin-right: 4px; }
  .chip.warn { background: #fef3c7; color: #92400e; }
  .muted { color: #94a3b8; }
  .italic { font-style: italic; }
  .pre { white-space: pre-wrap; margin: 0; }
  .code { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; background: #0f172a; color: #e2e8f0; padding: 8px 10px; border-radius: 6px; margin: 4px 0 0; }
  /* Each question stays whole where it can — a score split across a page
     break is read as two half-facts. */
  .q-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
  .q-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .q-score { font-size: 17px; font-weight: 700; }
  .q-text { font-weight: 600; font-size: 12px; margin: 0 0 8px; }
  .answer { background: #f8fafc; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .probe { border: 1px solid #bae6fd; background: #f0f9ff; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .probe .q { font-weight: 600; margin: 0 0 5px; }
  .probe .meta { color: #64748b; font-size: 10px; margin: 5px 0 0; }
  .override { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .override p { margin: 0 0 2px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
  ul { margin: 0; padding-left: 14px; }
  li { margin-bottom: 2px; }
  .reason { margin: 3px 0 0; color: #475569; }
  .probe-rec { margin-top: 6px; padding: 6px 8px; background: #eef2ff; border-radius: 6px; }
  .foot { color: #94a3b8; font-size: 9px; margin-top: 14px; }
</style></head>
<body>
  <h1>${esc(session.candidate_label ?? 'Candidate')}</h1>
  <p class="sub">${esc(assessment.title)} · submitted ${esc(fmtDate(session.submitted_at))}${
    session.auto_submitted ? ' · auto-submitted at the time limit' : ''
  }</p>

  <div class="hero">
    <div class="score">${ov?.total_pct ?? overall.total_pct}%<small>Overall${
      ov ? ` · AI scored ${overall.total_pct}%` : ''
    }</small></div>
    <div>
      <p class="label">Verdict</p>
      <p class="verdict">${esc(verdict)}</p>
    </div>
    <div class="hero-meta">
      Time used ${Math.round(session.time_used_ms / 60000)} min<br>
      ${questions.filter((q) => q.answer === null).length} unanswered of ${questions.length}
    </div>
  </div>

  <div class="bars">
    ${bar('Senior signal (35%)', ov?.senior_signal_avg ?? overall.senior_signal_avg, overall.senior_signal_avg)}
    ${bar('Core (25%)', ov?.core_avg ?? overall.core_avg, overall.core_avg)}
    ${bar('Trap (25%)', ov?.trap_avg ?? overall.trap_avg, overall.trap_avg)}
    ${bar('Evidence (15%)', ov?.evidence_avg ?? overall.evidence_avg, overall.evidence_avg)}
  </div>

  <div class="panel">
    <p class="label">Proctoring</p>
    <p>${proctoring.tab_switch_count} tab switches · ${proctoring.focus_loss_count} focus losses · ${proctoring.paste_events.length} paste events · ${proctoring.idle_count} idle periods</p>
    <p class="muted">${esc(proctoring.context_note)}</p>
  </div>

  ${questions.map(questionBlock).join('')}

  <p class="foot">Generated ${esc(fmtDate(new Date().toISOString()))} · Scores are rubric-based and advisory; the hiring decision is the interviewer's.</p>
</body></html>`;
}

/** A filename a manager can find again on their desktop. */
function filename(report: ReportView): string {
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      // Punctuation at either end becomes a dangling dash otherwise — a title
      // like "Snippet E2E (probes all)" ended up as "…probes-all-.pdf".
      .replace(/^-+|-+$/g, '');
  const who = slug(report.session.candidate_label ?? 'candidate');
  const what = slug(report.assessment.title);
  return `assessiq-${who}-${what}.pdf`;
}

export interface RenderedReportPdf {
  pdf: Buffer;
  filename: string;
}

async function toPdf(result: { code: number; body: unknown }): Promise<RenderedReportPdf> {
  // Scoring still running: there is no report to export yet, and a PDF of a
  // half-scored session would be a document that disagrees with itself.
  if (result.code !== 200) {
    throw new AppError(409, 'REPORT_NOT_READY', 'This report is still being scored.');
  }
  const report = result.body as ReportView;
  return { pdf: await renderPdf(template(report)), filename: filename(report) };
}

/** The manager's export. Ownership is checked by getReport. */
export async function renderReportPdf(
  ownerId: string,
  sessionId: string,
): Promise<RenderedReportPdf> {
  return toPdf(await getReport(ownerId, sessionId));
}

/**
 * The shared export, from a share token.
 *
 * Goes through getSharedReport, so it is the same document minus the candidate
 * record — the export cannot expose what the shared view already withholds.
 */
export async function renderSharedReportPdf(token: string): Promise<RenderedReportPdf> {
  return toPdf(await getSharedReport(token));
}
