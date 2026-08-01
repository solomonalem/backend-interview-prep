# AssessIQ — Developer Specification Index

> **Read this first before writing any code.**
> This folder contains the complete specification for AssessIQ. Work through the files in order. Each file is self-contained but they build on each other.

---

## What Is AssessIQ?

AssessIQ is a **proctored, rubric-based technical assessment platform** with two distinct user modes:

1. **Job Seeker Mode** — a self-study tool that helps engineers prepare for interviews using spaced repetition, personal story mapping, and AI-scored practice answers
2. **Interviewer Mode** — an assessment sender that lets hiring engineers curate questions, send timed + proctored links to candidates, and receive detailed scored reports

The key differentiator is the **rubric scoring model**: answers are not marked correct/incorrect. They are scored as a percentage across four components — core answer, senior signal, trap avoidance, and evidence. This surfaces *how senior* a candidate thinks, not just whether they know the fact.

---

## File Index

| File | What It Covers |
|------|----------------|
| `01-product-overview.md` | Problem, solution, the two user modes at a high level |
| `02-jobseeker-behaviour.md` | Every screen and interaction for the job seeker (self-prep) user |
| `03-interviewer-behaviour.md` | Every screen and interaction for the interviewer user |
| `04-scoring-engine.md` | How rubric scoring works, the four components, Claude API integration |
| `05-proctoring.md` | All behavior tracking signals, how they are logged and displayed |
| `06-tech-stack.md` | Full technology decisions with rationale, what NOT to use and why |
| `07-data-model.md` | Every database entity, field, type, and relationship |
| `08-api-routes.md` | Every REST endpoint, request shape, response shape, auth requirement |
| `09-project-structure.md` | Folder layout, file naming, where everything lives |
| `10-mvp-scope.md` | What is in MVP, what is deferred, phased roadmap |

---

## Ground Rules for Development

- **Monorepo**: frontend and backend live in the same repo under `/apps/web` and `/apps/api`
- **TypeScript everywhere**: shared types live in `/packages/types` and are imported by both apps
- **No premature abstraction**: write the simplest thing that works; refactor when a pattern repeats three times
- **Async scoring**: candidate submission never waits for Claude — submit instantly, score in background queue
- **Proctoring is passive**: behavior is logged and surfaced as context, never as automatic disqualification
- **Candidate has no account**: they access via a signed URL token only
- **One question at a time** in candidate session: no jumping ahead, no back navigation after submit

---

## Quick Orientation: The Core Loop

```
Interviewer builds assessment (picks questions, sets timer, sets proctoring rules)
        ↓
Generates shareable link → sends to candidate
        ↓
Candidate opens link → reads instructions → starts (clock begins)
        ↓
Platform silently logs: tab switches, focus loss, paste events, idle time
        ↓
Candidate answers one question at a time, rates confidence (1–5) per question
        ↓
Timer expires OR candidate submits → session locks → confirmation shown
        ↓
BullMQ scoring job fires → Claude scores each answer against rubric
        ↓
Report compiled → emailed to interviewer + available in dashboard
```

---

## Tech Summary (detail in `06-tech-stack.md`)

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Queue | BullMQ + Redis |
| Scoring | Anthropic Claude API (`claude-sonnet-4-6`) |
| Auth | JWT + Google OAuth (interviewers); signed token URL (candidates) |
| Storage | Cloudflare R2 |
| PDF | Puppeteer |
| Deploy | Railway (MVP) |