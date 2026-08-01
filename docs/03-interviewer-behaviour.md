# 03 — Interviewer Behaviour

> This file describes every screen, interaction, and state for a user in interviewer mode.
> The interviewer has an account. Candidates do NOT have accounts — they access via a signed URL token.

---

## Interviewer Account Setup

### Sign up / Sign in
- Google OAuth or email + password
- After first login: prompted to set company name and role (e.g. "Engineering Manager at HealthCo")
- No lengthy onboarding — get to the question bank immediately

---

## Question Bank Browser

### Screen: Question Bank
This is the core browsing experience. The interviewer finds and selects questions.

**Filters (left sidebar):**
```
Topic
  [ ] Node.js / Event Loop
  [ ] Express / REST
  [ ] MongoDB
  [ ] SQL / Databases
  [ ] Microservices
  [ ] Security / Auth / JWT
  [ ] AWS / Cloud
  [ ] Docker / CI-CD
  [ ] Messaging / Queues
  [ ] System Design
  [ ] RCA / Debugging
  [ ] Behavioral / STAR
  [ ] Healthcare Domain
  [ ] Fintech Domain

Difficulty
  [ ] Junior
  [ ] Mid-level
  [ ] Senior
  [ ] Staff

Type
  [ ] Conceptual
  [ ] Scenario-based
  [ ] RCA / Debug
  [ ] Design
  [ ] Behavioral
```

**Question card in the list (collapsed):**
```
[MongoDB]  [Senior]  [Scenario]

You have 50M documents and queries are slow in production but
fast in dev. How do you diagnose and fix this?

[ Preview ]   [ + Add to Assessment ]
```

**Question card expanded (Preview):**
```
QUESTION
You have 50M documents and queries are slow in production
but fast in dev. How do you diagnose and fix this?

CORE ANSWER (what a correct answer covers)
explain(), COLLSCAN vs IXSCAN, db.setProfilingLevel,
index coverage and selectivity, ESR rule.

SENIOR SIGNAL (what a senior answer adds)
Names the read/write tradeoff of indexes. Mentions ESR rule.
Asks about access patterns before recommending.

TRAP (common wrong answer to watch for)
"Just add an index" — without considering write cost,
selectivity, or whether the query itself is the problem.

[ + Add to Assessment ]
```

---

## Assessment Builder

### Screen: New Assessment

The interviewer arrives here after clicking "New Assessment" or after adding questions from the bank.

**Left panel — selected questions:**
```
Assessment: [Title — editable]  e.g. "Senior Backend Engineer — Node/Mongo"

Questions (drag to reorder)
─────────────────────────────────────
1. [MongoDB] Slow queries — 50M docs       [ ✕ Remove ]
2. [Node.js] Explain the event loop        [ ✕ Remove ]
3. [Security] JWT refresh token strategy  [ ✕ Remove ]
4. [Microservices] Idempotency in queues  [ ✕ Remove ]
5. [Behavioral] Tell me about a failure   [ ✕ Remove ]

[ + Add more questions ]
```

**Right panel — assessment settings:**

```
TIMER
[ ] No timer (candidate takes as long as needed)
[✓] Set time limit:  [ 45 ] minutes
    When time expires: auto-submit and lock session

PROCTORING
[✓] Track tab switches
[✓] Track window focus loss
[✓] Detect large paste events
[✓] Track idle time (flag if no activity for 2+ minutes)
[ ] Require webcam  ← (Phase 2 feature, disabled for MVP)

Flag threshold: warn interviewer after [ 3 ] tab switches

CONFIDENCE RATING
[✓] Ask candidate to rate confidence (1–5) before each submit
    (enables confidence vs score delta analysis in report)

LINK SETTINGS
Expiry: [ 48 hours ] after first open / [ 7 days ] from send
Single use: [✓] Link locks to first device that opens it
Candidate label: [ e.g. "Candidate A" or leave blank ]
```

**Preview button:** Shows exactly what the candidate will see — same UI, dummy answers, no scoring.

**Generate Link button:** Creates the shareable URL.

```
Assessment ready!

Link: https://assessiq.app/a/xK9mP2qR

[ Copy Link ]   [ Send via Email ]   [ Open in new tab to preview ]

Expires: 7 days from now
Status: Not yet opened
```

---

## Assessment Management

### Screen: My Assessments (dashboard)

List of all assessments the interviewer has created.

```
Senior Backend Engineer — Node/Mongo
Created: 3 days ago  |  5 questions  |  45 min timer

Candidates:
  candidate-a@email.com   Submitted 2h ago   Score: 76%   [ View Report ]
  candidate-b@email.com   In Progress        Started 14min ago
  candidate-c@email.com   Link sent          Not opened yet

[ + Invite another candidate ]   [ Edit Assessment ]   [ Duplicate ]
```

### Status states for a candidate link:
- `Not opened` — link sent but never clicked
- `Opened` — link clicked, instructions read, not started
- `In Progress` — assessment started, clock running
- `Submitted` — completed (timer expired or manual submit)
- `Expired` — link passed expiry date without submission

---

## The Report

This is the most important screen for the interviewer. Triggered by clicking "View Report".

### Section 1 — Header Summary
```
ASSESSMENT REPORT
─────────────────────────────────────────────────────
Candidate:     Candidate A
Role:          Senior Backend Engineer — Node/Mongo
Assessment:    5 questions | 45 min timer
Time used:     38 min 22 sec
Submitted:     Today at 2:14 PM
Overall score: 76%
Verdict:       APPROACHING SENIOR
```

Verdict logic:
- `70–100% senior signals hit` → **Strong Senior**
- `50–69%` → **Approaching Senior**
- `30–49%` → **Mid-Level**
- `0–29%` → **Junior**

### Section 2 — Proctoring Summary
```
PROCTORING FLAGS
─────────────────────────────────────────────────────
Tab switches:     6   (min 8, 14, 14, 22, 31, 37)
Focus loss:       3
Large pastes:     1   (Q4 — idempotency question, +340 chars in 1.2s)
Idle periods:     0

Context: Candidate scored 88% on Q4 despite paste flag.
Suggest probing this topic verbally in the live interview.
```

Proctoring flags are never shown as automatic verdicts. Always shown with a context note.

### Section 3 — Score Breakdown (per question)

For each question:
```
Q4 — Idempotency in payment queues                   88%
──────────────────────────────────────────────────────────
Core answer:      94%   ✓ Covered idempotency key, unique index, at-least-once
Senior signal:    91%   ✓ Named throughput tradeoff, mentioned TTL on key store
Trap avoidance:   72%   ~ Partially avoided — mentioned deduplication but missed
                          exactly-once semantics cost
Evidence:         80%   ✓ Referenced a real payment processing scenario

Confidence rating: 5/5  ✓ Matches score (well-calibrated)
Time on question:  9m 14s  ⚠️ Longest of all questions
Paste detected:    Yes — +340 chars at 6m 02s into this question

CANDIDATE'S ANSWER:
"To implement idempotency I would use a unique idempotency key
generated client-side and stored in MongoDB with a unique index.
On retry, if the key exists we return the cached result..."
[Show full answer ▼]

RECOMMENDED LIVE PROBE:
"Ask: What happens to the idempotency key store at scale?
 How do you prevent it growing unbounded?"
```

### Section 4 — Confidence vs Score Analysis
```
CONFIDENCE CALIBRATION
──────────────────────────────────────────────────────────
Q1 Node event loop     Confidence: 5/5   Score: 92%  ✓ Well-calibrated
Q2 MongoDB sharding    Confidence: 4/5   Score: 78%  ✓ Well-calibrated
Q3 JWT security        Confidence: 5/5   Score: 45%  ⚠️ OVERCONFIDENT
Q4 Idempotency         Confidence: 5/5   Score: 88%  ✓ Well-calibrated
Q5 Behavioral          Confidence: 3/5   Score: 71%  ~ Slightly underconfident

⚠️ FLAG: Candidate was highly confident on JWT security but scored 45%.
   This is a Dunning-Kruger pattern — they may not know what they don't know
   in this area. Probe JWT token refresh, rotation, and revocation in the live round.
```

### Section 5 — Time Heatmap
Visual bar chart showing time spent per question (text-based for MVP):
```
TIME PER QUESTION
──────────────────────────────────────────
Q1 Node event loop      2m 14s  ██░░░░░░░░
Q2 MongoDB sharding     6m 41s  ██████░░░░
Q3 JWT security        11m 08s  ██████████  ← most time spent
Q4 Idempotency          9m 14s  ████████░░
Q5 Behavioral           8m 45s  ███████░░░
```

Fast = confident or surface-level. Slow = struggling OR thorough. Context from score disambiguates.

### Section 6 — Candidate Comparison (if multiple candidates)
```
CANDIDATE COMPARISON — Senior Backend Engineer
──────────────────────────────────────────────────────────
                    Candidate A    Candidate B    Candidate C
Overall               76%            84%            61%
Core answer           81%            89%            68%
Senior signal         74%            87%            52%
Trap avoidance        68%            79%            55%
Evidence              72%            81%            68%
JWT Security          45%            91%            40%
MongoDB               88%            82%            74%
Tab switches          6              1              2
Verdict               Approaching    Strong Senior  Mid-Level
```

### Section 7 — Actions
```
[ Download PDF Report ]
[ Add note before live interview ]
[ Mark as: Advance to live | Reject | Hold ]
[ Send to hiring panel ] ← shares a view-only report link
```

---

## Question Analytics (Power Feature)

Accessible from the assessment view after 5+ submissions:

```
QUESTION HEALTH
──────────────────────────────────────────────────────────
Q: "Explain the Node.js event loop"
  Avg score:  91%   ← Everyone aces this. Consider removing or making harder.

Q: "Design a distributed rate limiter"
  Avg score:  28%   ← Everyone fails this. Rubric may be miscalibrated.
                       Consider reviewing the senior signal definition.

Q: "JWT refresh token strategy"
  Avg score:  61%   ✓ Good differentiation — spread across ability levels.
```

---

## Interviewer Settings

- Company name and logo (shown on candidate instructions page)
- Default proctoring rules (applied to all new assessments)
- Email notification preferences (notify on submit, notify on expiry)
- Team members — invite co-interviewers to shared assessments (Phase 2)
- Billing and plan (Phase 2)