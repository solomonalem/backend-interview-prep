# AssessIQ — Build: Feature A — Document-Grounded Generation

## (paste or upload a document → grounded questions, with an elicitation loop)

> Prerequisite: the repo-grounding epic is merged and v1.1.0 tagged (docs/CLOSE_EPIC.md done).
> Authoritative spec: docs/BLUEPRINT_POST_EPIC.md §A — read it FULLY before building.
> This file is the build order + acceptance criteria; the blueprint holds the design detail.
> Usage: claude --dangerously-skip-permissions "Read docs/BUILD_DOCUMENT_GROUNDING.md and build it."

Branch: feat/document-grounding off develop. Conventional commits. PR to develop.
Verify commits land in the PR. End with "PR is final — safe to merge", then stop pushing.
If this spec conflicts with codebase reality, flag and propose — don't silently deviate.

## The feature in one line

A third grounding tier between repo-scan and JD-topics: the manager pastes or uploads a
document (architecture doc, project description, detailed JD) and gets grounded questions
from it — and when the document is too thin, the AI asks up to 3 follow-up questions FIRST
instead of generating generic mush.

## Before you code: one prerequisite check

The synthesis-prompt risk-skew tuning is listed in CLAUDE.md as a follow-up. Decide and flag:
either (a) tune it as a small first commit on this branch (the generation disposition this
feature inherits should prefer a spread of question angles, not gotcha-hunting), or
(b) if you judge it separable, do it as its own tiny PR first. Say which you chose and why.

## Build order

### Part 1 — Data model

- Question.source union gains 'document_grounded'.
- New model GroundingDocument { id, owner_id, title, text, elicitation_qa Json?, created_at }.
- Question.grounding_document_id (nullable, SetNull on delete — same pattern as
  repo_finding_id). Migration; existing rows untouched.

### Part 2 — Extraction + input surface

- Builder gains source: "Generate from a document" alongside the existing sources.
- Input: editable textarea (paste) OR file upload → server-side text extraction → the
  extracted text lands IN the same editable textarea before anything generates.
- Formats: .pdf, .docx, .txt, .md ONLY. No csv, no images, no OCR.
- Scanned/image PDFs: near-zero extractable text → reject with "This PDF appears to be
  scanned — paste the text instead."
- Caps (named constants): ~2 MB upload, ~50k chars extracted text. Over-cap → ask the manager
  to paste the relevant section.
- Signals alongside the document: seniority (required), question type (optional), count.

### Part 3 — Sufficiency check + elicitation loop (the differentiator)

- Before generating: ONE cheap call (DECODE_MODEL / Haiku): does this text contain enough
  concrete technical substance to ground <count> specific questions?
  Returns { sufficient: boolean, gaps: string[] } — gaps are up to 3 concrete follow-up
  questions (e.g. "What datastore backs the event log?", "What request volume does the
  payments path handle?").
- Insufficient → render the gap questions as a short inline form. All answers optional; the
  manager can skip and force-generate (label the result "may be generic"). Answers append to
  the document context. Re-check AT MOST once — never more than one elicitation round.
- Sufficient → generate directly.
- Same no-stub rule as everywhere: if the sufficiency call fails, fail readably — never
  fabricate a sufficiency verdict.

### Part 4 — Generation

- Reuse the existing generation service; inject the document (+ elicitation answers) as
  grounding context.
- NEUTRALITY — the AUTH_SECRET lesson applies: the document's technical tension may surface;
  its identity may NOT. Company names, product names, internal codenames stripped from the
  question AND every rubric field. Enforce in the prompt AND verify in code where feasible
  (e.g. document title never appears verbatim in any generated field).
- Length cap: reuse the existing ≤~600-char retry-then-truncate enforcement.
- Output: drafts with source: 'document_grounded' + grounding_document_id, flowing into the
  EXISTING background-generation model (202 immediately, appear-as-ready in the review list,
  review from list, approve → vetted). No new review UI — the panel gains one line:
  "Grounded in: <document title>".

### Part 5 — Provenance display

- Review panel + bank: document-grounded questions show their grounding badge and document
  title (parallel to the repo-grounded citation display).
- Candidates: unchanged structural selection {id, text, topic} — nothing document-related
  can reach them.

## WHAT NOT TO DO

- No OCR, no csv, no "any format" parsing.
- No multi-round elicitation loops — one round max.
- No new review pipeline — this rides the existing draft → review → vetted flow.
- No storing of anything the manager didn't give us — the document is theirs, stored as given.
- Do not touch scoring, the candidate flow, repo scanning, or the report.

## ACCEPTANCE (what the human will test)

1. Paste a rich architecture description → sufficiency passes → questions generated in the
   background, reviewable from the list, approvable to vetted; the questions carry the doc's
   tension but none of its names.
2. Paste something thin ("we build fintech apps") → up to 3 concrete follow-ups appear;
   answering then generating produces visibly better-grounded questions; skipping still
   allows generation with the "may be generic" note.
3. Upload a PDF JD → text extracted into the editable box → same flow end to end.
4. Upload a scanned PDF → clean rejection, no crash.
5. DB: generated rows carry source='document_grounded' + grounding_document_id; deleting the
   GroundingDocument nulls the reference, questions survive.
6. Candidate payload for a document-grounded question: {id, text, topic} only.
7. Review panel shows "Grounded in: <document title>".
8. The risk-skew tuning decision from the prerequisite check is stated and, if tuned here,
   demonstrated (generate from the same finding-set/document and show the question-angle
   spread).

Report what changed, flag every decision, verify commits landed, end with
"PR is final — safe to merge".
