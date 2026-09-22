# AssessIQ — Build: Completeness Wave

## (assessment templates · question bank management · live interview kit · practice probes)

> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_COMPLETENESS.md and build it."
> Prerequisite: docs/BUILD_CANDIDATE_ROBUSTNESS.md merged to develop.

Branch: feat/completeness off develop. Conventional commits. PR to develop — OR, if the four
parts turn out large, one PR per part in the order below (flag which you chose).
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## Why this wave exists

Four features that make the product feel finished rather than functional: one-click starts,
a bank you can actually manage at 130+ questions, a bridge from the async report to the live
round, and the probe mechanic reused on the job-seeker side.

═══════════════════════════════════════════════
PART 1 — Assessment templates
═══════════════════════════════════════════════

- New model AssessmentTemplate { id, owner_id (nullable — NULL = built-in/system template),
  title, description, question_ids (ordered), timer_minutes, proctoring defaults,
  probes_mode, probe_time_seconds, created_at }.
- Built-ins (seeded, owner NULL, read-only): package the existing VETTED bank into 4–6
  ready-to-send templates by role and level, e.g. "Backend Engineer — Screen (5q · 35m)",
  "Senior Backend — Deep Dive (6q · 50m)", "SRE/DevOps — Screen", "API/Integrations —
  Screen". Choose questions by topic + difficulty from what actually exists; state which.
  Built-ins must reference only status='vetted', is_active questions.
- "Save as template" on any assessment → a personal template (owner_id = manager).
- New Assessment gets a "Start from a template" entry point: pick → the builder opens
  pre-populated (tray, timer, proctoring, probes) — fully editable before create. A template
  never creates an assessment silently.
- Templates referencing a question later deactivated: show a warning on use and drop the
  missing question from the tray (never fail the whole template).

═══════════════════════════════════════════════
PART 2 — Question bank management
═══════════════════════════════════════════════

- Replace the 100-question ceiling with server-side pagination (page size 25/50), plus
  search (text, topic), filters (status vetted/draft, type, difficulty, source: manual /
  generated / repo_grounded / document_grounded, active/archived), and sort (newest, most
  used, topic).
- Tags: Question.tags String[] (free-form, per owner). Tag editor inline; filter by tag.
- Edit in place: a vetted question can be edited (text + all rubric fields) with the SAME
  review panel used for drafts; saving bumps updated_at. Editing never changes status.
- Archive (soft): is_active=false with an "archived" filter to see/restore them. Archived
  questions leave retrieval, templates warn (Part 1), existing assessments keep their copy —
  confirm in the PR that assessments are unaffected by later edits/archives (if they
  reference by id and render live, say so and decide: snapshot at assessment creation is
  preferred; flag the tradeoff).
- Export: JSON of the manager's own questions (full rubric). Import: JSON in the same shape,
  landing as DRAFTS (never vetted on import — review gate holds).
- Usage stats per question (times used, average score, discrimination if available) shown
  on the card — reuse existing analytics where present.

═══════════════════════════════════════════════
PART 3 — Live interview kit (from the report)
═══════════════════════════════════════════════

- On a scored report: "Generate interview kit" → one model call (GENERATION_MODEL) that
  takes the report (scores, reasoning, weak components, probes/deltas, proctoring context,
  recommended probes already present) and produces a structured LIVE INTERVIEW GUIDE:
  • 3–5 targeted questions for the live round, each tied to a specific weakness or
  unverified strength in the report ("They asserted X without evidence — ask them to
  walk through a time they did it")
  • what a strong vs weak answer sounds like for each (short)
  • red flags to listen for
  • a suggested 30-minute agenda
- Rendered on the report (collapsible) and included in the PDF export as a final section
  when generated. Cached on the session (interview_kit Json, generated_at) — regenerate on
  demand.
- Neutrality: the kit is interviewer-only; nothing here reaches the candidate or the shared
  report view (shared links must NOT include the kit — enforce in the shared builder).
- No stub: generation failure surfaces as a readable error, never a fabricated kit.

═══════════════════════════════════════════════
PART 4 — Practice probes (job-seeker side)
═══════════════════════════════════════════════

- In the job-seeker Practice flow, add a toggle "Follow-up questions (recommended)".
  When on: after the practice answer is scored, the SAME probe generator (Feature B's
  composition path — including a snippet if the practice UI has one; if it doesn't, prose
  only) produces one follow-up from the user's own words, with the same 60–180s timer.
- Scoring reuses the defense scorer → the practice feedback shows: answer score, defense
  score, delta, and the band label — plus a coaching line ("Your follow-up was thinner than
  your answer — practice explaining the WHY behind X").
- Spaced-repetition integration: a question with a poor defense delta is scheduled sooner,
  same as a low score (state the rule you implemented).
- Cost note: this is a real model call per practice — show the toggle default ON but with
  the estimate/explanation in the UI copy, so users understand why it's optional.

═══════════════════════════════════════════════
WHAT NOT TO DO
═══════════════════════════════════════════════

- Templates never auto-create assessments; built-ins are read-only.
- Import never creates vetted questions.
- The interview kit never reaches candidates or shared report views.
- Practice probes must not touch the interviewer-side probe tables/flows — reuse the
  generation + defense-scoring functions, store practice results on the practice side.
- No team/org semantics anywhere; everything stays owner-scoped.

═══════════════════════════════════════════════
ACCEPTANCE (what the human will test)
═══════════════════════════════════════════════

1. New Assessment → "Start from a template" → pick a built-in → builder pre-filled, editable,
   creates normally. "Save as template" on an assessment → appears as personal template.
2. Bank: 130+ questions paginate; search "idempot" finds the right ones; filter by
   source=repo_grounded and status=draft works; sort by most used.
3. Tag a question, filter by that tag. Edit a vetted question's senior signal in place →
   saved, still vetted. Archive it → gone from retrieval, visible under "archived", restore.
4. Export my questions → JSON; import it back → duplicates land as drafts, review gate holds.
5. On a scored report: generate interview kit → targeted questions tied to that report's
   weaknesses; appears in the PDF; NOT present when the same report is opened via a share
   link.
6. Job-seeker practice with follow-ups ON → answer, get a probe quoting my words, timer,
   feedback shows both scores + delta + coaching line; OFF → today's behavior.
7. A practice question with a bad defense delta comes back sooner in the deck.
8. Assessments created before an edit/archive of one of their questions still render and
   score consistently (per the snapshot decision you flagged).

Report what changed, flag every decision (built-in template composition, snapshot vs live
question references, SR rule for defense delta), verify commits landed, end with
"PR is final — safe to merge".
