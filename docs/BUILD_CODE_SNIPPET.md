# AssessIQ — Build: Code Snippet Field

## (candidates can attach a code sketch to any answer — highlighted, scored, probed; never executed)

> Blueprint item D (docs/BLUEPRINT_POST_EPIC.md §D). Prerequisite: Features A and B merged.
> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_CODE_SNIPPET.md and build it."

Branch: feat/code-snippet off develop. Conventional commits. PR to develop.
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## The feature in one line

An optional "Add code" box under the answer textarea: the candidate sketches code to support
their reasoning, picks (or auto-detects) the language, and the snippet flows into scoring,
probes, paste-tracking, and the report — with NO execution environment of any kind.

## Recorded strategic boundary (from the blueprint — repeat it in the PR body)

NO code execution, NO sandbox, NO runtimes, NO test cases. That is HackerRank/Codility's lane.
Claude reads code natively; judgment about the sketch is the scorer's job.

## Part 1 — Data model

- Answer gains: snippet_code (Text, nullable), snippet_language (String, nullable).
- Probe.candidate_answer is prose-only and unchanged; probes never collect snippets.
- Migration; existing rows untouched.

## Part 2 — Shared language list

- One named constant module in packages/types shared by client and server:
  SNIPPET_LANGUAGES = auto, plaintext, javascript, typescript, python, java, csharp, go,
  rust, ruby, php, sql, bash, kotlin, swift, c, cpp, html, css, yaml, json.
- 'auto' is the default: no language pinned; the report's highlighter auto-detects.
- Server validates snippet_language against this list (reject unknown values).
- Cap: SNIPPET_MAX_CHARS = 5000 (named constant, enforced client AND server).

## Part 3 — Candidate UI (assessment session)

- Beneath the answer textarea: a collapsed "Add code (optional)" affordance. Expanding shows:
  - a language dropdown (default Auto) using the shared list
  - a monospace textarea: Tab inserts two spaces instead of moving focus; no other editor
    features (no CodeMirror/Monaco — deliberate weight decision)
  - a live character count against the cap
- One snippet per answer. Collapsing/clearing removes it. Submitting with an empty snippet
  stores NULL, not an empty string.
- PASTE TRACKING: pasting into the snippet textarea records a paste event exactly like the
  answer textarea (same proctoring event type, flagged per question). Without this the
  snippet box is a paste-flag loophole. State in the PR how the event is recorded.
- The timer, autosave/draft behavior, and submit flow treat the snippet as part of the answer
  (saved together, submitted together, auto-submitted together on expiry).

## Part 4 — Scoring integration

- When an answer carries a snippet, the scorer payload appends it to the answer text as a
  clearly delimited block:
  [Candidate attached a code sketch — <language or "unspecified">]
  <snippet>
- The scoring prompt gains one instruction: a code sketch may accompany the prose; treat it
  as part of the answer's reasoning. Judge what the code REVEALS about their understanding
  (approach, edge handling, correctness of logic) — do not grade style, formatting, or
  whether it would compile. Absence of a snippet is never penalized.
- No rubric shape change — the four components are unchanged; the snippet is evidence, not
  a fifth component.

## Part 5 — Probe integration (Feature B)

- Probe generation input includes the snippet (delimited the same way) — a probe may quote
  the candidate's own code, which is the strongest defense test available.
- The probe ANSWER remains prose-only (no snippet box on the probe screen — 90 seconds is
  for words).
- flagged_only mode: a paste event in the snippet box qualifies the question for a probe,
  same as a paste in the answer box.

## Part 6 — Display (report + review surfaces)

- Report: when an answer has a snippet, render it beneath the prose in a monospace block
  with syntax highlighting and a small language label ("Python", or "Code" when auto).
  Use a lightweight highlighter on the DISPLAY side only (e.g. highlight.js or Prism —
  pick what fits the bundle; flag the choice). Auto-detect when language is 'auto'.
- The probe block (from Feature B) renders unchanged; if the probe text quotes code, it's
  just text.
- Interviewer preview/read views of answers show the same rendering.
- Candidate payload: the snippet is the candidate's own input echoed back in their session —
  no new exposure. The question payload remains exactly {id, text, topic}.

## WHAT NOT TO DO

- No execution, sandbox, runtimes, linting, or compile checks — none, ever.
- No full editor component (CodeMirror/Monaco) — monospace textarea with Tab handling only.
- No multiple snippets per answer; no snippets on probe answers.
- No highlighting-while-typing on the candidate side (display-side only).
- No penalty for not using the field — the scorer instruction must make this explicit.
- Do not touch question generation, grounding tiers, or the builder beyond nothing at all —
  this feature needs no builder changes (it is always available to candidates).

## ACCEPTANCE (what the human will test)

1. Take an assessment: expand "Add code", write a snippet with Tab indentation working,
   pick Python → submit → report shows the highlighted snippet with "Python" label.
2. Auto language: leave dropdown on Auto, paste JS-ish code → report highlights it sanely
   with the generic "Code" label.
3. Scoring sees it: answer where the prose is thin but the snippet shows real understanding
   → score reflects the snippet's evidence (and the reasoning mentions it).
4. Probe quotes code: with probes on, submit an answer whose snippet contains a distinctive
   line → the probe references the candidate's own code or its implication.
5. Paste into the snippet box → paste flag recorded on that question; in flagged_only mode
   this alone triggers a probe.
6. Cap: 5001 chars rejected client-side and server-side with a readable message.
7. Empty/collapsed snippet → NULL in DB; answers without snippets score exactly as today.
8. Timer expiry mid-snippet → snippet auto-submits with the answer, no loss, no crash.

Report what changed, flag every decision (including the highlighter library chosen),
verify commits landed, end with "PR is final — safe to merge".
