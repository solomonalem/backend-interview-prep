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

## Current status — Phase 0, Weeks 1–2 COMPLETE ✅

Per `docs/10-mvp-scope.md` build order.

**Week 1 (scaffold):**
- [x] Monorepo (apps/web, apps/api, packages/types), Docker Compose (postgres+redis)
- [x] Prisma schema + initial migration (all 13 tables), 10 seeded questions
- [x] Express `/health` route; web app builds (tsc + vite + Tailwind)

**Week 2 (auth + questions):**
- [x] Auth: `POST /auth/login` (email+password, scrypt), `POST /auth/google` (OAuth
      exchange — needs real creds), `POST /auth/logout`, `GET /auth/me`. JWT in httpOnly
      `assessiq_token` cookie. Routes mounted at **`/api/v1`**.
- [x] `authInterviewer` middleware (verifies cookie → `req.interviewer`)
- [x] `GET /questions` (topic/difficulty/type/domain/search + pagination) and
      `GET /questions/:id` — both strip `_guide` fields (verified not leaked)
- [x] Shared types in `packages/types` (source-resolvable via `exports: ./src/index.ts`)
- [x] Frontend: API client (cookie-based), `useAuth` context, LoginPage,
      ProtectedRoute, QuestionBankPage (list + filter + expandable rubric)
- [x] Dev interviewer seeded for local login: **`dev@assessiq.local` / `password123`**
- [x] Verified end-to-end through the Vite proxy (login → cookie → questions)

Both apps type-check clean (`tsc --noEmit`). **Core-loop Steps 1–2 done:**
- **Step 1** — assessments + links backend, with Builder/Detail/Dashboard wired (real create → link → live statuses).
- **Step 2** — candidate session backend + wired screens: validate link → timed one-at-a-time
  session → passive proctoring events → submit. Link status flips to `submitted`.
- **Step 3** — AI scoring: BullMQ + Redis scoring queue/worker (`workers/`, run via
  `npm run dev:worker`), `scoring.service` (Claude `claude-sonnet-4-6` @ temp 0, with a dev stub
  when no API key), `report.service` (compiles overall %, verdict, proctoring counts on completion).
  Enqueued per answer on submit. Real Score + Report rows now exist; link `overall_score` populates.

**Not yet built (backend):** the real report API + wiring the mock ReportPage to it, PDF (Puppeteer),
and email (Resend) — Step 4.

**Frontend UI redesign (done, ahead of backend):** Modern-SaaS indigo design system
(`components/ui/*` primitives, `components/layout/AppShell` with a Hire⇄Prepare mode
switch, Inter + lucide-react). **All screens for all three modes are built** and routed:
- Interviewer: Dashboard, Question Bank (real API), Assessment Builder, Assessment Detail, Report
- Job seeker: Study Dashboard, Review Cards, Timed Practice, Story Bank, Target-a-Role
- Candidate: Link Landing, Session (timer), Submitted
Screens without a backend yet run on **mock data in `apps/web/src/data/mock.ts`** (shapes
mirror docs/08) — swap for real endpoints as each backend lands. Auth + question bank use
the real API. Full app builds clean (`npm run build --workspace=apps/web`).

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
- **Prisma quirks:** `BehaviorEvent.timestamp` is `BigInt` — convert with `Number(...)`
  before sending to the frontend. `Score.total_pct` is stored, not computed at query time.
- **Candidates are NOT Users.** They have no account row; they exist only as
  `Session.candidate_label` (a string) + a signed link token.
- **`_guide` vs `_display` on Question:** `_guide` fields are private (Claude scoring
  only) — NEVER send them to the frontend during an assessment. `_display` fields are
  shown in study mode after answer reveal.

---

## Next steps — Core loop Step 4: real report + notifications

Scores + reports now exist in the DB. Step 4 exposes them and closes the loop.

1. **`GET /reports/session/:id`** (authInterviewer, must own the assessment) — compile the full
   report response from `docs/08` (session, overall + component avgs, proctoring counts + timeline
   from `behavior_events`, per-question score breakdown with hit/miss + probe + confidence flag).
   Return `202 { status: 'scoring_in_progress', ... }` if the Report row doesn't exist yet.
2. **Wire the mock `ReportPage`** (`apps/web/.../interviewer/ReportPage.tsx`) to it, and point the
   Detail/Dashboard "View report" links at the real session id (they already link to `/reports/:id`).
3. **Email on report ready** (Resend) — send the interviewer a link when `compileReport` finishes
   (there's a `TODO (Step 4)` marker in `report.service.ts`).
4. **PDF** (Puppeteer → R2) — deferred/optional; the `pdf_url`/`pdf_status` columns already exist.

To score for real (not the stub), set `ANTHROPIC_API_KEY` in `apps/api/.env` and run the worker
(`npm run dev:worker`).

**Reusable pieces in place:** `AppError`/`asyncHandler`, `authInterviewer`/`authCandidate`,
`generateToken`, the zod-validate-then-service route shape, `deriveLinkStatus`/`linkOverallScore`,
`prisma` singleton, score-calc utils, the scoring queue/worker, the frontend `api` client (+`bearer`)
/ `useAuth` / candidate store, and the already-built mock `ReportPage` to wire up.

**Phase 0 is "done" when** an interviewer can build a 5-question assessment, a candidate
takes it via link, Claude scores it in the background, and the interviewer gets an
emailed report — with zero manual intervention. (`docs/10-mvp-scope.md` "The MVP Test".)

---

## When updating this file

Keep the **Current status** and **Next steps** sections current as work progresses —
they are the fastest way for a new session to know where things stand. Update the
checkboxes and move completed weeks into the status summary.
