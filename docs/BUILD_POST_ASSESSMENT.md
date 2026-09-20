# AssessIQ — Build: The Post-Assessment Layer

## (candidate records · send another test · shareable report link · PDF export)

> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_POST_ASSESSMENT.md and build it."
> Prerequisite: PR #31 (code snippet) merged to develop.

Branch: feat/post-assessment off develop. Conventional commits. PR to develop.
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## The wave in one line

The candidate becomes a first-class record the manager manages — every test sent, every score,
one page — while the candidate themself NEVER gets an account or a login: magic links only.
Plus the report learns to travel: a read-only share link and a PDF.

## Design principle (repeat in the PR body)

Candidates click links; managers keep records. No candidate accounts, no candidate passwords,
no candidate login — ever, in this wave. The record is the manager's CRM view; the candidate
never sees or needs it.

═══════════════════════════════════════════════
PART 1 — Candidate records (the core)
═══════════════════════════════════════════════

### 1.1 Data model

- New model Candidate { id, owner_id (manager), name (String), email (String, stored
  lowercase), notes (Text, nullable), created_at, updated_at }.
  Unique on (owner_id, email) — one record per email per manager.
- AssessmentLink gains candidate_id (nullable, SetNull) alongside the existing
  candidate_label / candidate_email fields. Existing links untouched by the migration.

### 1.2 Creation — two paths, both cheap

- Explicit: a Candidates section (nav item) with "Add candidate" (name + email + notes).
- Automatic: whenever a link is created with an email, find-or-create the Candidate for
  (owner, email) and attach candidate_id. The label/name fills from the link's label if the
  record is new. This means records accrete from normal use with zero extra work.
- BACKFILL: one-time migration script (or idempotent startup task — your call, flag it)
  that walks existing links with candidate_email and creates/attaches Candidate records,
  so history appears retroactively. State how many rows it touched.

### 1.3 The candidate page (the payoff screen)

- List view: the manager's candidates — name, email, # assessments sent, last activity,
  latest verdict. Searchable by name/email.
- Detail view — the journey:
  Alex Kim · alex@x.com · [notes, inline editable]
  ┌ Screening — sent Aug 30 — Submitted — 78% — Verdict: Senior — [Report]
  ├ System Design — sent Sep 4 — Submitted — 84% — Strong Senior — [Report]
  └ Backend Deep-Dive — sent Sep 9 — Not started — [Copy link] [Resend email]
  Every link ever sent to this email (via candidate_id, falling back to email match for
  pre-backfill stragglers), newest first, with per-link status/score/verdict and a jump
  to each report.
- Dashboard/report surfaces: wherever a candidate label shows today, link it to the
  candidate page when a record exists.

### 1.4 Rules

- Deleting a Candidate record does NOT delete links, sessions, scores or reports —
  candidate_id nulls out (SetNull) and the links revert to standalone. Confirm dialog says so.
- Email edit on a record: allowed, but flag in the PR how collisions are handled
  (merging two records is OUT of scope — reject an edit that collides, with a message).
- Duplicate detection (existing 409 flow) keeps working unchanged; it may additionally
  mention the candidate page in its message if cheap.

═══════════════════════════════════════════════
PART 2 — Send another test
═══════════════════════════════════════════════

- On the candidate detail page: "Send an assessment" → picker of the manager's assessments
  (title + question count) → creates a link pre-filled with the record's name/email →
  same email/copy-link behavior as today, same duplicate warning if they completed it before.
- On a completed report: a "Send another assessment" action that jumps into the same picker
  with this candidate pre-selected.
- No new link mechanics — this is a shortcut into the existing invite flow with identity
  pre-filled and candidate_id attached.

═══════════════════════════════════════════════
PART 3 — Shareable report link
═══════════════════════════════════════════════

- Per session report: "Share report" generates a READ-ONLY share link — same signed-token
  pattern as candidate links (unguessable token, no viewer account needed).
- New model ReportShare { id, session_id, token (unique), created_by, created_at,
  revoked_at (nullable) }. Multiple shares per report allowed; each independently revocable
  from the report page ("Shared links" list with revoke buttons).
- The shared view renders the report READ-ONLY: no override controls, no send-another, no
  candidate-page links, no edit affordances of any kind. It shows the AI scores, any
  existing override (transparency stands), proctoring context, probes/deltas, snippets.
- What the share must NOT expose: the manager's dashboard, other candidates, question \_guide
  fields beyond what the report already shows, or any mutation endpoint. The share token
  authorizes exactly one session's report view and nothing else — enforce server-side, and
  state in the PR how (a distinct auth path, not a widened session check).
- Revoked share → clean "This link is no longer active" page, 404-style, no detail leak.

═══════════════════════════════════════════════
PART 4 — PDF export
═══════════════════════════════════════════════

- "Download PDF" on the report (manager view AND shared view): server-side render of the
  report to PDF — headline scores, verdict, per-question breakdown with reasoning,
  probe/defense deltas, snippets (monospace, no highlighting needed), proctoring context,
  override transparency (both numbers), generated-on timestamp.
- Implementation: your call between Puppeteer-rendering the existing report route (with a
  print stylesheet) vs a dedicated PDF template — flag the choice and its tradeoff. Keep
  the dependency footprint sane; if Puppeteer, it must not ship into the web bundle and
  must not run per-request unbounded (queue it or cap concurrency — flag which).
- The PDF carries the same neutrality rules as the report — nothing repo/document-identifying
  beyond what the on-screen report shows.

═══════════════════════════════════════════════
WHAT NOT TO DO
═══════════════════════════════════════════════

- No candidate accounts, logins, passwords, or candidate-facing "your results" portal.
- No record merging UI; no CSV import of candidates; no tags/pipeline-stages — records are
  deliberately minimal this wave.
- No changes to scoring, probes, generation, or the candidate assessment flow.
- No org/team semantics — records belong to one manager (owner_id), same as everything else;
  multi-tenancy remains blueprint C.
- Share links: no expiry-by-time in this wave (revocation only) — flag it as a follow-up.

═══════════════════════════════════════════════
ACCEPTANCE (what the human will test)
═══════════════════════════════════════════════

1. Create a link with a new email → a Candidate record appears automatically; the backfill
   has populated records for my existing emailed links, with their history attached.
2. Candidate detail page shows the full journey — multiple assessments, statuses, scores,
   verdicts — newest first, each jumping to its report.
3. "Send an assessment" from the record: picker → link created pre-filled → shows up in the
   journey immediately; duplicate warning still fires when re-sending a completed one.
4. "Send another assessment" from a completed report lands in the same picker, candidate
   pre-selected.
5. Share a report → open the link in a private window (no login): read-only report renders,
   with zero edit/override/navigation affordances; revoke it → the link shows the inactive
   page.
6. The share token cannot reach anything else — probing other endpoints with it returns
   401/404 (state what was probed).
7. Download PDF from both the manager view and the shared view → complete, readable report
   with scores, reasoning, deltas, snippets, override transparency.
8. Deleting a candidate record leaves every link/session/report intact and functional;
   the confirm dialog said so beforehand.

Report what changed, flag every decision (backfill mechanism, share-auth path, PDF approach),
verify commits landed, end with "PR is final — safe to merge".
