# AssessIQ — Claude Code Autonomous Development Prompt

You are autonomously developing **AssessIQ** — a proctored, rubric-based technical assessment platform.

Your full specification lives in the `assessiq-docs/` folder. Read every file in that folder before writing a single line of code. Start with `README.md`, then read files `01` through `10` in order.

---

## GIT & REPO SETUP — DO THIS FIRST, BEFORE ANY CODE

### Step 1 — Check if a git repo exists

```bash
git status
```

- If the command fails (not a git repo): run `git init`
- If it succeeds: continue to Step 2

### Step 2 — Check if a remote upstream exists

```bash
git remote -v
```

- If no remote exists: create a GitHub repo and add it as origin

```bash
# Create repo via GitHub CLI (install gh if not available: brew install gh or apt install gh)
gh repo create assessiq --private --source=. --remote=origin --push

# If gh CLI is not available, create the repo manually on GitHub then:
git remote add origin git@github.com:<YOUR_GITHUB_USERNAME>/assessiq.git
```

- If a remote already exists: skip creation, just use it

### Step 3 — Set up `.gitignore` immediately (before any commits)

Create `.gitignore` in the root:

```
node_modules/
dist/
.env
.env.local
.env.*.local
*.log
.DS_Store
Thumbs.db
.vscode/settings.json
.idea/
coverage/
.nyc_output/
prisma/migrations/dev.db
*.sqlite
.turbo/
.next/
```

### Step 4 — Make the initial commit

```bash
git add .gitignore assessiq-docs/ README.md
git commit -m "chore: initial project setup with specification docs"
git push -u origin main
```

---

## BRANCHING STRATEGY — FOLLOW THIS FOR ALL WORK

### Branch naming

```
main          ← production-ready code only. Never commit directly to main.
develop       ← integration branch. All feature branches merge here.

Feature branches (cut from develop):
  feat/<short-description>        e.g. feat/auth-routes
  feat/<scope>/<short-desc>       e.g. feat/api/scoring-engine

Fix branches:
  fix/<short-description>         e.g. fix/session-timer-overflow

Chore branches:
  chore/<short-description>       e.g. chore/prisma-schema-setup
  chore/deps/<description>        e.g. chore/deps/install-bullmq
```

### Branch workflow

```bash
# Always start from develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feat/auth-routes

# Work, commit, push
git push -u origin feat/auth-routes

# When feature is complete: merge to develop (no PR needed — this is solo dev)
git checkout develop
git merge feat/auth-routes --no-ff -m "merge: feat/auth-routes into develop"
git push origin develop
git branch -d feat/auth-routes
```

### When to cut a release to main

After completing each phase milestone (end of Phase 0, Phase 1, etc.):

```bash
git checkout main
git merge develop --no-ff -m "release: phase-0 mvp core loop complete"
git tag -a v0.1.0 -m "Phase 0 MVP — core assessment loop"
git push origin main --tags
```

---

## COMMIT RULES — FOLLOW ALWAYS, NO EXCEPTIONS

### Commit message format (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body — what changed and why, not how]

[optional footer — breaking changes, closes issues]
```

**Types:**
- `feat` — new feature or behaviour
- `fix` — bug fix
- `chore` — tooling, deps, config (no production code change)
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `test` — adding or updating tests
- `style` — formatting, linting (no logic change)
- `perf` — performance improvement

**Scopes** (use these consistently):
- `api` — backend Express routes / services
- `web` — frontend React
- `db` — Prisma schema or migrations
- `worker` — BullMQ workers
- `auth` — authentication
- `scoring` — Claude scoring engine
- `proctoring` — behavior tracking
- `report` — report generation
- `study` — job seeker study mode
- `types` — shared types package
- `infra` — Docker, CI, deployment config
- `deps` — dependency changes

### Good commit examples

```
feat(api): add GET /questions with topic and difficulty filters
feat(web): implement candidate session timer with auto-submit
feat(db): add Score and BehaviorEvent models to prisma schema
feat(scoring): integrate Claude API for rubric-based answer scoring
feat(proctoring): add tab switch and paste detection event listeners
fix(api): handle session JWT expiry during active assessment
fix(scoring): retry Claude API call on JSON parse failure
chore(deps): install bullmq, ioredis, and @anthropic-ai/sdk
chore(infra): add docker-compose for local postgres and redis
refactor(api): extract scoring logic into dedicated service layer
feat(report): compile per-question scores and proctoring flags into report
```

### When to split into multiple commits

Split a large change into multiple commits when it touches more than one of these:
- Schema change AND route change → separate commits
- New dependency AND feature using it → separate commits
- Backend service AND frontend calling it → separate commits
- Multiple unrelated features done at once → one commit each

**Rule of thumb:** If the commit message needs "and" to describe it, split it.

```bash
# Bad — do not do this
git commit -m "feat: add auth, questions route, and prisma setup"

# Good — three separate commits
git commit -m "chore(db): add prisma schema with User and Question models"
git commit -m "feat(auth): implement Google OAuth and JWT middleware"
git commit -m "feat(api): add GET /questions with filters"
```

---

## WHEN TO COMMIT — AUTONOMOUS RULES

Commit and push immediately after completing any of these:

| Trigger | Branch | Commit type |
|---------|--------|-------------|
| Scaffold monorepo structure | `chore/monorepo-setup` | `chore` |
| Install a group of related dependencies | `chore/deps/...` | `chore(deps)` |
| Add or change Prisma schema | `feat/db/...` | `feat(db)` |
| Add a Prisma migration | same branch as schema change | `chore(db)` |
| Complete one API route (working end-to-end) | `feat/api/...` | `feat(api)` |
| Complete one React page or component | `feat/web/...` | `feat(web)` |
| Complete a BullMQ worker | `feat/worker/...` | `feat(worker)` |
| Fix a bug found during development | `fix/...` | `fix(scope)` |
| Add environment variable config | same feature branch | `chore` |
| Update `.gitignore` or tooling config | `chore/...` | `chore` |
| Complete a full feature (e.g. entire auth flow) | merge to develop | merge commit |

**Do not wait.** Commit as soon as a unit of work is stable — even if the overall feature is not done. The next commit builds on a known-good state.

---

## AUTOMATED GIT HELPER — USE THESE COMMANDS

When you need to commit, always run in this order:

```bash
# 1. Check what changed
git status
git diff --stat

# 2. Stage only what belongs in this commit (never git add -A blindly)
git add <specific files or directories>

# 3. Commit with a proper message
git commit -m "feat(api): add POST /assessments route with timer config"

# 4. Push immediately
git push origin <current-branch>
```

Check current branch before every commit:
```bash
git branch --show-current
```

If you are on `main` by accident, stash and move to develop:
```bash
git stash
git checkout develop
git stash pop
```

---

## DEVELOPMENT EXECUTION ORDER

Read `assessiq-docs/10-mvp-scope.md` for the full Week 1–6 build order.

Follow this sequence strictly. Do not skip ahead.

### Immediate first actions (in this exact order):

1. Read all files in `assessiq-docs/`
2. Set up git + remote (steps above)
3. Create `develop` branch: `git checkout -b develop && git push -u origin develop`
4. Cut branch: `git checkout -b chore/monorepo-setup`
5. Scaffold the monorepo from `assessiq-docs/09-project-structure.md`
6. Commit: `chore: scaffold monorepo structure for assessiq`
7. Push + merge to develop
8. Cut branch: `chore/deps/api-initial`
9. Install all API dependencies from `09-project-structure.md`
10. Commit: `chore(deps): install api dependencies`
11. Cut branch: `chore/deps/web-initial`
12. Install all web dependencies
13. Commit: `chore(deps): install web dependencies`
14. Cut branch: `chore/infra/docker-compose`
15. Add `docker-compose.yml` from `09-project-structure.md`
16. Add `.env.example` from `06-tech-stack.md`
17. Commit: `chore(infra): add docker-compose for postgres and redis`
18. Cut branch: `feat/db/prisma-schema`
19. Copy Prisma schema from `07-data-model.md` into `apps/api/prisma/schema.prisma`
20. Run `npx prisma migrate dev --name init`
21. Commit schema: `feat(db): add full prisma schema with all entities`
22. Commit migration: `chore(db): run initial prisma migration`
23. Write seed file, run `npx tsx prisma/seed.ts`
24. Commit: `chore(db): add seed script with 50 starter questions`
25. Merge all to develop
26. Continue with Week 2 (auth routes) from `10-mvp-scope.md`

---

## ERROR HANDLING DURING DEVELOPMENT

- If a package install fails: try with `--legacy-peer-deps`, commit the working state, note the issue in the commit body
- If a migration fails: roll back with `npx prisma migrate reset`, fix the schema, re-migrate
- If Claude API returns unexpected output: log the raw response, do not crash — mark the answer as `scoring_status: 'failed'` and continue
- If a git push fails due to conflicts: `git pull --rebase origin <branch>`, resolve, push again
- Never force push to `main` or `develop`
- Never commit `.env` — it is in `.gitignore`. Use `.env.example` for documentation.

---

## REMINDERS

- Read the spec files. Do not invent behaviour not described in them.
- `assessiq-docs/04-scoring-engine.md` has the exact Claude prompt — use it verbatim.
- `assessiq-docs/07-data-model.md` has the complete Prisma schema — do not modify it without a reason.
- `assessiq-docs/08-api-routes.md` has every endpoint shape — match it exactly.
- Candidates never have accounts. They access via signed token URL only.
- `temperature: 0` on all Claude scoring calls. Non-negotiable.
- Never expose `_guide` rubric fields to the frontend in assessment mode.
- The scoring queue is async. The candidate submit endpoint returns immediately — never await scoring.
- `BehaviorEvent.timestamp` is `BigInt` in Prisma — convert to `Number()` before sending to frontend.