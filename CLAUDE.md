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

### Document grounding (Feature A — built, PR open to `develop`)
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

### Follow-up probes (Feature B — built, PR open to `develop`)
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

**The plan is `docs/BLUEPRINT_POST_EPIC.md`.** Both of its buildable features
are now done: **A. document-grounded generation** (merged to `develop`, PR #29)
and **B. automated follow-up probes** (on `feat/followup-probes`, PR open) —
both described in the status section above. Sections C/D/E of the blueprint are
designs only — deliberately not built, each with a stated trigger to revisit.
With B merged there is no queued feature work; the follow-ups below are the
list.

### Follow-ups and deliberate exclusions

Nothing is half-finished; these are known gaps, roughly in value order.

1. **Automated tests.** There are still none — Phase 0 was manual by design
   (`docs/10-mvp-scope.md`). The highest-value first targets are the scoring
   maths (`score-calc`, now including the override recompute), the pool
   thresholds in `generation.service`, the `_guide`-never-leaks guarantee, and
   the "an override never writes an AI score column" invariant.
2. **PDF export** (Puppeteer → R2). Columns exist; Chromium download is skipped
   locally via `.npmrc` (`npx puppeteer browsers install chrome` to enable).
   Note it must render the override alongside the AI score, not instead of it.
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
7. **A server-expired session never enqueues scoring.** `ensureActive`
   auto-submits a session whose timer elapsed but does not queue its answers,
   so a candidate who abandons the tab past the deadline gets no report. Only
   reachable when the client-side timer never fires; predates the probes work,
   found while reading that path.
8. **The bank page shows only the first 100 questions.** `QuestionBankPage`
   fetches `limit: 100` ordered oldest-first with no pagination control, so the
   newest questions — including freshly generated grounded ones — are reachable
   only through search. Pre-dates Feature A; noticed while testing it.

Closed since v1.1.0: the synthesis-prompt risk skew (`56c6c50` — the prompt now
asks for at least three finding kinds and caps any one at half the set; verified
by a document-grounded run coming back rca / conceptual / design).

---

## When updating this file

Keep the **Current status** and **Next steps** sections current as work progresses —
they are the fastest way for a new session to know where things stand. Update the
checkboxes and move completed weeks into the status summary.
