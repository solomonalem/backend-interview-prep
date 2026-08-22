# AssessIQ — Build: Feature B — Automated Follow-Up Probes

## (the anti-AI-assistance mechanic: defend your own answer, under a short timer)

> Prerequisite: Feature A merged (docs/BUILD_DOCUMENT_GROUNDING.md done).
> Authoritative spec: docs/BLUEPRINT_POST_EPIC.md §B — read it FULLY before building.
> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_FOLLOWUP_PROBES.md and build it."

Branch: feat/followup-probes off develop. Conventional commits. PR to develop.
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## The feature in one line

After a candidate submits an answer, the system can ask ONE follow-up generated from THEIR OWN
WORDS, answered under a short timer; the delta between answer quality and defense quality is
the AI-assistance fingerprint — async, no human present, no accusations.

## Build order

### Part 1 — Data model + configuration

- Assessment gains: probes_mode ('off' | 'flagged_only' | 'all', default 'flagged_only') and
  probe_time_seconds (int, default 90; valid 60–180). Builder UI exposes both with plain
  explanations of the three modes.
- New model Probe { id, answer_id (unique — 1:0..1 with Answer), text, candidate_answer,
  time_spent_ms, status: 'generated'|'answered'|'unanswered'|'generation_failed',
  defense core/senior component scores + defense_pct (nullable until scored) }.
- Migration; existing assessments default to 'off' (behavior identical to today) — new
  assessments default 'flagged_only'.

### Part 2 — Probe generation at submit time

- Trigger on answer submit, per probes_mode:
  - off: never.
  - flagged_only: only when the answer has a paste flag OR lands in the top scoring band.
    NOTE: scoring is async — if the score isn't available at submit time, the paste flag alone
    decides in flagged_only mode. State this behavior in the PR; do not block the candidate
    waiting for a score.
  - all: every question.
- One fast call (GENERATION_MODEL) with: the question, the candidate's answer text, the
  rubric \_guide fields. Returns ONE probe that (a) quotes a specific phrase the candidate
  actually wrote, (b) pushes one level deeper or at an edge their answer implies, and
  (c) is answerable in ~90s of typing by someone who understood their own answer.
- LATENCY BUDGET: the probe must render within ~8s of submit. On failure or timeout: SKIP
  silently — the candidate flows on uninterrupted; record status generation_failed for the
  report. Never block a candidate on our failure; never stub a probe.

### Part 3 — Candidate flow

- Disclosure FIRST: the instructions page states that follow-up questions may appear after
  answers, with their own timers. Same honesty rule as proctoring — no surprise mechanics.
- After submit (when a probe fires): a probe screen before the next question — "One follow-up
  on your answer:" + probe text + visible countdown (probe_time_seconds) + a text box.
- Timer hits zero → auto-submit whatever is typed (empty allowed → status unanswered).
- No skipping forward past a probe; leaving it empty is the legitimate way out (and is
  itself signal).
- Timer-expiry and session-expiry behavior must match the main assessment's existing
  "Time's up" handling — no silent jumps.

### Part 4 — Scoring the defense

- Probe answers are scored by the existing scorer with a REDUCED rubric: core + senior_signal
  only (evidence and trap don't apply to a 90-second defense) → defense_pct.
- delta = answer_total_pct − defense_pct, per probed question:
  delta ≤ 20 → "Defended their answer" (green)
  21–40 → "Partially defended" (amber)
  > 40 → "Could not defend" (red)
- Empty/unanswered probe on a scored answer → defense_pct 0, delta computed accordingly,
  report notes "follow-up not answered".

### Part 5 — Report

- Per probed question, the report shows: the probe, the candidate's probe answer, defense_pct,
  and the delta flag — adjacent to the original question and any paste flag on it.
- FRAMING RULE (hard): context for the interviewer's judgment, never a verdict. The words
  "AI" and "cheating" do not appear anywhere in the report. The delta speaks for itself.
- generation_failed probes: one neutral line ("a follow-up couldn't be generated for this
  answer") — never counted against the candidate.

## WHAT NOT TO DO

- No pre-generated probes — a probe must depend on what the candidate actually wrote.
- No blocking the candidate on probe generation (8s budget, then skip silently).
- No accusatory language anywhere, in UI or report.
- No live/manager-injected questions — that is design E in the blueprint, parked.
- probes_mode 'off' must be byte-for-byte today's behavior.
- Do not touch question generation, repo/document grounding, or the builder beyond the two
  new assessment settings.

## ACCEPTANCE (what the human will test)

1. flagged_only: paste a large block as an answer → after submit, a probe appears quoting my
   own phrasing, countdown visible; it auto-submits at zero.
2. Strong self-written answer + fluent probe answer → small delta, green "Defended" on report.
3. Pasted sophisticated answer + weak/empty probe answer → large delta, red "Could not
   defend", shown adjacent to the paste flag on the same question.
4. Kill probe generation (e.g. bad key for one call) → candidate flows on with zero
   interruption; report carries the neutral generation_failed line.
5. Instructions page discloses probes before the assessment starts.
6. probes_mode off → identical to current behavior end to end.
7. probe_time_seconds respected (set 60 → 60s countdown), auto-submit at zero, no skip path.
8. DB: Probe rows carry status transitions correctly (generated → answered/unanswered).

Report what changed, flag every decision, verify commits landed, end with
"PR is final — safe to merge".
