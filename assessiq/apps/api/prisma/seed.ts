import { PrismaClient, Difficulty, QuestionType } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

// Dev interviewer account so email/password login is testable locally without
// Google OAuth. Do NOT ship this to production.
const DEV_EMAIL = 'dev@assessiq.local';
const DEV_PASSWORD = 'password123';

// 10 starter questions (Week 1 — "enough to test", per docs/10-mvp-scope.md).
// Every question is a system question (created_by = null) with all four _guide
// fields (used by the Claude scorer) and all three _display fields (shown in
// study mode after reveal). Expand to 50 in Phase 0 week 6.
type SeedQuestion = {
  text: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  domain: string | null;
  core_answer_guide: string;
  senior_signal_guide: string;
  trap_guide: string;
  evidence_guide: string;
  core_answer_display: string;
  senior_signal_display: string;
  trap_display: string;
};

const questions: SeedQuestion[] = [
  {
    text: 'Explain the Node.js event loop. What actually happens when you call an async function, and what are the phases?',
    topic: 'Node.js',
    difficulty: Difficulty.mid,
    type: QuestionType.conceptual,
    domain: null,
    core_answer_guide:
      'Must convey that Node is single-threaded for JS execution, uses libuv for async I/O, and the event loop processes callbacks across phases (timers, pending, poll, check, close). Async functions do not run in parallel JS; they hand off I/O and resume via callbacks/microtasks.',
    senior_signal_guide:
      'Names the microtask queue (process.nextTick + Promise callbacks) draining between each phase and after each callback, explains why a CPU-bound task blocks the loop, and distinguishes setImmediate (check phase) from setTimeout(0) (timers phase). Bonus: worker_threads for CPU work.',
    trap_guide:
      'Claiming Node is multi-threaded for JavaScript, or that async/await makes code run "in parallel", or that setTimeout(fn, 0) runs immediately/synchronously.',
    evidence_guide:
      'References a real case where they diagnosed event-loop blocking (e.g. a sync crypto/JSON.parse of a large payload) or moved CPU work to a worker/queue and measured the latency improvement.',
    core_answer_display:
      'Node runs your JavaScript on a single thread and offloads I/O to libuv. The event loop cycles through phases — timers, poll, check, close — running the callbacks queued in each. `await` just suspends the function and lets the loop keep going; it does not create parallelism.',
    senior_signal_display:
      'The microtask queue (`process.nextTick` and resolved Promises) drains between every phase and after every callback, so it can starve I/O if abused. A CPU-bound loop blocks everything because there is no preemption — offload it to `worker_threads` or a queue. `setImmediate` fires in the check phase, after poll; `setTimeout(fn, 0)` fires in the timers phase.',
    trap_display:
      'The common wrong answer is "Node is multi-threaded" or "async makes it run in parallel." JS execution is single-threaded; only the I/O layer is threaded (via libuv).',
  },
  {
    text: 'You have a MongoDB collection with 50M documents and a query that filters on `status` and sorts by `createdAt`. It is slow. How do you fix it and how do you prove the fix?',
    topic: 'MongoDB',
    difficulty: Difficulty.senior,
    type: QuestionType.scenario,
    domain: null,
    core_answer_guide:
      'Create a compound index that matches the query shape: { status: 1, createdAt: -1 }. Use explain() to confirm an IXSCAN instead of COLLSCAN and that the sort is served by the index (no in-memory SORT stage).',
    senior_signal_guide:
      'Applies the ESR rule (Equality, Sort, Range) for compound index ordering, notes that the sort direction must be compatible with the index to avoid an in-memory sort (32MB limit), considers index selectivity and cardinality of status, and mentions covered queries / projection. Watches write-amplification and index size tradeoffs.',
    trap_guide:
      'Creating two separate single-field indexes and assuming Mongo will "combine" them efficiently (index intersection is rarely optimal), or indexing status alone and leaving the sort as an in-memory SORT that blows the 32MB limit.',
    evidence_guide:
      'Cites a real slow-query they fixed, mentions reading explain() executionStats (docsExamined vs nReturned ratio) before and after, and quantifies the improvement.',
    core_answer_display:
      'Add a compound index shaped like the query: `{ status: 1, createdAt: -1 }`. Then run `.explain("executionStats")` and confirm the winning plan is an `IXSCAN` (not `COLLSCAN`) and that there is no separate in-memory `SORT` stage.',
    senior_signal_display:
      'Order compound index keys by ESR — Equality first (`status`), then Sort (`createdAt`), then any Range. The sort direction has to line up with the index or Mongo falls back to an in-memory sort capped at 32MB. Check the `docsExamined : nReturned` ratio in `explain` — close to 1:1 means the index is doing the work.',
    trap_display:
      'The trap is creating two single-field indexes and hoping Mongo intersects them — it usually will not, and you still get an in-memory sort. One compound index in the right order is the answer.',
  },
  {
    text: 'What is idempotency in a REST API, which methods should be idempotent, and how would you make a POST /payments endpoint safe to retry?',
    topic: 'REST',
    difficulty: Difficulty.senior,
    type: QuestionType.conceptual,
    domain: null,
    core_answer_guide:
      'Idempotent = the same request repeated produces the same server state/result. GET, PUT, DELETE are idempotent; POST is not by default. Make POST /payments safe with a client-supplied Idempotency-Key stored server-side that returns the original result on retry.',
    senior_signal_guide:
      'Explains storing the idempotency key with the request fingerprint and a locked/pending state to handle concurrent retries, choosing a TTL, and returning the cached response for duplicates. Distinguishes idempotency from safety, and notes at-least-once delivery from clients/queues makes this mandatory for money movement.',
    trap_guide:
      'Saying POST is idempotent, conflating idempotent with "safe" (read-only), or relying only on a unique DB constraint that throws a 500 on the second call instead of returning the original success.',
    evidence_guide:
      'Describes a real payment/order flow where duplicate submissions or queue redelivery caused double charges, and how an idempotency key or dedup table fixed it.',
    core_answer_display:
      'Idempotent means repeating the identical request leaves the system in the same state. `GET`, `PUT`, and `DELETE` are idempotent; `POST` is not. For `POST /payments`, require a client `Idempotency-Key`, persist it with the result, and on a retry return the original response instead of charging again.',
    senior_signal_display:
      'Store the key with a fingerprint of the request body and a `pending` lock so two concurrent retries do not both execute. Give keys a TTL. This matters because clients, load balancers, and message queues all deliver at-least-once — without dedup, a redelivered payment double-charges.',
    trap_display:
      'The trap is calling `POST` idempotent, or leaning on a unique constraint that throws a 500 on the duplicate rather than returning the original success cleanly.',
  },
  {
    text: 'A JWT is stolen. Walk me through what an attacker can do, and how your auth design limits the blast radius.',
    topic: 'Security',
    difficulty: Difficulty.senior,
    type: QuestionType.scenario,
    domain: null,
    core_answer_guide:
      'A stolen JWT lets the attacker impersonate the user until it expires, because JWTs are stateless and self-validating. Mitigation: short-lived access tokens + refresh tokens, HTTPS only, httpOnly/secure cookies, and a revocation/denylist mechanism.',
    senior_signal_guide:
      'Explains that you cannot "log out" a stateless JWT server-side without a denylist or token-version claim, recommends short access-token TTL (minutes) with rotating refresh tokens, binds tokens where possible (audience, device), and stores them in httpOnly cookies to reduce XSS theft. Discusses the stateless-vs-revocable tradeoff explicitly.',
    trap_guide:
      'Claiming JWTs can be revoked instantly out of the box, storing tokens in localStorage without acknowledging XSS risk, or using very long-lived access tokens with no refresh/rotation.',
    evidence_guide:
      'References a real auth implementation: TTL values chosen, where tokens were stored, how logout/revocation was handled, or an incident where token handling was hardened.',
    core_answer_display:
      'Because a JWT is self-contained and validated by signature alone, a stolen one impersonates the user until it expires — the server does not check a session store. You limit damage with short-lived access tokens, rotating refresh tokens, HTTPS everywhere, and httpOnly/secure cookies.',
    senior_signal_display:
      'You cannot instantly revoke a stateless JWT without adding a denylist or a `token_version` claim you check per request — that is the core tradeoff. Keep access tokens to minutes, rotate refresh tokens, and prefer httpOnly cookies over localStorage so XSS cannot read the token.',
    trap_display:
      'The trap is saying "just revoke it" — plain JWTs have no server-side revocation. The other trap is localStorage storage with no mention of the XSS exposure it creates.',
  },
  {
    text: 'Two microservices need to stay consistent when an order is placed: Orders and Inventory. A distributed transaction is not available. How do you keep them consistent?',
    topic: 'Microservices',
    difficulty: Difficulty.staff,
    type: QuestionType.design,
    domain: null,
    core_answer_guide:
      'Use eventual consistency via an event-driven Saga: Orders emits an event, Inventory reacts, with compensating actions on failure. Avoid 2PC. Ensure reliable event publishing (outbox pattern) and idempotent consumers.',
    senior_signal_guide:
      'Contrasts choreography vs orchestration sagas and picks based on complexity, uses the transactional outbox to avoid dual-write inconsistency between DB and broker, makes consumers idempotent for at-least-once delivery, and designs explicit compensating transactions. Acknowledges the user-visible intermediate state.',
    trap_guide:
      'Reaching for a two-phase commit / distributed transaction across services, or dual-writing to the database and the message broker in the same code path without an outbox (which loses events on crash).',
    evidence_guide:
      'Describes a real event-driven flow they built (broker used, outbox or CDC, how retries/dedup were handled) and a failure they had to compensate for.',
    core_answer_display:
      'Drop the idea of a distributed transaction and use a Saga: Orders commits locally and emits an `OrderPlaced` event; Inventory consumes it and reserves stock, emitting success or failure; on failure a compensating action reverses the order. The system is eventually consistent.',
    senior_signal_display:
      'Publish events with the transactional outbox pattern — write the event to an outbox table in the same DB transaction as the state change, then relay it — so a crash between DB write and broker publish cannot lose the event. Make consumers idempotent because delivery is at-least-once, and design explicit compensating transactions rather than assuming rollback.',
    trap_display:
      'The trap is proposing a two-phase commit across services, or dual-writing to the DB and broker directly — if the process dies between the two writes, they diverge.',
  },
  {
    text: 'Design a URL shortener that handles 10k redirects/second. Walk me through the read path and where the bottlenecks are.',
    topic: 'System Design',
    difficulty: Difficulty.senior,
    type: QuestionType.design,
    domain: null,
    core_answer_guide:
      'Core: a service that maps short code → long URL. Generate a unique short code (counter+base62 or hash), store the mapping, and on redirect look it up and return a 301/302. At 10k rps reads dominate, so cache hot mappings.',
    senior_signal_guide:
      'Puts a cache (Redis/CDN) in front for the read-heavy path, discusses 301 vs 302 tradeoff (301 caches in browsers and reduces load but loses analytics/control), addresses code generation collisions and the counter-as-single-point-of-contention, and considers read replicas and horizontal scaling of a stateless service.',
    trap_guide:
      'Hitting the primary database on every redirect with no cache, using a random hash without handling collisions, or using 302 everywhere without noting the analytics-vs-load tradeoff of 301.',
    evidence_guide:
      'References real scaling experience: a cache layer they added, a hot-key or thundering-herd problem they solved, or measured read/write ratios in a system they ran.',
    core_answer_display:
      'Store a `code → longUrl` mapping. Generate the code with a counter encoded in base62 (or a hash with collision handling). On redirect, look up the code and return a 301/302. The workload is overwhelmingly reads, so the redirect path must be cheap.',
    senior_signal_display:
      'Front the lookup with Redis or a CDN so most redirects never touch the database — this is the whole game at 10k rps. `301` lets browsers and proxies cache the redirect (less load) but you lose per-hit analytics and the ability to change the target; `302` keeps control at the cost of every hit reaching you. The keep the service stateless and scale it horizontally behind read replicas.',
    trap_display:
      'The trap is querying the primary DB on every single redirect, or generating random codes with no collision check. Reads need a cache; codes need guaranteed uniqueness.',
  },
  {
    text: 'Production alert: p99 latency on your API jumped from 80ms to 4s at 2am, no deploy went out. Walk me through your root-cause process.',
    topic: 'RCA',
    difficulty: Difficulty.senior,
    type: QuestionType.rca,
    domain: null,
    core_answer_guide:
      'Structured approach: confirm the alert is real (not monitoring), scope it (all endpoints or one? all instances or one?), correlate with a timeline of changes (deploys, config, traffic, dependencies), form a hypothesis, and verify with data before acting. Since no deploy went out, look at external factors: traffic spike, dependency slowdown, resource exhaustion, a cron/batch job.',
    senior_signal_guide:
      'Reasons from signals: checks whether latency correlates with DB slow queries, connection-pool saturation, GC pauses, a nightly batch job, or an upstream dependency. Distinguishes symptom from cause, forms a testable hypothesis before changing anything, and mentions mitigating (restore service) before fully root-causing. References the "no deploy" clue to pivot to environment/data/traffic causes.',
    trap_guide:
      'Immediately restarting servers or rolling back with no hypothesis, blaming "the database is slow" without asking why, or changing multiple things at once so you never learn the real cause.',
    evidence_guide:
      'Tells a real incident story with the actual root cause (e.g. a nightly analytics job saturating the connection pool, a dependency degrading, disk filling) and how they confirmed it from metrics/logs/traces.',
    core_answer_display:
      'First confirm it is real and scope it — every endpoint or one, every instance or one. Build a timeline and correlate with anything that changed: traffic, config, dependencies, scheduled jobs. Form one hypothesis, verify it with metrics/logs/traces, then act. "No deploy" is a strong clue to look at data volume, traffic, or an external dependency rather than code.',
    senior_signal_display:
      'A senior separates mitigation from root cause — restore service first (shed load, scale, kill the offending query) while still gathering evidence, and change one thing at a time so the fix is attributable. Common 2am culprits with no deploy: a nightly batch job saturating the DB connection pool, an upstream dependency degrading, GC pauses, or a slow query as a table crossed a size threshold.',
    trap_display:
      'The trap is restarting or rolling back on reflex with no hypothesis, or declaring "the DB is slow" as if that were a root cause instead of a symptom to explain.',
  },
  {
    text: 'Tell me about a time you found and fixed a bug in production that others had missed. What made it hard, and what did you change so it could not happen again?',
    topic: 'Behavioral',
    difficulty: Difficulty.senior,
    type: QuestionType.behavioral,
    domain: null,
    core_answer_guide:
      'A clear STAR narrative: the Situation and stakes, the Task/their responsibility, the specific Actions they took to isolate and fix, and the measurable Result. The bug should be non-trivial and the candidate should own the fix.',
    senior_signal_guide:
      'Goes beyond the fix to the systemic prevention — a test, a guardrail, an alert, a process change — so the class of bug cannot recur. Shows ownership without blaming others, quantifies impact, and reflects on what they learned. Demonstrates debugging methodology, not luck.',
    trap_guide:
      'A vague story with no specifics, taking sole credit while blaming teammates, describing only the fix with no prevention, or a "bug" so trivial it does not demonstrate senior judgment.',
    evidence_guide:
      'The whole answer is evidence — it must be a concrete, specific, real incident with names of systems, real numbers (users affected, latency, revenue), and a durable change that shipped.',
    core_answer_display:
      'Use STAR: set the Situation and stakes, state your Task, detail the Actions you personally took to isolate and fix it, and give a measurable Result. Pick a genuinely hard bug you owned end to end.',
    senior_signal_display:
      'The senior signal is what you changed so it never recurs — a regression test, an assertion, an alert, or a process fix — not just the patch. Quantify the impact and own it without throwing teammates under the bus.',
    trap_display:
      'The trap is a vague, unquantified story, or one where the "fix" is described but nothing was done to prevent the whole class of bug from returning.',
  },
  {
    text: 'You are building a pharmacy service that stores patient prescriptions. What does handling PHI correctly require of your backend, beyond "encrypt the database"?',
    topic: 'Healthcare',
    difficulty: Difficulty.senior,
    type: QuestionType.scenario,
    domain: 'healthcare',
    core_answer_guide:
      'PHI handling under HIPAA requires access control (minimum necessary), audit logging of every access to PHI, encryption in transit and at rest, and a Business Associate Agreement (BAA) with any vendor that touches PHI. It is not just DB encryption.',
    senior_signal_guide:
      'Names concrete controls: role-based access with least privilege, an immutable audit trail of who accessed which record when, encryption in transit (TLS) and at rest, data-retention/disposal policy, de-identification for analytics/logs (never log raw PHI), and BAAs with cloud/vendor providers. Connects controls to real breach/audit consequences.',
    trap_guide:
      'Treating "encrypt the database" as sufficient, logging PHI in plaintext application logs or error traces, using a vendor with no BAA, or exposing PHI in URLs/analytics. Assuming HTTPS alone equals HIPAA compliance.',
    evidence_guide:
      'References real regulated-domain work: an audit trail they built, access controls or de-identification they implemented, a BAA process, or a review that caught PHI leaking into logs.',
    core_answer_display:
      'HIPAA is broader than encryption. You need least-privilege access controls, an immutable audit log of every PHI access (who, what record, when), encryption in transit and at rest, a retention/disposal policy, and a signed BAA with every vendor that can touch PHI — including your cloud provider.',
    senior_signal_display:
      'The senior move is treating logs and analytics as PHI surfaces: never log raw prescriptions or patient identifiers, de-identify before anything leaves the secure path, and keep the audit trail immutable because auditors will ask "who saw this record." "Minimum necessary" is a HIPAA principle, not a nice-to-have.',
    trap_display:
      'The trap is "we encrypt the database, so we are compliant." Encryption at rest is one control; missing audit logging, access control, BAAs, or PHI leaking into logs are the things that actually cause breaches and fines.',
  },
  {
    text: 'What is connection pooling, why does it matter, and what goes wrong when the pool is too small or too large?',
    topic: 'Databases',
    difficulty: Difficulty.mid,
    type: QuestionType.conceptual,
    domain: null,
    core_answer_guide:
      'A connection pool reuses a fixed set of open DB connections instead of opening/closing one per request, because establishing a connection is expensive. It bounds concurrency to the database and improves latency and throughput.',
    senior_signal_guide:
      'Explains both failure modes: too small → requests queue waiting for a connection, latency spikes, timeouts under load; too large → the database is overwhelmed (each connection costs memory/CPU on the server) and you exhaust DB max_connections, which can take the whole DB down. Notes pool size should be tuned to the DB, not the app, and mentions per-instance pools multiplying across horizontally scaled services.',
    trap_guide:
      'Thinking "bigger pool is always better/faster", ignoring that every app instance has its own pool (so 20 instances × 50 = 1000 connections), or not connecting pool exhaustion to the 2am latency-spike style incidents.',
    evidence_guide:
      'Describes a real pool-tuning or pool-exhaustion incident: a batch job holding connections, a leak from unreleased connections, or sizing the pool against the DB max and measuring the result.',
    core_answer_display:
      'A connection pool keeps a bounded set of DB connections open and hands them out per request, avoiding the cost of opening a fresh connection every time. It caps how much concurrency you push at the database and smooths latency.',
    senior_signal_display:
      'Both extremes bite: too small and requests queue for a free connection, causing latency spikes and timeouts under load; too large and you exhaust the database\'s own connection limit and memory, which can crash it. Size the pool against the database\'s capacity, and remember every app instance has its own pool — 20 instances × 50 connections is 1000 against one DB.',
    trap_display:
      'The trap is "make the pool bigger to go faster." Past a point a larger pool overwhelms the database, and forgetting per-instance pools multiply is how you accidentally hit max_connections in production.',
  },
];

async function main() {
  // Dev interviewer (idempotent).
  const devUser = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: {
      email: DEV_EMAIL,
      name: 'Dev Interviewer',
      company: 'AssessIQ Dev',
      password_hash: hashPassword(DEV_PASSWORD),
    },
  });
  console.log(`Dev interviewer ready: ${devUser.email} / ${DEV_PASSWORD}`);

  console.log(`Seeding ${questions.length} questions...`);

  for (const q of questions) {
    // Idempotent seed: skip if a question with the same text already exists.
    const existing = await prisma.question.findFirst({ where: { text: q.text } });
    if (existing) {
      console.log(`  = skip (exists): ${q.topic} — ${q.text.slice(0, 48)}...`);
      continue;
    }
    await prisma.question.create({ data: { ...q, created_by: null, is_active: true } });
    console.log(`  + ${q.topic} (${q.difficulty}) — ${q.text.slice(0, 48)}...`);
  }

  const total = await prisma.question.count();
  console.log(`Done. ${total} questions in the bank.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
