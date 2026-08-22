# AssessIQ — Repo-Grounded Question Generation

## Architecture & Implementation Design (Phase 3 — Epic Branch)

> Status: DESIGN — this file is the authoritative spec for the feature.
> Build happens on a long-lived branch `epic/repo-grounding` off develop.
> This is the moat feature: generate interview questions grounded in a team's ACTUAL codebase,
> so questions test reasoning about the real system a candidate would work on.
> Also parked for the very end of the product: score-to-hire correlation (see final section).

## HOW TO USE THIS DOCUMENT (instructions for Claude Code)

- Read this ENTIRE document before writing any code.
- Build in the slice order of section 9, one slice per PR into `epic/repo-grounding` —
  create that branch off develop first if it doesn't exist. Do NOT merge the epic to develop
  until all four slices work end-to-end.
- Follow the existing project conventions: conventional commits, verify commits land in the PR,
  end each slice with a clear "PR is final — safe to merge", stop pushing after that signal.
- The security rules in section 2 are NON-NEGOTIABLE — especially: never store source code
  (not in the DB, not in logs, not in error messages), owner-scoped 404s, contents:read only.
- PREREQUISITE before Slice 1 can be tested: the human must register the GitHub App on
  github.com and provide GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET in
  apps/api/.env. Build Slice 1 code first if the credentials aren't present yet, but say
  clearly what's untestable until they exist.
- Reuse existing infrastructure everywhere it fits: BullMQ queues, the generation service,
  the review panel, draft/vetted status, useLiveRefresh polling, the owner-scoped auth pattern.
- If anything in this spec conflicts with the codebase's current reality, flag it and propose —
  don't silently deviate.

---

## 1. THE FEATURE IN ONE PARAGRAPH

A hiring manager connects a GitHub repository (read-only, their choice of repo). AssessIQ scans it,
detects the real stack and patterns (e.g. "this service uses optimistic concurrency", "there's an
outbox table", "queues use at-least-once delivery"), and generates interview questions grounded in
those findings — each with a full four-part rubric and a citation to what in the repo motivated it.
Every generated question goes through the existing draft → human review → vetted pipeline before any
candidate can see it. Source code is NEVER stored — only derived findings and citations.

---

## 2. SECURITY MODEL (decide-first — this gates everything)

### 2.1 Access: GitHub App, not OAuth tokens

Use a **GitHub App** (not a personal OAuth token):

- The manager installs the app on their account/org and SELECTS SPECIFIC REPOS — never "all repos".
- Permissions requested: `contents: read` ONLY. No write, no issues, no metadata beyond default.
- Installation tokens are short-lived (1 hour, auto-refreshed via the app's private key) — nothing
  long-lived to leak.
- The manager can revoke from GitHub at any time; we handle revocation gracefully (integration
  marked disconnected, derived data retained, no re-scan possible).

**The connection flow, user-side:** the manager clicks "Connect GitHub" in AssessIQ → is sent to
github.com → GitHub shows THEM the permission screen and the repo picker → they approve → GitHub
redirects back with an installation_id. AssessIQ never sees their password. Ownership is enforced
by GitHub itself — the picker only offers repos the user has authority over, so we never verify
ownership ourselves. Private and public repos work identically; the installation is precisely
what grants read access to private ones (which are the primary use case).

**Multi-provider note:** GitHub only in this epic (see non-goals), but RepoIntegration.provider
exists so GitLab/Bitbucket can slot into the same tables and pipeline later — everything after
the clone step is provider-agnostic.

### 2.2 The cardinal rule: NEVER store source code

- Repo content is fetched, analyzed IN MEMORY / in a temp workspace, and DISCARDED.
- What we persist: derived findings only (see data model) — short natural-language observations,
  file paths, and line-range citations. Never file contents, never diffs, never snippets longer
  than a citation needs (cap: 3 lines, and configurable to 0 for strict mode).
- Temp workspace is wiped after every scan job (finally-block deletion + container-level tmpfs
  if available).
- Scan logs must not contain file contents.

### 2.3 Secrets hygiene

- The GitHub App private key lives in env (GITHUB_APP_PRIVATE_KEY), never in the repo.
- Webhook secret (GITHUB_WEBHOOK_SECRET) for installation events.
- Scan workers run with no other tenant's credentials in scope.

### 2.4 Tenant isolation

- A RepoIntegration belongs to ONE user (later: one org). Findings and generated questions
  inherit that ownership. No cross-tenant retrieval, same owner-scoped-404 pattern as reports.

### 2.5 What Claude sees

- Claude receives: selected code excerpts DURING analysis (transient), plus derived findings for
  question generation. Excerpts are sent to the API but never persisted by us.
- Strict mode (per-integration toggle): analysis prompt receives only structural summaries
  (file tree, imports, schema shapes) — no raw code bodies. Lower question specificity, higher
  privacy. Default OFF for MVP, but the flag exists from day one.

---

## 3. ARCHITECTURE

```
┌────────────────────────────────────────────────────────────────────┐
│ FRONTEND (apps/web)                                                │
│  Settings → Integrations → "Connect GitHub"                        │
│  Repo picker → Scan status → Findings list → "Generate questions"  │
│  → existing review panel (draft → vetted) → bank / tray            │
└──────────────┬─────────────────────────────────────────────────────┘
               │ REST
┌──────────────▼─────────────────────────────────────────────────────┐
│ API (apps/api)                                                     │
│  /integrations/github/*   install, callback, repos, disconnect     │
│  /repo-scans/*            start scan, status, findings             │
│  /questions/generate-from-repo                                     │
└──────┬──────────────────────────────┬──────────────────────────────┘
       │ enqueue                       │ read/write
┌──────▼──────────┐          ┌────────▼─────────┐
│ BullMQ queues   │          │ PostgreSQL       │
│  repo-scan      │          │  RepoIntegration │
│  (reuses infra) │          │  RepoScan        │
└──────┬──────────┘          │  RepoFinding     │
       │                     │  Question (+src) │
┌──────▼──────────────────┐  └──────────────────┘
│ Scan worker             │
│ 1 clone→temp (shallow)  │
│ 2 inventory & select    │
│ 3 analyze via Claude    │
│ 4 persist FINDINGS only │
│ 5 wipe temp             │
└─────────────────────────┘
```

Reuses: BullMQ/Redis (existing), the generation service + review panel + draft/vetted pipeline
(existing), owner-scoped auth middleware (existing).

---

## 4. DATA MODEL (Prisma additions)

```prisma
model RepoIntegration {
  id               String   @id @default(cuid())
  owner_id         String                    // User.id
  provider         String   @default("github")
  installation_id  String                    // GitHub App installation
  account_login    String                    // org/user name on GitHub
  status           IntegrationStatus @default(active)  // active | revoked
  created_at       DateTime @default(now())
  repos            RepoRef[]
}

model RepoRef {
  id               String  @id @default(cuid())
  integration_id   String
  full_name        String                    // "org/repo"
  default_branch   String
  last_scan_id     String?
  scans            RepoScan[]
}

model RepoScan {
  id             String     @id @default(cuid())
  repo_ref_id    String
  status         ScanStatus @default(queued) // queued|cloning|analyzing|done|failed
  started_at     DateTime?
  finished_at    DateTime?
  error          String?
  stats          Json?                        // files_seen, files_analyzed, tokens_used
  findings       RepoFinding[]
}

model RepoFinding {
  id           String  @id @default(cuid())
  scan_id      String
  kind         FindingKind   // stack | pattern | risk | architecture | domain
  title        String        // "Outbox pattern in order-service"
  detail       String        // 1-3 sentence derived observation — NEVER raw code
  file_path    String?       // citation
  line_start   Int?
  line_end     Int?
  excerpt      String?       // ≤3 lines, nullable, empty in strict mode
  used_in_questions String[] // question ids generated from this finding
}

// Question gains provenance:
//   source: 'manual' | 'generated' | 'repo_grounded'
//   repo_finding_id String?   — citation chain: question → finding → file/lines
```

---

## 5. THE SCAN PIPELINE (worker job, step by step)

The scan is LAYERED: cheap non-LLM tooling does the bulk; the LLM only reads a curated subset.
Never send the whole repo to the model — it's expensive, slow, and dilutes signal.

**Layer 1 — plain code, no LLM (stack detection):**

1. **Clone** — shallow clone (depth 1) of the default branch into a temp dir using a fresh
   installation token. Size guard: refuse repos > 500 MB.
2. **Stack detection via manifests** — this is what makes the feature stack-agnostic. Read the
   ecosystem manifest files and map them to a stack profile:
   package.json → Node; go.mod → Go; requirements.txt / pyproject.toml → Python;
   pom.xml / build.gradle → Java; Cargo.toml → Rust; Gemfile → Ruby; composer.json → PHP;
   Dockerfile / docker-compose.yml → deployment; .github/workflows → CI.
   Manifest parsing is plain JSON/TOML/XML reading — no AI.

**Layer 2 — cheap heuristics select what's worth reading (no LLM):** 3. **Inventory & select** — build a file tree. Skip by glob: node_modules, dist, build, .git,
vendored dirs, lockfiles, binaries, images. Rank remaining files by path/name signal
(services/, handlers/, db/, schema, migrations, queue, auth, payment, config) — these
conventions are near-universal across languages. Cap selection at ~40 files (named constant).

**Layer 3 — LLM reads only the selected files (the judgment part):** 4. **Analyze** — batched over the ~40 selected files, ask Claude (ANALYSIS_MODEL, default Haiku
for per-file passes, Sonnet for the final findings synthesis): "what patterns, risks, and
architecture decisions does this show?" → structured findings JSON. Claude is language-
agnostic, so unfamiliar stacks degrade gracefully. Same JSON-parse hardening as the scoring
service (named errors on truncation, retry once). 5. **Persist findings** — write RepoFinding rows (derived text + citations only). 6. **Wipe** — delete the temp dir in a finally block. Record stats. Mark scan done.

Known limitation (accepted): 40 files is a sample, not an audit — findings capture the main
architecture, which is sufficient grounding for question generation. The cap is tunable.

Failure at any step → scan status failed with a readable error; partial findings from completed
batches are kept and labeled partial.

---

## 6. QUESTION GENERATION FROM FINDINGS

- Manager opens the findings list, selects findings that matter for the role (or "generate from
  all"), plus the usual signals: seniority, type, count.
- POST /questions/generate-from-repo → reuses the EXISTING generation service with an augmented
  prompt: the finding's detail + citation context is injected so the question is grounded
  ("Your order-service uses an outbox table but the consumer commits before publish — walk me
  through the failure mode.").
- Output: standard Question rows with the full four-part rubric, saved as status: draft,
  source: repo_grounded, repo_finding_id set.
- **Review gate unchanged and mandatory**: repo-grounded questions flow through the SAME review
  panel (see rubric, edit, approve → vetted). Nothing repo-derived reaches a candidate unreviewed.
- The review panel shows the citation ("Grounded in: src/services/order.ts L42–61") so the manager
  can judge whether the question is fair and accurate.

---

## 7. API SURFACE (new routes)

```
POST   /integrations/github/install-url      → returns the GitHub App install URL
GET    /integrations/github/callback         → completes installation (installation_id)
GET    /integrations/github                  → current integration + repos
POST   /integrations/github/repos/:id/scan   → enqueue a scan
GET    /repo-scans/:id                       → status + stats
GET    /repo-scans/:id/findings              → findings list (owner-scoped)
POST   /questions/generate-from-repo         → { finding_ids[], seniority, type?, count }
DELETE /integrations/github                  → disconnect (repos/scans kept, marked revoked)
```

All owner-scoped; 404 (not 403) on non-owned resources, matching existing patterns.

---

## 8. FRONTEND SURFACE

1. **Settings → Integrations** — Connect GitHub (install flow), repo list, scan buttons,
   scan status (poll via existing useLiveRefresh), disconnect.
2. **Findings view** — per repo: the findings list grouped by kind, each with title, detail,
   citation. Select findings → "Generate questions" (seniority/type/count) → existing review panel.
3. **Builder integration** — a fourth source chip "From your codebase" appears when an
   integration exists, listing repo-grounded vetted questions (and drafts, marked, review-gated
   as usual).
4. **Provenance badge** — repo-grounded questions show a small "grounded" badge + citation in
   the bank and the review panel. Candidates NEVER see citations or repo info.

---

## 9. BUILD ORDER (on epic/repo-grounding, in slices)

Each slice is a PR into the epic branch; the epic merges to develop only when end-to-end works.

- **Slice 1 — GitHub App plumbing**: app registration docs, install URL, callback, RepoIntegration
  - RepoRef models, repo list UI, disconnect. No scanning yet.
- **Slice 2 — Scan pipeline**: RepoScan/RepoFinding models, the worker job (clone→inventory→
  analyze→persist→wipe), scan status UI, findings list UI. Strict-mode flag exists (default off).
- **Slice 3 — Grounded generation**: generate-from-repo endpoint reusing the generation service,
  provenance fields on Question, review-panel citation display, builder "From your codebase" chip.
- **Slice 4 — Hardening pass**: size guards, log scrubbing (no content in logs), revocation
  handling, temp-wipe verification, rate limits on scan endpoints.

Env additions: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, ANALYSIS_MODEL.

---

## 10. EXPLICIT NON-GOALS (this epic)

- No GitLab/Bitbucket (GitHub only first).
- No continuous/webhook-triggered rescans (manual scan button only).
- No storing source code, ever — including in logs, stats, or error messages.
- No org/team accounts yet — integration belongs to the single user (schema names owner_id so
  org ownership can slot in later).
- No candidate-visible repo information of any kind.

---

## 11. PARKED FOR THE VERY END OF THE PRODUCT (do not build now — saved by request)

**Score-to-hire correlation** — build LAST, immediately before deploy, so it collects from day one:

- Hire outcome on a candidate link (hired: boolean, hired_at).
- Scheduled follow-up email to the hiring manager at +3 months (reuses Resend):
  "How is <candidate> doing?" → exceeded / met / below / didn't work out (+ optional note).
- Outcome stored, then a correlation view: per question/topic, average assessment score of
  good-outcome hires vs poor-outcome hires → "these questions predict performance."
- Needs ~15–20 real hires with responses before the correlation is meaningful — which is why it
  waits for real usage; the plumbing is small and reuses existing email + report infrastructure.
