# CLAUDE.md — Repo Orientation (read this first)

This repository contains **two separate things**. Don't confuse them:

1. **`index.html` + `README.md` (repo root)** — a legacy static self-quiz study site
   ("Backend Interview Prep", 266 Q&A) deployed to GitHub Pages. This was the seed
   idea. It is **not** the app under active development. Leave it alone unless asked.
   - Note: the git working tree may show `index.html` deleted and a `1.html` present
     (a rename that happened outside a session). If asked to touch the site, resolve
     that first — `index.html` is what GitHub Pages serves.

2. **`assessiq/` — the product being built.** A full-stack app. This is where all
   active work happens. Everything below is about AssessIQ.

3. **`docs/` — the complete AssessIQ specification.** Read `docs/README.md` first,
   then the numbered files. `docs/AssessIQ_PRD_v1.docx` is the original PRD.

---

## What AssessIQ is

A **proctored, rubric-scored technical assessment platform** with two user modes:

- **Interviewer mode** — build an assessment from a question bank, set a timer +
  proctoring rules, send a candidate a signed link (no candidate account), receive a
  Claude-scored report (per-question scores, proctoring flags, verdict, live probes).
- **Job-seeker mode** — self-study on the same content: spaced repetition, STAR story
  bank, timed practice with AI feedback. (Deferred to Phase 2.)

**The differentiator is rubric scoring.** Answers are NOT marked correct/incorrect.
Each answer is scored 0–100 across four weighted components:
`core (25%) · senior_signal (35%) · trap_avoidance (25%) · evidence (15%)`.
Senior signal is weighted highest because it's hardest to fake. Verdict is driven
primarily by senior-signal average, not overall score. (Full detail: `docs/04-scoring-engine.md`.)

---

## Tech stack (see `docs/06-tech-stack.md`)

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript + Tailwind + Vite (NOT Next.js — no SSR needed) |
| Backend | Node 20 + Express 4 + TypeScript |
| DB | PostgreSQL 15 via Prisma ORM (NOT Mongo — data is relational) |
| Queue | BullMQ + Redis (scoring is async; candidate never waits) |
| Scoring | Anthropic Claude, `temperature: 0` (deterministic) |
| Auth | Interviewers: JWT (httpOnly cookie) + Google OAuth. Candidates: signed token URL only |
| Storage | Cloudflare R2 · **PDF** Puppeteer · **Email** Resend · **Deploy** Railway (MVP) |

Things the spec explicitly forbids: Next.js, GraphQL, MongoDB, NestJS, MUI/Chakra,
Kubernetes, WebSockets, Claude Opus for scoring. Don't reach for them.

---

## Monorepo layout (`assessiq/`, npm workspaces — see `docs/09-project-structure.md`)

```
assessiq/
├── apps/
│   ├── api/    Express + Prisma + BullMQ workers
│   │   ├── prisma/schema.prisma   ← full schema (from docs/07)
│   │   ├── prisma/seed.ts         ← 10 starter questions
│   │   ├── src/index.ts, app.ts   ← app factory + /health only so far
│   │   ├── src/lib/prisma.ts      ← Prisma client singleton
│   │   └── src/{routes,services,workers,queues,middleware,utils}/  ← EMPTY (.gitkeep)
│   └── web/    React + Vite + Tailwind (App.tsx is a placeholder; pages/ dirs empty)
├── packages/types/   shared TS types (placeholder — populate as routes are built)
├── docker-compose.yml   postgres + redis
├── .env.example         (real dev values live in apps/api/.env, gitignored)
└── package.json         root workspace scripts
```

**Architectural conventions (enforce these):**
- Route files: HTTP only (parse req → call service → return). No business logic.
- Service files: all business logic, no Express types. Testable in isolation.
- Worker files: queue jobs only; call services.
- Shared types go in `packages/types` — never duplicate a type across apps.

---

## Current status — v1.1.0 TAGGED ✅

`v1.1.0` is an annotated tag on `main`. `main` and `develop` are in sync at that
point (identical trees — `main` shows more commits only because merge commits
accumulate there). v1.0.0 was the first complete two-sided release: an
interviewer can go from a job description to a scored report without manual
intervention, and a job seeker can study the same bank. **v1.1.0 adds repo
grounding**, below.

### Interviewer flow (Hire mode)
- **Auth** — email+password (scrypt) + Google OAuth exchange, JWT in an httpOnly
  `assessiq_token` cookie, `authInterviewer` middleware. Routes at `/api/v1`.
- **Three on-ramps into a position**, all converging on the same search:
  paste a JD (decoded by Claude Haiku, with a domain gate that rejects
  non-software roles by name), pick a supported role preset, or type
  technologies by hand.
- **Bank-first question pool** — on-topic bank matches (vetted + draft) return
  instantly; AI generation fires only when a topic has fewer than 3, topping up
  to 5. A short seniority-only tail adds breadth without suppressing generation.
- **AI generation with mandatory human review** — every generated question is
  persisted as `status: draft` with a full four-part rubric. A draft can only
  reach an assessment through the review panel (question + all four rubric
  components, `_display` and `_guide` both editable), where Approve promotes it
  to `vetted`. Refine revises in place; Reject sets `is_active: false`.
  Managers can also write their own question and have the AI draft its rubric.
- **Selection tray** — the single source of truth for an assessment. Nothing is
  ever auto-selected.
- **Previously used** — a third question source beside search and write-your-own,
  listing vetted questions this manager has already put in an assessment
  (`GET /questions/previously-used`). A filtered view of the bank joined through
  `AssessmentQuestion`, not a new store; drafts and rejected questions never
  appear. Selecting one goes straight to the tray — already vetted, already used.
- **Candidate links** — signed token URLs, no candidate account. Auto-named
  `Candidate N`, renameable afterwards.
- **Proctored timed sessions** — one question at a time, passive tab/focus/paste/
  idle events, explicit "Time's up" on expiry.
- **Async scoring + reports** — BullMQ + Redis worker scores each answer with
  Claude at `temperature: 0` against the rubric; reports show overall/component
  averages, verdict, proctoring context, and per-question breakdown including
  questions the candidate never answered. Emailed to the interviewer via Resend.
- **Score override** — the interviewer has the final say: any scored answer can
  be corrected (`adjusted`, with a total and/or individual components) or
  rejected outright (`disagree`, note only), always with a required note.
  **The AI's own columns are never written to.** Overrides live in nullable
  `override_*`/`overridden_*` columns on `Score` and are returned alongside, with
  session totals and verdict re-derived into a separate `overall.override` block.
  `PUT`/`DELETE /reports/session/:id/questions/:qid/override`.

### Repo grounding (v1.1.0 — the repo-grounding epic, complete)
An interviewer connects a GitHub repository and gets questions grounded in
their team's own code. A **GitHub App** with `contents: read` and nothing else,
so the manager picks repositories on github.com and GitHub itself enforces what
we can see; no long-lived credential is held — installation tokens are minted
per operation and expire in an hour. The scan is **layered**: manifest-based
stack detection and path-signal file ranking (capped at 40 files) involve no AI
at all, and Claude sees only that selection. It produces **findings** carrying
at most a 3-line excerpt — **the source itself is never stored**, and in
**strict mode** the model reads structural summaries only and no excerpt is
kept at all. Findings feed the **existing** draft → review → vetted pipeline,
so every grounded question still needs human approval before it can reach an
assessment. **Candidates never see repository information** — no file path, repo
name, or finding text; their payload stays the structural `{id, text, topic}`.
Revocation is handled from both directions (webhook, and refusal on next use).
Design: `docs/DESIGN_REPO_GROUNDING.md`; setup: `docs/github-app-setup.md`.

### Document grounding (Feature A — merged to `develop`, PR #29)
The middle grounding tier, for teams that will never grant repository access.
The manager pastes text or uploads a **.pdf/.docx/.txt/.md** (2 MB, 50k chars);
extraction returns **text, not questions** — it lands back in the editable box
so a bad parse is something they can see and fix. A scanned PDF has no text
layer and is rejected rather than OCR'd. Before generating, a **sufficiency
gate** (one cheap `DECODE_MODEL` call) either clears the document or returns up
to **3 concrete follow-up questions**; answering any of them appends to the
grounding context, and the loop runs **at most once**. Skipping is allowed and
the resulting drafts are labelled `may_be_generic`. The gate is **never
stubbed** — a fabricated verdict would claim we read a document we never
assessed, so a missing key is a 503. Generation reuses the existing queue and
the existing draft → review → vetted pipeline. **Neutrality** is asked for at
length in the prompt and then verified in code for the one leak checkable
without guessing: the document title appearing verbatim in any field.
Provenance splits the way the repo tier's does — the badge rides `source` (bank,
builder), the document title lives on the interviewer-only draft shape and shows
as "Grounded in: <title>" in the review panel. **Candidates see nothing of it**:
their payload stays `{id, text, topic}`. Page: `/ground/document`. Build spec:
`docs/BUILD_DOCUMENT_GROUNDING.md`.

### Follow-up probes (Feature B — merged to `develop`, PR #30)
The anti-assistance mechanic, and the reason it works without a human present:
after an answer is submitted, the system can ask ONE follow-up **written from
the candidate's own words** — quoting a phrase they wrote — answered under a
short timer (60–180s, default 90). The signal is not the defense score but the
**delta** between the answer and its defense: ≤20 "Defended their answer",
21–40 "Partially defended", >40 "Could not defend". Per assessment,
`probes_mode` is `off` | `flagged_only` | `all`; the **column** default is
`off` so pre-feature assessments are unchanged, while the **API** defaults a
new assessment to `flagged_only`. Generation runs inside the submit request
under a hard **8s budget** and is **never stubbed** — past the budget the probe
is not shown, a `generation_failed` row is recorded for the report, and the
candidate flows on knowing nothing about it. The defense is scored on a
**reduced rubric** (core + senior signal only, re-weighted 25/35 of the 60 they
share) in the same job as the answer, right after it. An empty box is a
legitimate, scored outcome: `unanswered`, `defense_pct` 0, no model call.
**Disclosure is up front** — the instructions page names follow-ups and their
timer before the candidate starts, the same honesty rule as proctoring — and
the report presents the delta as context, never a verdict. Build spec:
`docs/BUILD_FOLLOWUP_PROBES.md`.

### Code sketches (Feature D — merged to `develop`, PR #31)
An optional **"Add code"** box under the answer textarea: the candidate sketches
code to support their reasoning, picks a language or leaves it on **Auto**, and
the sketch flows into scoring, probes, paste tracking and the report. **There is
no execution environment of any kind** — no sandbox, no runtime, no test cases,
and that is the recorded strategic boundary rather than a missing piece: running
code is HackerRank's product, and what a sketch *reveals* is the scorer's job.
Two nullable columns on `Answer` (`snippet_code`, `snippet_language`), a 5000-char
cap and a 21-entry language list shared from `packages/types/src/snippet.ts`
(client dropdown, server validation and report labels all read it). The prose and
the sketch are composed into **one artifact** by `utils/snippet.ts`, so the
scorer, the defense scorer and probe generation cannot disagree about what the
candidate submitted — a probe can quote a line of their own code, which is the
sharpest defense test available. The scoring prompt gains one instruction (judge
what the code reveals, not style or whether it compiles; **never penalise its
absence**) and **no rubric change** — a sketch is evidence, not a fifth
component. The box records the **same paste event** as the answer box, so it is
neither a hole in proctoring nor one in the `flagged_only` probe rule. The
candidate side is a plain monospace textarea — no CodeMirror/Monaco, Tab indents
two spaces — and highlighting happens **display-side only**, in the report,
behind a dynamic `highlight.js` import that leaves the main bundle untouched.
**Candidates see nothing new**: the question payload stays `{id, text, topic}`,
and a sketch is only their own input echoed back. Build spec:
`docs/BUILD_CODE_SNIPPET.md`.

### The post-assessment layer (merged to `develop`, PR #32)
What happens after a candidate submits: records, reuse, and a report that
travels. **Candidates still click links; managers keep records** — there is no
candidate account, password or portal anywhere in this wave.

- **Candidate records** — `Candidate {owner_id, name, email, notes}`, unique on
  `(owner_id, email)` because email is the only stable handle someone without
  an account has. `AssessmentLink.candidate_id` is nullable + **SetNull**, so
  deleting a record never touches a link, session, score or report. Records
  **accrete from ordinary use**: sending a link to an address find-or-creates
  one. History was **backfilled inside the migration** (6 records from 8
  emailed links locally) rather than by a script someone has to remember; names
  come from a human-typed label, never the auto "Candidate 3" handle.
- **The journey** — every assessment ever sent to a person, newest first, with
  status/score/verdict and a jump to each report. Matches on `candidate_id` or,
  for pre-backfill stragglers, the address.
- **Send another test** — a shortcut into the *existing* invite flow with
  identity pre-filled, from the record or from a completed report. Same
  endpoint, same duplicate warning, same email. **Email edits refuse
  collisions** (409 naming the other record) — merging is out of scope, and a
  silent merge would destroy history.
- **Shareable report links** — `ReportShare {session_id, token, revoked_at}`,
  several per report, each revocable. The read path is a **separate
  authorisation path**: `getReport(ownerId, …)` and `getSharedReport(token)`
  are two wrappers over one builder, and a share token is not a JWT so it
  cannot even be presented to the two middlewares. Probed against 10 other
  endpoints → 401/404 on every one. The shared response has the candidate
  **record stripped** (and with it their email), so the page shows no record
  link and no send-another. `/r/:token`, outside the app shell entirely.
- **PDF export** — manager view and shared view. Puppeteer renders **our own
  template via `setContent`**, not the SPA route: no cookie in a headless
  browser, no dependency on the web app running. Built from the same
  `ReportView` the page renders, so it cannot show different numbers. **Capped,
  not queued** (one reused browser, 2 concurrent, streamed back) because R2 is
  not configured and a queued job would have nowhere to write — `pdf_url` /
  `pdf_status` stay unused. Chromium is still not downloaded by `npm install`;
  a missing browser answers **503 with the install command**.

Build spec: `docs/BUILD_POST_ASSESSMENT.md`.

### Candidate-side robustness (merged to `develop`, PR #33)
Three gaps a real candidate or manager hits immediately, all pre-existing.

- **Answers survive the clock.** Drafts autosave (3s debounce, on blur, when
  the tab hides, before the session closes) to `answer_drafts` — **a separate
  table, not columns on `Answer`**, because an Answer row is what counts
  progress, feeds scoring and fills the report, and a draft living there would
  have to be filtered out of every one of those paths. At expiry the latest
  draft becomes the answer with `source: draft_at_expiry`, labelled on the
  report as "Auto-submitted from draft at time-up". **`EXPIRY_GRACE_SECONDS =
  10`** lets the in-flight autosave land; it never extends the visible timer,
  and a write inside it records a `late_write` event the report frames as
  mechanics, not suspicion. **Resume**: a link with an unfinished session now
  resumes instead of answering `LINK_USED` — work you can't get back to isn't
  saved work — with the store in `sessionStorage` for the fast path. Closes
  follow-ups #7 and #9.
- **Link expiry a manager chooses.** `expires_at` already existed and was
  already enforced; it is now **nullable** (NULL = no expiry) and picked at
  invite time (3 / 7 / 14 days / none, default 7). Expiry gates *starting*
  only — a session in progress is governed by its own timer. An expired link
  answers `LINK_EXPIRED` with its own page, and can be extended from the row,
  counted from today.
- **Reminders.** Manual per link (reports sent / failed / skipped, stamps the
  time). Automatic opt-in per assessment (`auto_reminder_days`, off by
  default), swept daily at **09:00 UTC** plus once ~10s after worker boot —
  safe because `auto_reminder_sent_at` caps it at **one automatic reminder per
  link, ever**.
- **Preview as candidate.** `/preview/:assessmentId` renders the *same*
  candidate components behind the manager's login: real timer, real
  disclosures, real probes. `Session.is_preview` excludes it from everything —
  the submit path returns before the scoring queue, and a preview has no link,
  so nothing that walks links can see it. Banner on every screen; previews
  older than 24h are deleted when the next one starts.

Build spec: `docs/BUILD_CANDIDATE_ROBUSTNESS.md`.

### Completeness wave (built, PR open to `develop`)
Four features that make the product feel finished rather than functional.

- **Assessment templates.** `AssessmentTemplate` (owner NULL = built-in).
  Picking one fills the builder in and hands it back fully editable — a
  template never creates anything. Five built-ins seeded **from what the bank
  actually contains** (Backend Screen, Senior Deep Dive, API & Integrations,
  Auth & Security, Data & Messaging); the seeder skips any it can't fill to two
  thirds, so no role is offered that the bank can't assess. `question_ids` is a
  plain array: a question archived later is dropped **with a visible count**,
  never silently. "Save as template" on any assessment.
- **Bank management.** Server-side pagination (25/50) + filters (status,
  difficulty, type, source, tag, archived), search across text *and* topic, and
  sort (newest / oldest / most used / topic) — closing follow-up #8. Tags
  (`Question.tags`, de-duplicated case-insensitively). Edit in place through
  the same rubric fields as review, **never changing status**. Soft archive with
  its own filter and restore. Export (own questions, full rubric) and import
  that **always lands as drafts**. Per-question usage (assessments used in,
  mean score) computed per page.
- **THE SNAPSHOT** — the decision worth knowing about. `AssessmentQuestion` now
  copies the question text and all four guides at assessment creation, and the
  candidate flow, probe generator, scorer and report all read the copy.
  Editing a question therefore cannot rewrite what a past candidate was asked
  or how they were scored. Tradeoff accepted: an assessment does **not** pick up
  later improvements. Columns are nullable with live fallback, so pre-snapshot
  rows behave as before.
- **Live interview kit.** One `GENERATION_MODEL` call over a scored report →
  3–5 questions each tied to a specific weakness, strong/weak answer shapes,
  red flags, a 30-minute agenda. Cached on `Session.interview_kit`,
  regenerable, in the owner's PDF. **Never stubbed** (no key → 503) and
  **interviewer-only**: the shared report builder nulls it, so neither the
  shared view nor the shared PDF can carry it.
- **Practice follow-ups.** The same generator and the same defense scorer as
  the interviewer side (extracted as `generatePracticeProbe` /
  `scoreDefenseText`), stateless — no interviewer-side rows. Feedback leads
  with the delta plus a coaching line. **SR rule**: delta >40 behaves like
  `missed`, 21–40 like `partial`, ≤20 changes nothing — and it can only ever
  bring a review **forward**, never push one back.

Build spec: `docs/BUILD_COMPLETENESS.md`.

### Job-seeker flow (Prepare mode)
Spaced-repetition deck, timed practice with AI feedback, STAR story bank with
AI tagging, and JD decode — all on the same question bank, using only the
`_display` rubric fields.

### Model roles
| Task | Model | Why |
|---|---|---|
| Rubric scoring | `claude-sonnet-4-6` @ temp 0 | determinism required by docs/04 |
| Question + rubric generation | `claude-sonnet-4-6` @ temp 0.7 | judgement task; variety wanted |
| JD decode, story tagging | `claude-haiku-4-5` | cheap peripheral work |
| Per-file repo analysis | `claude-haiku-4-5` | many small calls over a file selection |
| Findings synthesis | `claude-sonnet-4-6` @ temp 0 | judgement across the whole scan |
| Document sufficiency check | `claude-haiku-4-5` (`DECODE_MODEL`) | one cheap call in front of a textarea |
| Follow-up probe generation | `claude-haiku-4-5` (`PROBE_MODEL`) | a candidate is waiting: 8s budget, ~2s on Haiku vs 6-8s on Sonnet |
| Defense scoring | `claude-sonnet-4-6` @ temp 0 (`SCORING_MODEL`) | the same scorer, on a reduced rubric |

All overridable via `SCORING_MODEL` / `GENERATION_MODEL` / `DECODE_MODEL` /
`TAGGING_MODEL` / `ANALYSIS_MODEL` / `SYNTHESIS_MODEL` / `PROBE_MODEL`. No `ANTHROPIC_API_KEY` → scoring falls back to a dev stub and
decode to a keyword heuristic (both self-identify via `source`); generation has
no stub and fails loudly, because a fabricated rubric is indistinguishable from
a real one.

**Not in v1.1.0:** PDF export (Puppeteer → R2; the `pdf_url`/`pdf_status` columns
exist), team accounts, analytics, automated tests, and production deploy/auth
hardening — all unchanged deliberate exclusions from v1.0.0.

---

## How to run & test locally (all commands verified working)

From `assessiq/`:

```bash
# 1. Start infra (postgres on host port 5434, redis on 6379)
docker compose up -d

# 2. Install deps (first time only)
npm install                       # Chromium download is skipped via .npmrc

# 3. Migrate + seed (first time, or after schema changes)
npm run db:migrate                # prisma migrate dev
npm run db:seed                   # 10 questions (idempotent — safe to re-run)

# 4a. Run the API alone
npm run dev --workspace=apps/api  # http://localhost:3001  → GET /health
# 4b. Run the web app alone
npm run dev --workspace=apps/web  # http://localhost:5173 (proxies /api → :3001)
# 4c. Run both
npm run dev

# Inspect the DB visually
npm run db:studio                 # Prisma Studio GUI
```

**In the browser:** open `http://localhost:5173`, log in with
`dev@assessiq.local` / `password123` (pre-filled), and you land on the Question Bank
(10 questions, filter + search, expand a row to see the display rubric).

**Quick smoke tests:**
```bash
curl http://localhost:3001/health
# → {"status":"ok","service":"assessiq-api"}

# Auth + questions (cookie jar). API base is /api/v1.
curl -s -c /tmp/c.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@assessiq.local","password":"password123"}'
curl -s -b /tmp/c.txt "http://localhost:3001/api/v1/questions?difficulty=senior"

docker exec assessiq-postgres-1 psql -U postgres -d assessiq -c "SELECT topic,difficulty FROM questions;"
# → 10 rows
```

There are **no automated tests yet** — Phase 0 is manual testing only, by design
(`docs/10-mvp-scope.md`: "Do NOT write unit tests in Phase 0"). Add tests in Phase 1.

---

## Local-environment specifics & gotchas (IMPORTANT for a fresh session)

- **Postgres host port is 5434, not 5432.** Host 5432 was taken by another local
  project (`SaveLoom-postgres`). `docker-compose.yml` maps `5434:5432` and
  `apps/api/.env` `DATABASE_URL` uses `5434`. Container-internal port is still 5432.
  `.env.example` keeps the canonical 5432 for clean environments.
- **Puppeteer Chromium download is skipped** (`assessiq/.npmrc`:
  `puppeteer_skip_download=true`). Only needed for the Phase-1 PDF worker. Install
  later with: `npx puppeteer browsers install chrome`.
- **`apps/web/package.json` needs `"type": "module"`** — without it, `postcss.config.js`
  (ESM `export default`) fails to load with "Unexpected token 'export'". Already fixed;
  keep it.
- **Scoring model:** the scorer uses `claude-sonnet-4-6` (a real, active model — an
  earlier note in this repo wrongly called it fake). It's chosen because the spec wants
  `temperature: 0` for deterministic scoring, and temperature is only accepted on Sonnet 4.6
  and earlier (Sonnet 5 / Opus 4.7+ reject it — they use adaptive thinking + effort). Override
  with `SCORING_MODEL`. If moving to a newer model, drop `temperature`. **No `ANTHROPIC_API_KEY`
  locally** → the worker uses a deterministic dev stub (`model_used: 'stub-dev'`); set a real key
  to score for real. Verify model ids against the `claude-api` skill.
- **No assistant prefill on Sonnet 4.6+.** Seeding a reply with an opening `{` to force
  JSON returns a 400 ("This model does not support assistant message prefill") on the
  scoring/generation/synthesis models; Haiku 4.5 still accepts it, so a pipeline mixing
  the two fails only at the Sonnet stage. `analysis.service`'s `call()` instead extracts
  the first balanced `{...}` from the reply and, on prose, restates the contract and asks
  once more. Don't reintroduce prefill.
- **Prisma quirks:** `BehaviorEvent.timestamp` is `BigInt` — convert with `Number(...)`
  before sending to the frontend. `Score.total_pct` is stored, not computed at query time.
- **Candidates are NOT Users.** They have no account row; they exist only as
  `Session.candidate_label` (a string) + a signed link token.
- **`_guide` vs `_display` on Question:** `_guide` fields are private (Claude scoring
  only) — NEVER send them to the frontend during an assessment. `_display` fields are
  shown in study mode after answer reveal.

---

## Next wave — post-v1.1.0

**`docs/BLUEPRINT_POST_EPIC.md` is fully delivered**: **A. document-grounded
generation** (PR #29), **B. automated follow-up probes** (PR #30) and **D. the
code snippet field** (PR #31) are all merged. Sections **C** (pricing /
multi-tenancy) and **E** (live manager mode) remain designs only, each with a
stated trigger to revisit.

Three waves have shipped since: **the post-assessment layer**
(`docs/BUILD_POST_ASSESSMENT.md` — candidate records, send-another, shareable
report links, PDF export, merged as PR #32) and **candidate-side robustness**
(`docs/BUILD_CANDIDATE_ROBUSTNESS.md` — autosave + expiry grace, link expiry +
reminders, preview as candidate) and **the completeness wave**
(`docs/BUILD_COMPLETENESS.md` — templates, bank management, the live interview
kit, practice follow-ups). All three are described in the status section above.
**Follow-ups #2, #7, #8 and #9 are therefore closed.**

### Follow-ups and deliberate exclusions

Nothing is half-finished; these are known gaps, roughly in value order.

1. **Automated tests.** There are still none — Phase 0 was manual by design
   (`docs/10-mvp-scope.md`). The highest-value first targets are the scoring
   maths (`score-calc`, now including the override recompute), the pool
   thresholds in `generation.service`, the `_guide`-never-leaks guarantee, and
   the "an override never writes an AI score column" invariant.
2. ~~PDF export~~ — **done** in the post-assessment wave, rendering a
   server-side template rather than the SPA route, and capped rather than
   queued. What remains of the original plan is the **R2 upload** those
   `pdf_url` / `pdf_status` columns exist for; until then a PDF is generated
   per request and streamed, never stored. Chromium must be installed once:
   `npx puppeteer browsers install chrome`.
3. **Deploy + auth hardening** — Railway per `docs/06`, real Google OAuth
   credentials, rate limiting.
4. **Generation dedup.** Batched generation calls don't see each other's output,
   so one request can produce near-duplicate drafts (measured ~1 in 15).
5. **Override reach.** Overrides are per-question only. A session-level "I
   disagree with this verdict" and a filter for overridden reports are the
   obvious follow-ups; neither is needed for the human to have the final say.
6. **`flagged_only` never sees a score.** The mode is specified as "paste flag
   OR top scoring band", but scoring is asynchronous and nothing is scored
   until session submit, so at answer-submit time the paste flag is the only
   signal that exists. Closing the gap means either scoring answers as they
   arrive (a real change to the queue's shape) or accepting that the top-band
   half of that rule is unreachable. Currently the latter, stated in the code
   at `probeIsDue`.
7. ~~A server-expired session never enqueues scoring~~ — **done** in the
   candidate-robustness wave. `closeExpiredSession` now promotes drafts,
   finalises probes AND queues scoring, so an abandoned tab still produces a
   report.
8. ~~The bank page shows only the first 100 questions~~ — **done** in the
   completeness wave: server-side pagination, filters on every axis, and
   newest-first by default.
9. ~~An in-progress answer is not submitted when the timer expires~~ —
   **done** in the candidate-robustness wave: drafts autosave, a 10s server
   grace window absorbs the last one, and at expiry it is promoted to the
   answer and labelled as such on the report.

10. **Share links have no time-based expiry.** Revocation only, deliberately
    scoped that way for this wave. An expiring share (and a "revoke all" on a
    report) are the obvious follow-ups.
11. **Merging two candidate records is not possible.** An email edit that
    would collide is refused with the other record named; the manager has to
    resolve it by hand. Out of scope this wave on purpose — a merge silently
    picking a name, notes and history is a destructive operation with no undo.

12. **Preview sessions leave `pending` answers behind until cleanup.** A
    preview never enqueues scoring, so its answers sit at `scoring_status:
    pending` for up to 24h before the next preview deletes the session. Inert
    — nothing sweeps pending answers globally — but it means "pending" is not
    a reliable global signal if anything ever wants one.
13. **Automatic reminders are one-shot by design.** A link that was reminded
    once is never reminded again automatically, even if the expiry is later
    extended by weeks. Manual reminders are the escape hatch; a "reset the
    automatic reminder when a link is extended" rule is the obvious follow-up
    if anyone wants it.

14. **The bank is shared, so edit and archive are too.** Every manager already
    sees every question through `GET /questions`; editing follows that rule and
    is not owner-scoped. If the bank ever becomes per-owner, edit/archive need
    the same scoping as everything else.
15. **Assessments don't pick up question improvements.** The deliberate cost of
    the snapshot (above). A "refresh this assessment from the bank" action is
    the obvious escape hatch if anyone wants one.
16. **Built-in templates are only as good as the bank.** They are composed at
    seed time and refreshed by re-running the seed; they do not track the bank
    automatically, and a very small bank silently yields fewer of them.

Closed since v1.1.0: the synthesis-prompt risk skew (`56c6c50` — the prompt now
asks for at least three finding kinds and caps any one at half the set; verified
by a document-grounded run coming back rca / conceptual / design).

---

## When updating this file

Keep the **Current status** and **Next steps** sections current as work progresses —
they are the fastest way for a new session to know where things stand. Update the
checkboxes and move completed weeks into the status summary.
