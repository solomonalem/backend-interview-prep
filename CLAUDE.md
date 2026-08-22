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

All overridable via `SCORING_MODEL` / `GENERATION_MODEL` / `DECODE_MODEL` /
`TAGGING_MODEL` / `ANALYSIS_MODEL` / `SYNTHESIS_MODEL`. No `ANTHROPIC_API_KEY` → scoring falls back to a dev stub and
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

**The plan is `docs/BLUEPRINT_POST_EPIC.md`** — read it before building any of
it. Two features, sequenced: **A. document-grounded generation** (a middle
grounding tier for companies that will never grant repo access, with an
elicitation loop when the document is too thin) then **B. automated follow-up
probes** (defend your own answer under a short timer; the delta between answer
and defense is the signal). Build specs: `docs/BUILD_DOCUMENT_GROUNDING.md` and
`docs/BUILD_FOLLOWUP_PROBES.md`. Sections C/D/E of the blueprint are designs
only — deliberately not built.

### Follow-ups and deliberate exclusions

Nothing is half-finished; these are known gaps, roughly in value order.

1. **Tune the synthesis prompt for findings-kind spread.** Verified the risk
   skew is the prompt, not the repo: 75% / 67% risk across two unrelated
   repositories, with no other kind exceeding a single finding. Address before
   or during Feature A — the generation disposition it inherits should prefer a
   spread of question angles over gotcha-hunting.
2. **Automated tests.** There are still none — Phase 0 was manual by design
   (`docs/10-mvp-scope.md`). The highest-value first targets are the scoring
   maths (`score-calc`, now including the override recompute), the pool
   thresholds in `generation.service`, the `_guide`-never-leaks guarantee, and
   the "an override never writes an AI score column" invariant.
3. **PDF export** (Puppeteer → R2). Columns exist; Chromium download is skipped
   locally via `.npmrc` (`npx puppeteer browsers install chrome` to enable).
   Note it must render the override alongside the AI score, not instead of it.
4. **Deploy + auth hardening** — Railway per `docs/06`, real Google OAuth
   credentials, rate limiting.
5. **Generation dedup.** Batched generation calls don't see each other's output,
   so one request can produce near-duplicate drafts (measured ~1 in 15).
6. **Override reach.** Overrides are per-question only. A session-level "I
   disagree with this verdict" and a filter for overridden reports are the
   obvious follow-ups; neither is needed for the human to have the final say.

---

## When updating this file

Keep the **Current status** and **Next steps** sections current as work progresses —
they are the fastest way for a new session to know where things stand. Update the
checkboxes and move completed weeks into the status summary.
