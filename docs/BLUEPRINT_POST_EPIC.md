# AssessIQ — Feature Blueprint: Post-Epic Wave

## Document-Grounded Generation · Follow-Up Probes · Parked Designs

> Status: BLUEPRINT — the authoritative plan for the next wave of features, agreed after the
> repo-grounding epic (v1.1.0). Save as docs/BLUEPRINT_POST_EPIC.md.
>
> Decision summary from planning:
>
> - BUILD NOW (this wave): Feature A (document-grounded generation + file import + elicitation),
>   then Feature B (automated follow-up probes).
> - DESIGNED, BUILD LATER: accounts/seats (C), code snippet field (D), live manager mode (E).
> - REJECTED: formal SDD tooling (current workflow IS right-sized SDD); code execution sandbox
>   (lane change into HackerRank's territory — snippet field captures the value instead).
> - STILL PARKED FOR LAST (unchanged): score-to-hire correlation — see DESIGN_REPO_GROUNDING.md §11.

## HOW TO USE THIS DOCUMENT (instructions for Claude Code)

- Read this entire document before building anything from it.
- Features A and B are sequenced: A first, then B. Each is its own feature branch off develop
  (feat/document-grounding, feat/followup-probes), standard conventions: conventional commits,
  verify commits land in the PR, end with "PR is final — safe to merge", stop pushing after.
- Sections C, D, E are DESIGNS ONLY — do not build them from this document. They exist so the
  decisions aren't lost. Each says what would trigger building it.
- Reuse existing machinery everywhere it fits — both A and B are extensions of pipelines that
  already exist, not new systems. If the spec here conflicts with codebase reality, flag and
  propose; don't silently deviate.

═══════════════════════════════════════════════════════════════
FEATURE A — DOCUMENT-GROUNDED GENERATION
(generate questions from any text or file, with an elicitation loop)
═══════════════════════════════════════════════════════════════

### A.1 The idea in one paragraph

The generation pipeline is input-agnostic at its core: repo-grounding feeds it findings; the JD
on-ramp feeds it topics. This feature adds a third grounding tier — a pasted or uploaded DOCUMENT
(architecture doc, project description, detailed JD) — that produces grounded-ish questions
without repo access. Commercially this is moat-lite: many companies will never grant repo access,
and this tier serves them. When the document is too thin to ground good questions, the AI asks
follow-up questions FIRST (an elicitation loop) instead of generating generic mush.

### A.2 The grounding-tier model (name it in the UI)

Tier 1 Repo scan richest — findings with file/line citations (existing)
Tier 2 Document middle — grounded in stated architecture/context (THIS FEATURE)
Tier 3 JD topics broadest — topic/seniority match + generation (existing)

All three converge on the SAME pipeline: context → generate → draft → review panel → approve →
vetted → bank → tray. Nothing downstream changes.

### A.3 Flow

1. Builder gains a source: "Generate from a document" (alongside bank / codebase / write-your-own).
2. Input: a textarea (paste) OR file upload (see A.5). Plus the usual signals: seniority
   (required), question type (optional), count.
3. SUFFICIENCY CHECK (the elicitation loop — the differentiator):
   - Before generating, one cheap model call (DECODE_MODEL/Haiku) assesses: does this document
     contain enough concrete technical substance to ground N specific questions?
   - Returns: { sufficient: boolean, gaps: string[] } where gaps are up to 3 concrete follow-up
     questions, e.g. "What datastore backs the event log?", "Roughly what request volume does
     the payments path handle?"
   - If insufficient → show the follow-up questions as a short form. The manager answers inline
     (short text each, all optional — they can skip and force-generate). Answers are appended to
     the document context. Re-check once at most — never loop more than one round.
   - If sufficient → generate directly.
4. Generation: reuse the existing generation service with the document (+ elicitation answers)
   injected as grounding context, same neutrality rules as repo-grounding — the question must
   carry the document's technical tension, never its identity (company names, product names,
   internal codenames are stripped/neutralized in the question and ALL rubric fields — same rule
   the repo path learned the hard way with AUTH_SECRET).
5. Output: standard draft questions, source: 'document_grounded', into the existing background
   list → review panel → approve → vetted flow (the pacing model already built: immediate
   return, appear-as-ready, review from list).

### A.4 Data model (minimal)

- Question.source gains 'document_grounded'.
- New table GroundingDocument { id, owner_id, title, text (the extracted/pasted text),
  elicitation_qa Json?, created_at } — questions reference it via nullable
  grounding_document_id (SetNull on delete, same pattern as repo_finding_id).
- PRIVACY: the document is the manager's own input, stored for regeneration/reference. Unlike
  repo source, storing it is fine — they gave it to us. But the review panel shows which document
  grounded a question, and candidates never see any of it (same structural selection: candidates
  get {id, text, topic} only).

### A.5 File import (part of this feature, not separate)

- Accept: .pdf, .docx, .txt, .md. NOT csv (nonsensical for this purpose), NOT "any format".
- Extraction server-side: pdf → text extraction; docx → text extraction; txt/md → as-is.
- Scanned/image PDFs: detect near-zero extractable text → reject with "This PDF appears to be
  scanned — paste the text instead." No OCR in this wave.
- Size cap ~2MB / ~50k chars of extracted text (named constants). Over-cap → ask the manager to
  paste the relevant section instead.
- The extracted text lands in the same textarea (editable before generating) — extraction is a
  convenience layer over paste, not a separate path.

### A.6 Acceptance (what the human will test)

1. Paste a rich architecture description → sufficiency passes → grounded questions generated,
   reviewable, approvable into the bank; questions carry the doc's tension, not its names.
2. Paste something thin ("we build fintech apps") → up to 3 concrete follow-up questions appear;
   answering them then generating produces visibly better-grounded questions; skipping them
   still allows generation (with a "may be generic" note).
3. Upload a PDF of a JD → text extracted into the editable box → same flow works.
4. Upload a scanned PDF → clean rejection message, no crash.
5. Candidate payload for a document-grounded question contains only {id, text, topic}.
6. The review panel shows "Grounded in: <document title>".

═══════════════════════════════════════════════════════════════
FEATURE B — AUTOMATED FOLLOW-UP PROBES
(the anti-AI-assistance mechanic — roadmap Step 5, now concrete)
═══════════════════════════════════════════════════════════════

### B.1 The idea in one paragraph

After a candidate submits an answer, the system can generate a contextual follow-up probe FROM
THEIR OWN WORDS — "You mentioned a TTL index on the idempotency store; what happens to in-flight
requests when a key expires mid-transaction?" — answered under a short timer (60–90s). A candidate
who pasted an AI answer can't defend its specifics under time pressure without re-asking the AI;
a candidate who understood their answer responds fluidly. THE SCORING SIGNAL IS THE DELTA between
answer quality and defense quality — a 90% answer with a 30% defense is the AI-assistance
fingerprint. This preserves the async value prop entirely (no human needs to be present).

### B.2 Interviewer configuration (per assessment)

probes: off | flagged_only | all

- off → current behavior, no probes
- flagged_only → probe fires only when the answer had a paste flag OR scores in the top band
  (the two cases where verification matters most) ← recommended default
- all → every question gets one probe
  probe_time_seconds: default 90 (named constant, configurable 60–180)

Disclosure: the candidate instructions page must state that follow-up questions may appear after
answers, with their own timers. Same honesty rule as proctoring — no surprise mechanics.

### B.3 Candidate flow

1. Candidate submits an answer (unchanged).
2. If a probe is due: a probe screen appears BEFORE the next question — "One follow-up on your
   answer:" + the generated probe + a visible countdown (probe_time_seconds) + a text box.
3. Probe timer expires → auto-submits whatever is typed (empty allowed, recorded as unanswered).
4. Then the normal next question. A probe cannot be skipped forward past, but leaving it empty
   is a legitimate (scored) outcome.

### B.4 Probe generation mechanics

- Fired at submit time: a single fast call (GENERATION_MODEL) receives the question, the
  candidate's answer text, and the question's rubric \_guide fields, and returns ONE probe that:
  (a) references something specific the candidate actually wrote (quote a phrase),
  (b) asks them to go one level deeper on it or handle an edge it implies,
  (c) is answerable in ~90s of typing by someone who understood their own answer.
- Latency matters — the candidate is waiting. Budget: probe must render within ~8s of submit;
  on failure/timeout, SKIP the probe silently (never block the candidate on our failure) and
  record probe_status: 'generation_failed' for the report.
- Probes are generated per-answer, never pre-generated (they must depend on what was written).

### B.5 Scoring the probe + the delta

- The probe answer is scored by the existing scorer with a reduced rubric (core + senior_signal
  only — evidence/trap don't apply to a 90-second defense), producing defense_pct.
- New signal on the report per probed question:
  answer_total_pct vs defense_pct → delta
  delta ≤ 20 → "Defended their answer" (green)
  delta 21–40 → "Partially defended" (amber)
  delta > 40 → "Could not defend" (red) ← the AI-assistance fingerprint,
  especially combined with a paste flag on the same question
- The report shows the probe, their probe answer, defense_pct, and the delta flag alongside the
  original question. Framing rule (same as proctoring): context for the interviewer's judgment,
  NEVER an automatic verdict or an accusation of cheating. The words "AI" and "cheating" do not
  appear in the report — the delta speaks for itself.

### B.6 Data model (minimal)

- Probe { id, answer_id (unique), text, candidate_answer, time_spent_ms, defense_pct?,
  status: generated|answered|unanswered|generation_failed, scores... } — 1:0..1 with Answer.
- Assessment gains probes_mode + probe_time_seconds.

### B.7 Acceptance

1. flagged_only mode: paste a large block into an answer → a probe appears after submit,
   quoting my own phrasing, with a countdown; it auto-submits at zero.
2. A strong self-written answer + fluent probe answer → small delta, green flag on report.
3. A pasted sophisticated answer + weak/empty probe answer → large delta, red flag, shown next
   to the paste flag on the same question.
4. Probe generation failure → candidate flows on with no interruption; report notes the probe
   couldn't be generated.
5. Candidate instructions disclose probes before start.
6. probes: off assessments behave exactly as today.

═══════════════════════════════════════════════════════════════
C — ACCOUNTS & SEATS (DESIGN ONLY — do not build yet)
═══════════════════════════════════════════════════════════════

Trigger to build: the first company asks to buy, OR deployment planning begins in earnest.

Agreed shape:

- Individual (job seekers): study mode, practice, JD decode, story bank.
- Individual Pro (possible middle tier): + assessments with usage caps, for solo hiring
  managers / freelance recruiters.
- Company (seats): shared question bank, shared repo integrations + grounding documents,
  multiple interviewer seats, shared candidate pipeline, org admin.
- The product already splits naturally: job-seeker half = individual product, interviewer half =
  company product.
- Architecture note: ownership is uniformly owner_id (user) today, deliberately named so an
  org_id can slot in. Multi-tenancy touches ownership on EVERY table — building it before
  observing how teams actually share (banks? repos? candidates?) risks redoing the most
  expensive-to-change layer. Design pricing when there is a buyer to price against.

═══════════════════════════════════════════════════════════════
D — CODE SNIPPET FIELD (DESIGN ONLY — build later, small)
═══════════════════════════════════════════════════════════════

Trigger to build: after A + B ship, as a small quality-of-life addition.

- A syntax-highlighted code SNIPPET box available alongside the answer textarea — candidates can
  sketch pseudocode/code to support their reasoning. NO execution, NO sandbox, NO runtimes.
- Claude scores it as part of the answer (it reads code natively) — the scoring prompt is told a
  snippet may accompany the prose.
- Explicit strategic decision, recorded: NO code-execution environment. That is a lane change
  into HackerRank/Codility's core territory with a decade head start; AssessIQ's lane is
  judgment/design/reasoning assessment. A company can use both tools. The snippet field captures
  "let me show you what I mean" at ~5% of the cost.

═══════════════════════════════════════════════════════════════
E — LIVE MANAGER MODE (PARKED — post-users)
═══════════════════════════════════════════════════════════════

The idea: the hiring manager watches an active session and injects questions live.

Parked because: it requires live infrastructure (WebSockets — deliberately excluded so far),
presence, notifications; and it requires the manager to BE PRESENT, which contradicts the core
async value prop (the product exists to save live screening time — if the manager must attend,
it's a scheduled interview again). Feature B delivers most of the anti-AI value asynchronously.

Revisit trigger: real users report async probes are insufficient, or explicitly request a hybrid
"drop in on an active session" capability. If built, frame as OPTIONAL drop-in, not a mode the
flow depends on.

═══════════════════════════════════════════════════════════════
F — PROCESS DECISION, RECORDED
═══════════════════════════════════════════════════════════════

Formal SDD tooling (Spec Kit etc.): NOT adopting. The existing workflow — design doc →
build prompt with acceptance criteria → autonomous build → human verification → merge — is
right-sized spec-driven development for a solo builder with an AI pair, and it demonstrably
produced this product. The project's real failure modes (merge timing, untested real-world
paths) are addressed by process habits already adopted (final-signal-before-merge, human
walkthrough testing), not by heavier spec ceremony.

═══════════════════════════════════════════════════════════════
BUILD ORDER FOR THIS WAVE
═══════════════════════════════════════════════════════════════

1. Feature A — feat/document-grounding off develop (A.3 flow + A.5 import together; the
   elicitation loop A.3.3 is part of the feature, not optional).
2. Feature B — feat/followup-probes off develop, after A merges.
3. Then D (snippet field) as a small follow-up, if desired.
4. C and E wait for their triggers. Score-to-hire correlation stays parked for last.
