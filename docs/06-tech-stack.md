# 06 — Tech Stack

> Every technology decision is here with its rationale and exact configuration.
> Do not deviate from these choices without a documented reason — consistency matters more than novelty.

---

## Overview

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  React 18 + TypeScript + Tailwind CSS + Vite    │
└─────────────────────┬───────────────────────────┘
                      │ REST (JSON)
┌─────────────────────▼───────────────────────────┐
│  API Server                                     │
│  Node.js 20 LTS + Express 4 + TypeScript        │
└──────┬─────────────┬──────────────┬─────────────┘
       │             │              │
┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────────────┐
│ PostgreSQL  │ │  Redis  │ │  Anthropic Claude   │
│ (via Prisma)│ │(BullMQ) │ │  claude-sonnet-4-6  │
└─────────────┘ └─────────┘ └─────────────────────┘
                      │
              ┌───────▼───────┐
              │  BullMQ       │
              │  Score Worker │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │ Cloudflare R2 │
              │ (PDF + logs)  │
              └───────────────┘
```

---

## Frontend

### React 18 + TypeScript

**Why React:**
- Component-driven — the candidate session (timer, one-question-at-a-time, event listeners) needs tight state control
- Large ecosystem, easy to hire for
- Hooks make the session timer and proctoring event management clean

**Why TypeScript:**
- The rubric data model is complex (four score components, behavior events, session state)
- Shared types between frontend and backend via `/packages/types`
- Type safety prevents runtime bugs in scoring logic — getting a score wrong is worse than a UI bug

**Configuration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "moduleResolution": "bundler"
  }
}
```

---

### Vite (not Next.js)

**Why Vite:**
- SSR is not needed — the candidate session is fully client-side. Next.js SSR would add complexity with zero benefit here.
- Vite starts in milliseconds, HMR is near-instant
- Simple config, no framework lock-in

**Why NOT Next.js:**
- We do not need server-side rendering for SEO (assessment links are behind auth or tokens)
- App router adds mental overhead that slows down MVP development
- The candidate session has complex client state that fights SSR

```bash
# Scaffold
npm create vite@latest web -- --template react-ts
```

---

### Tailwind CSS

**Why Tailwind:**
- No design system needed at MVP — utility classes get you to a clean UI fast
- Co-located styles mean no hunting for CSS files
- JIT compiler means bundle only includes classes you use

**Do NOT use:**
- CSS modules (too much boilerplate)
- Styled-components or Emotion (runtime cost, adds complexity)
- Pre-built component libraries like MUI or Chakra (too opinionated, hard to customize for the rubric card design)

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

---

## Backend

### Node.js 20 LTS + Express 4 + TypeScript

**Why Node:**
- Matches your existing OFS/CLA stack — you already know this runtime deeply
- Great for I/O-bound work (database queries, Claude API calls, queue jobs)
- Native async/await, no thread management

**Why Express (not Fastify, Hono, or NestJS):**
- Simplest possible API surface for MVP
- You know it — familiarity beats novelty at this stage
- NestJS adds decorator magic and DI containers that slow down a small team
- Fastify / Hono: fine choices but no reason to learn a new framework for MVP

**Structure:**
```
apps/api/src/
  routes/         ← Express routers, one file per resource
  services/       ← Business logic (not tied to Express)
  workers/        ← BullMQ job processors
  middleware/     ← Auth, error handling, request logging
  lib/            ← External integrations (Claude, R2, email)
  prisma/         ← Prisma client instance
```

---

## Database

### PostgreSQL 15 via Prisma ORM

**Why PostgreSQL:**
- The data model is relational: assessments have questions, sessions have answers, answers have scores
- Foreign keys, transactions, and joins are exactly what we need
- JSONB columns for behavior event arrays (flexible without a separate table)
- MongoDB would fight the shape of this data — do not use it for this project

**Why Prisma:**
- TypeScript-native — types are generated from your schema, no manual type definitions
- Migration system is clean and explicit
- Prisma Client is readable and easy to debug
- `npx prisma studio` gives you a GUI to inspect data during development

**Connection:**
```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Do NOT use:**
- Raw SQL via `pg` directly (no type safety, easy to make injection mistakes)
- TypeORM (decorator-based, complex, poor TypeScript experience)
- Mongoose (wrong database)

---

## Job Queue

### BullMQ + Redis

**Why a queue:**
- Scoring a 10-question assessment synchronously takes 20–80 seconds (Claude API latency × 10 questions)
- Candidate must not wait — they submit and get an instant confirmation
- Queue handles retries, failure visibility, and concurrency

**Why BullMQ:**
- Built on Redis, which you also need for session state
- TypeScript-first
- Built-in retry with exponential backoff
- Excellent observability (Bull Board UI)

**Why NOT:**
- In-process queues like `p-queue` — no persistence, jobs lost on restart
- AWS SQS — adds infrastructure complexity; Redis is simpler at MVP

**Setup:**
```typescript
import { Queue, Worker, QueueEvents } from 'bullmq'
import { redisConnection } from './lib/redis'

export const scoringQueue = new Queue('scoring', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})
```

**Concurrency:** Run 5 scoring workers in parallel — enough to handle a burst of simultaneous submissions without overwhelming Claude API rate limits.

---

## AI / Scoring

### Anthropic Claude (`claude-sonnet-4-6`)

**Why Claude:**
- Best structured JSON output reliability of any model — critical for rubric scoring
- `temperature: 0` gives deterministic scoring
- Fast enough for async scoring jobs (2–4 seconds per answer)
- Cost: approximately $0.003–0.008 per answer scored at Sonnet pricing

**Model choice:**
- `claude-sonnet-4-6` for all scoring — fast, smart, cheap enough
- Do NOT use Opus for scoring — 3× cost with negligible quality improvement for this task
- Do NOT use Haiku for scoring — too weak for nuanced rubric judgment

**API client:**
```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})
```

**Always set `temperature: 0` for scoring calls. Never change this.**

---

## Authentication

### Interviewers — JWT + Google OAuth

```typescript
// Interviewer logs in via Google
// Server exchanges code for tokens, creates/finds user, issues JWT

type InterviewerJWT = {
  sub: string           // user id
  email: string
  role: 'interviewer'
  iat: number
  exp: number           // 7 days
}
```

Use `jsonwebtoken` package. Store JWT in httpOnly cookie (not localStorage).

### Candidates — Signed Token URL

Candidates have no account. They access via a URL like:
```
https://assessiq.app/a/xK9mP2qR7b
```

The token `xK9mP2qR7b` is a signed, unique, single-use string stored in the database:

```typescript
type AssessmentLink = {
  token: string           // random 10-char alphanumeric, URL-safe
  assessment_id: string
  candidate_label: string | null
  expires_at: Date
  opened_at: Date | null
  session_id: string | null   // set when session is created
}
```

When the candidate opens the link:
- Server validates: token exists, not expired, not already used (single-use)
- Creates a Session record
- Issues a short-lived session JWT (4 hours) for subsequent API calls during the assessment
- Marks the link as opened

---

## Storage

### Cloudflare R2

Used for:
- Generated PDF reports (uploaded after report compilation)
- Behavior event log archives (after 90-day retention period)

**Why R2 over S3:**
- Zero egress fees — reports are frequently downloaded by interviewers
- Same S3-compatible API — easy to switch if needed
- Cheaper at low volume

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
```

---

## PDF Generation

### Puppeteer

Reports are HTML pages rendered server-side, then printed to PDF by Puppeteer.

**Why Puppeteer:**
- Renders the exact same React component as the browser — pixel-perfect
- Handles complex layouts (tables, charts, multi-page)
- No PDF library DSL to learn

**Flow:**
1. Report data compiled in database
2. BullMQ job: `generate-pdf`
3. Worker spins up Puppeteer, navigates to internal report URL with auth token
4. Calls `page.pdf({ format: 'A4', printBackground: true })`
5. Uploads PDF to R2
6. Stores R2 URL in Report record
7. Sends email to interviewer with download link

**Important:** Run Puppeteer in a separate process / worker — do not run it on the main API server. It is memory-hungry.

---

## Email

### Resend (not SendGrid, not SES)

**Why Resend:**
- Developer-friendly API
- React Email for templates (same React you already know)
- Generous free tier for MVP
- Simple to set up — no domain verification nightmare

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: 'AssessIQ <reports@assessiq.app>',
  to: interviewer.email,
  subject: `Assessment complete: ${candidateLabel} — ${overallScore}%`,
  react: ReportEmailTemplate({ reportUrl, candidateLabel, overallScore, verdict }),
})
```

---

## Deployment

### Railway (MVP)

**Why Railway:**
- Supports Node.js, PostgreSQL, and Redis as managed services in one place
- Docker-based deploy — `railway up` and you're done
- No Kubernetes, no load balancer config, no VPC setup
- Built-in environment variable management
- Cheap at MVP scale ($20–50/month for the whole stack)

**Services on Railway:**
- `api` — Express server (Docker)
- `worker` — BullMQ scoring worker (same Docker image, different start command)
- `postgres` — Managed PostgreSQL
- `redis` — Managed Redis

**When to migrate:** Move to AWS (ECS + RDS + ElastiCache) when you have paying customers and need SLA guarantees or HIPAA BAA compliance.

---

## Monorepo Structure

```
assessiq/
├── apps/
│   ├── web/          ← React frontend (Vite)
│   └── api/          ← Express backend
├── packages/
│   └── types/        ← Shared TypeScript types (imported by both apps)
├── docker-compose.yml ← Local dev: postgres + redis
├── .env.example
└── README.md
```

**Why a monorepo:**
- Shared types between frontend and backend — no type drift
- One git repo, one PR, one CI run
- Simple at this scale — no Nx or Turborepo needed yet

---

## What NOT to Use (and Why)

| Temptation | Why to skip it |
|-----------|---------------|
| Next.js | SSR not needed; candidate session is fully client-side; adds complexity |
| GraphQL | Overkill for this API surface; REST is simpler to debug and document |
| MongoDB | Wrong shape for relational assessment data; don't use it here |
| WebSockets | Timer lives client-side; no real-time features needed in MVP |
| NestJS | Decorator magic and DI containers slow down a small team |
| MUI / Chakra | Too opinionated; Tailwind gives more control for the card-based rubric UI |
| Microservices | One monolith is faster to ship and easier to debug before product-market fit |
| Kubernetes | Railway handles this; k8s is a distraction before you have paying customers |
| Prisma with MongoDB adapter | Use Postgres; don't force Prisma onto the wrong database |
| Claude Opus | 3× cost of Sonnet, negligible quality improvement for structured scoring |

---

## Environment Variables

```bash
# .env.example

# App
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/assessiq

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<random 64-char hex string>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# Anthropic
ANTHROPIC_API_KEY=<your key>

# Cloudflare R2
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret>
R2_BUCKET_NAME=assessiq-reports

# Email
RESEND_API_KEY=<resend key>

# Internal
INTERNAL_REPORT_TOKEN=<random string — used by Puppeteer to access internal report URLs>
```