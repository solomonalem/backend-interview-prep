import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
