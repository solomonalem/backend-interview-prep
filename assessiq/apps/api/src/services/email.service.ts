import { Resend } from 'resend';
import type { InviteEmailStatus } from '@assessiq/types';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

/**
 * Sends a candidate their assessment link.
 *
 * Returns a status rather than throwing, because failing to email must never
 * lose the link — it is already created and the manager can still copy it. The
 * caller surfaces the status so a failure is visible instead of silent.
 *
 * Note for local testing: on Resend's free tier without a verified domain,
 * delivery only succeeds to the account's own address. Anything else comes
 * back as a 4xx here and surfaces as 'failed' with the provider's message.
 */
export async function sendCandidateInvite(
  to: string,
  /** `expiresAt` is null when the link never expires — see the body below. */
  data: { assessmentTitle: string; fromName: string; url: string; expiresAt: string | null },
): Promise<{ status: InviteEmailStatus; error?: string }> {
  const subject = `You've been invited to a technical assessment: ${data.assessmentTitle}`;
  if (!resend) {
    console.log(`[email] (stub, no RESEND_API_KEY) → ${to}: ${subject} · ${data.url}`);
    return { status: 'skipped_not_configured' };
  }

  // Only stated when true. A link with no expiry must not be described as
  // expiring — inventing a deadline to make someone hurry is a small lie.
  const expires = data.expiresAt
    ? new Date(data.expiresAt).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  try {
    const res = await resend.emails.send({
      from: 'AssessIQ <invites@assessiq.app>',
      to,
      subject,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1e293b">
  <p>Hi,</p>
  <p><strong>${escapeHtml(data.fromName)}</strong> has invited you to complete a technical assessment:</p>
  <p style="font-size:17px;font-weight:600;margin:18px 0">${escapeHtml(data.assessmentTitle)}</p>
  <p style="margin:24px 0">
    <a href="${data.url}" style="background:#4f46e5;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Start the assessment</a>
  </p>
  <p style="color:#64748b;font-size:13px">
    This link is personal to you${expires ? ` and expires on ${escapeHtml(expires)}` : ''}.<br>
    If the button doesn't work, paste this into your browser:<br>
    <span style="word-break:break-all">${data.url}</span>
  </p>
</div>`,
    });
    // The SDK resolves with an `error` field rather than throwing on 4xx.
    if (res.error) {
      console.error('[email] invite rejected by provider:', res.error);
      return { status: 'failed', error: res.error.message ?? 'The email provider rejected it.' };
    }
    return { status: 'sent' };
  } catch (err) {
    console.error('[email] invite send threw:', err);
    return { status: 'failed', error: err instanceof Error ? err.message : 'Could not send email.' };
  }
}

// Notifies the interviewer that a report is ready. No-ops with a log line when
// RESEND_API_KEY is unset so local runs don't attempt outbound email.
export async function sendReportReady(
  to: string,
  data: { candidateLabel: string; overallPct: number; verdict: string; reportUrl: string },
): Promise<void> {
  const subject = `Assessment complete: ${data.candidateLabel} — ${data.overallPct}%`;
  if (!resend) {
    console.log(`[email] (stub, no RESEND_API_KEY) → ${to}: ${subject} · ${data.reportUrl}`);
    return;
  }
  await resend.emails.send({
    from: 'AssessIQ <reports@assessiq.app>',
    to,
    subject,
    html: `<p><strong>${data.candidateLabel}</strong> finished their assessment.</p>
<p>Overall: <strong>${data.overallPct}%</strong> — ${data.verdict.replace(/_/g, ' ')}</p>
<p><a href="${data.reportUrl}">View the full report</a></p>`,
  });
}

/**
 * A nudge for someone who was invited and never started.
 *
 * Same contract as the invite: returns a status rather than throwing, because
 * failing to send a reminder must never break the thing that triggered it —
 * a manager clicking a button, or a nightly sweep walking a list.
 */
export async function sendAssessmentReminder(
  to: string,
  data: { assessmentTitle: string; fromName: string; url: string; expiresAt: string | null },
): Promise<{ status: InviteEmailStatus; error?: string }> {
  const subject = `Reminder: your technical assessment is waiting — ${data.assessmentTitle}`;
  if (!resend) {
    console.log(`[email] (stub, no RESEND_API_KEY) → ${to}: ${subject} · ${data.url}`);
    return { status: 'skipped_not_configured' };
  }

  // Only mentioned when there is one. Inventing urgency for a link that never
  // expires would be a small lie told to make someone hurry.
  const expiryLine = data.expiresAt
    ? `<p style="color:#64748b;font-size:13px">This link expires on ${escapeHtml(
        new Date(data.expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      )}.</p>`
    : '';

  try {
    const res = await resend.emails.send({
      from: 'AssessIQ <invites@assessiq.app>',
      to,
      subject,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1e293b">
  <p>Hi,</p>
  <p>Just a reminder that <strong>${escapeHtml(data.fromName)}</strong> invited you to complete a technical assessment, and it is still waiting for you:</p>
  <p style="font-size:17px;font-weight:600;margin:18px 0">${escapeHtml(data.assessmentTitle)}</p>
  <p style="margin:24px 0">
    <a href="${data.url}" style="background:#4f46e5;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Start the assessment</a>
  </p>
  ${expiryLine}
  <p style="color:#64748b;font-size:13px">
    If the button doesn't work, paste this into your browser:<br>
    <span style="word-break:break-all">${data.url}</span>
  </p>
</div>`,
    });
    if (res.error) {
      console.error('[email] reminder rejected by provider:', res.error);
      return { status: 'failed', error: res.error.message ?? 'The email provider rejected it.' };
    }
    return { status: 'sent' };
  } catch (err) {
    console.error('[email] reminder failed:', err);
    return { status: 'failed', error: (err as Error).message };
  }
}
