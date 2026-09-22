# AssessIQ — Build: Candidate-Side Robustness

## (answer autosave + expiry grace · link expiry + reminders · preview as candidate)

> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_CANDIDATE_ROBUSTNESS.md and build it."
> Prerequisite: PR #32 (post-assessment layer) merged to develop.

Branch: feat/candidate-robustness off develop. Conventional commits. PR to develop.
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## Why this wave exists

Three gaps a real candidate or manager hits immediately: work lost at timer-zero, links that
never expire, and sending an assessment blind. All three are pre-existing behavior, not new
ideas — this wave closes them before anyone real touches the product.

═══════════════════════════════════════════════
PART 1 — Answer autosave + expiry grace (follow-up #9 — most important)
═══════════════════════════════════════════════

### The problem

At timer zero the client submits the session; anything typed but not submitted — prose AND
code snippet — is discarded. A candidate can lose 8 minutes of work. This is the single
worst thing in the candidate experience today.

### 1.1 Draft autosave

- While a question is open, the client saves a draft (answer text + snippet + language) to
  the server: debounced ~3s after the last keystroke, and immediately on blur/tab-switch and
  before navigating between questions.
- New endpoint: PUT /candidate/sessions/:id/questions/:qid/draft (session-token auth, same
  as answering). Stores on the Answer row as draft fields (draft_text, draft_snippet,
  draft_snippet_language, draft_saved_at) — a draft is NOT an answer; scoring ignores drafts.
- On reload/reconnect the draft is restored into the boxes, with a quiet "Draft restored" note.
- Autosave never blocks typing; failures retry silently and surface only as a small
  "Unsaved changes" indicator if saves keep failing.

### 1.2 Expiry behavior

- At timer zero (client) or session expiry (server): the current question's latest DRAFT is
  promoted to its answer before the session submits. If a draft exists and no answer was
  submitted, the draft becomes the answer, flagged answer_source: 'draft_at_expiry' (visible
  on the report as "Auto-submitted from draft at time-up").
- Server-side GRACE WINDOW: EXPIRY_GRACE_SECONDS = 10 (named constant). The server accepts a
  final answer/draft write for up to 10s past expiry, to absorb clock skew and the last
  autosave in flight. Nothing beyond that; the grace never extends the visible timer.
- PROCTORING: grace-window writes are recorded (a behavior event 'late_write' with the
  seconds-past-expiry), so the report can show it as context. Do not treat it as a flag by
  default — it is expected mechanics — but make it visible for honesty.
- Existing "Time's up" overlay text updates to say drafts were saved and submitted.

### 1.3 Also fix (pre-existing, from the follow-up list)

- A server-expired session must enqueue scoring exactly like a normal submit. Today it
  doesn't. Fix it here since expiry handling is being touched.

═══════════════════════════════════════════════
PART 2 — Link expiry + reminders
═══════════════════════════════════════════════

### 2.1 Link expiry

- AssessmentLink gains expires_at (nullable). Builder/invite gets "Link valid for: 3 / 7 /
  14 days / no expiry" (default 7 days, named constant). Existing links: NULL = no expiry.
- An expired, never-started link shows a clean "This assessment link has expired — contact
  the person who sent it" page. A link already in progress is NOT cut off by expires_at
  (the session timer governs once started).
- Candidate page journey and dashboard rows show "expires in N days" / "expired".
- Manager can extend an expired link (sets a new expires_at) from the link row.

### 2.2 Reminders (uses existing Resend integration)

- Manual first: "Send reminder" button on any not-started link with an email → one email
  ("You have an assessment waiting — link expires <date>"). Records reminder_sent_at; a
  second send is allowed but the button shows the last-sent time.
- Automatic, opt-in per assessment: "Remind candidates who haven't started after N days
  (default 3)". Implement as a BullMQ repeat job (daily sweep) that sends at most ONE
  automatic reminder per link, never to expired links, never to links without email.
- Same email guardrails as everything else: if RESEND isn't configured, reminders are
  skipped visibly, never crash. Domain-unverified sends fail visibly per existing pattern.

═══════════════════════════════════════════════
PART 3 — Preview as candidate
═══════════════════════════════════════════════

- On Assessment Detail: "Preview as candidate" opens the exact candidate flow in a PREVIEW
  session: instructions page (with proctoring + probes disclosures as configured), timer,
  questions, snippet box, probes if enabled — everything the candidate sees.
- Preview sessions are marked is_preview: true and are excluded from: scoring queues,
  dashboards, candidate records, analytics, and the report list. No email, no link token
  reuse — preview is opened directly by the authenticated manager.
- Preview is banner-labelled ("PREVIEW — nothing here is recorded") on every screen.
- Probes in preview: generated for real (the manager should see what a probe looks like),
  but never scored. Cost is the manager's own, expected.
- Preview sessions auto-delete after 24h (cleanup job or on-next-preview cleanup — flag which).

═══════════════════════════════════════════════
WHAT NOT TO DO
═══════════════════════════════════════════════

- The grace window never extends the visible timer or lets a candidate keep typing past zero.
- Drafts are never scored, never shown in reports as answers (only the expiry-promoted one,
  clearly labelled).
- No reminder spam: max one automatic reminder per link, manual sends logged.
- Preview never touches real data paths — no scores, no records, no analytics rows.
- Do not change question generation, grounding, probes logic, or the report beyond the
  new labels/context described above.

═══════════════════════════════════════════════
ACCEPTANCE (what the human will test)
═══════════════════════════════════════════════

1. Type an answer + snippet, reload the page → both restored with "Draft restored".
2. Type an answer, let the timer hit zero without submitting → the report shows that answer
   labelled "Auto-submitted from draft at time-up"; nothing lost.
3. Server-expired session (let it lapse server-side) → scoring runs; report renders.
4. Create a link with 3-day expiry → row shows "expires in 3 days"; set expires_at in the
   past in the DB → link shows the expired page; extend it → works again.
5. "Send reminder" on a not-started link → email attempt visible (sent/failed/skipped per
   Resend state), reminder_sent_at recorded.
6. Enable auto-reminders (N=0 for testing or run the sweep manually) → exactly one automatic
   reminder per eligible link; expired/no-email links skipped.
7. "Preview as candidate" → the full candidate flow with the PREVIEW banner, probes appear
   if enabled; afterwards no session appears in dashboard, records, or analytics.
8. Grace: an autosave fired within 10s past expiry is accepted and the late_write event shows
   on the report as context; one fired at 15s is rejected.

Report what changed, flag decisions (grace value, sweep cadence, preview cleanup), verify
commits landed, end with "PR is final — safe to merge".
