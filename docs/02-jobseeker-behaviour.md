# 02 — Job Seeker Behaviour

> This file describes every screen, interaction, and state for a user in self-prep (job seeker) mode.
> The job seeker has an account. They are studying alone. There is no proctoring, no shareable link, no report sent anywhere.

---

## Onboarding Flow (first time only)

### Screen: Welcome / Sign Up
- User signs up with Google OAuth or email + password
- After auth, they land on an onboarding wizard (not skippable on first visit)

### Screen: Onboarding Step 1 — Target Role
- Heading: "What role are you preparing for?"
- Input A: Large textarea — "Paste the job description here"
- Input B: Text field — "Or describe the role in a sentence (e.g. Senior Node.js Engineer at a healthcare startup)"
- On submit: backend sends JD text to Claude, which extracts:
  - Role title
  - Tech stack mentioned (Node, MongoDB, AWS, etc.)
  - Topic weights (Critical / High / Differentiator / Low) for each area
  - Domain (healthcare, fintech, general, etc.)
- User sees a decoded table: "Here is what this JD is actually testing"

```
Topic              Weight
─────────────────────────────
MongoDB            Critical
Node.js / Event Loop  Critical
Security / JWT     High
Microservices      High
AWS                Differentiator
Docker / CI-CD     Differentiator
Behavioral / STAR  High
Healthcare Domain  Differentiator
```

- User can adjust weights manually before proceeding

### Screen: Onboarding Step 2 — Your Experience
- Heading: "Tell us about your background so we can personalise your study deck"
- Input A: Textarea — "Paste your resume or describe your last 2–3 roles"
- Input B: Optional — "List your most significant projects or incidents (one per line)"
- On submit: Claude extracts tech they have used, infers experience level, identifies likely gaps vs the JD weights

### Screen: Onboarding Step 3 — Study Deck Preview
- Shows the generated study plan:
  - Topics sorted by JD weight
  - Per topic: estimated question count, your current estimated coverage (based on resume), gap indicator
  - Example: "MongoDB — 24 questions — you have 60% coverage — 10 questions flagged for focus"
- CTA: "Start Studying" → goes to the main study dashboard

---

## Main Dashboard (returning user)

### What the dashboard shows:
- **Daily goal**: e.g. "Review 15 questions today"
- **Topic progress bars**: one per topic, showing % of questions at confidence level "Got it"
- **Streak**: days studied in a row
- **Weakest topics**: top 3 topics with lowest confidence scores — with "Study now" shortcut
- **Upcoming reviews**: questions due for spaced repetition today
- **Story bank status**: "You have 5 stories mapped. 3 questions have no story yet."
- **Interview day countdown**: optional — user can set a target date

---

## Study Mode

### How the user enters study mode:
- From dashboard: click a topic → enters study mode for that topic
- Or: click "Start daily review" → queue is pre-built from due cards + weak areas

### Screen: Study Card

One question visible at a time.

**Card front (question visible, answer hidden):**
```
Topic tag: [MongoDB]  Difficulty: [Senior]  Card 4 of 18

Q: You have a MongoDB collection with 50 million documents.
   Queries are fast in dev but slow in production.
   Walk me through how you would diagnose and fix this.

[ Think about it... ]

[ Reveal Answer ]
```

**Card back (answer revealed):**
```
CORE ANSWER
Start with explain() to get the query plan. Check for COLLSCAN
(full collection scan) vs IXSCAN (index scan). Profile slow
queries using db.setProfilingLevel(2). Check index coverage,
selectivity, and whether compound indexes match query patterns.

──────────────────────────────────────────────────────
SENIOR SIGNAL  (amber)
A senior engineer names the specific tradeoff: indexes speed
up reads but slow down writes and consume RAM. They mention
the ESR rule for compound indexes (Equality, Sort, Range).
They ask about the query access patterns before adding indexes.

──────────────────────────────────────────────────────
TRAP  (rust)
Saying "just add an index" without considering write
performance, index selectivity, or whether the slow query
is even the right query to be running.

──────────────────────────────────────────────────────
YOUR STORY (teal — only if user has a mapped story)
"This maps to your OFS ghost-worker debugging incident.
Use that as your evidence example."
```

**Self-rating buttons (required before next card):**
```
[ ✗ Missed it ]   [ ~ Got part of it ]   [ ✓ Got it ]
```

- "Missed it" → card comes back in current session + flagged for tomorrow
- "Got part of it" → card comes back in 2 days
- "Got it" → card comes back in 7 days (then 14, 30, etc.)

### Study mode controls:
- Progress bar at top: "Card 4 of 18 — Topic: MongoDB"
- Skip button (marks card as "skipped", comes back at end of session)
- End session button → shows session summary

### Session summary screen:
```
Session Complete — MongoDB

Got it:        12  ✓
Got part of:    4  ~
Missed:         2  ✗
Skipped:        0

Weakest card this session:
"Explain the CAP theorem and where MongoDB sits"
→ [ Review it now ] or [ See it tomorrow ]

Your confidence in MongoDB: 71% → 78%  ↑

[ Back to Dashboard ]   [ Keep going — Microservices ]
```

---

## Timed Practice Mode

This is different from study mode. The user is simulating a real interview answer.

### Entry point:
- From dashboard: "Practice answering" button
- Or from a study card: "Practice this question" link

### Screen: Practice Mode Setup
- Select topic or "Mix everything"
- Set time per question: 1 min / 2 min / 3 min / custom
- Toggle: "Show senior signal as hint" (on = easier, off = realistic)
- CTA: "Start Practice"

### Screen: Practice Question
```
[ 2:34 remaining ]

Q: Explain how you would implement idempotency in a
   payment processing queue using Node.js and MongoDB.

[ Your answer — type here ]




[ Submit Answer ]
```

- Timer counts down visibly
- No answer revealed until they submit
- No hints (unless hint toggle was on)

### Screen: Practice Feedback (after submit)
```
YOUR ANSWER SCORED: 73%

Component          Your Score    Max
────────────────────────────────────
Core answer           82%        25%  → 20.5pts
Senior signal         91%        35%  → 31.9pts
Trap avoidance        40%        25%  → 10.0pts
Evidence / example    70%        15%  → 10.5pts

WHAT YOU HIT
✓ Correctly identified idempotency key pattern
✓ Mentioned at-least-once delivery risk
✓ Referenced MongoDB unique index for deduplication

WHAT YOU MISSED
✗ Trap triggered: did not address what happens when the
  idempotency store grows unbounded (TTL index needed)
✗ Senior signal missed: did not name the tradeoff between
  strict idempotency and throughput at scale

IDEAL ANSWER INCLUDES
A senior answer names: idempotency key, unique constraint,
at-least-once vs exactly-once semantics, TTL on the key store,
and the performance tradeoff at high message volume.

[ Try Again ]   [ Next Question ]   [ Add This to Story Bank ]
```

---

## Story Bank

### Purpose:
Map real work experience to specific interview questions so the user is never caught without an example.

### Screen: Story Bank
- List of user's logged stories
- Each story shows: title, type (bug fix / feature / incident / architecture decision), and which questions it maps to
- CTA: "Add a story"

### Screen: Add Story
Fields:
```
Title: _______________________________________________

Type: [ Bug Fix ] [ Feature ] [ Incident / RCA ] [ Architecture Decision ]

Situation:
What was the context? What system, what team, what scale?
_______________________________________________

Task:
What was your specific responsibility?
_______________________________________________

Action:
What did you actually do? Be specific — tools, decisions, tradeoffs.
_______________________________________________

Result:
What was the measurable outcome? Time saved, bugs prevented, system improvement?
_______________________________________________

Tags (auto-suggested after save):
[ MongoDB ] [ RCA ] [ Performance ] [ Distributed Systems ]
```

On save: Claude reads the story and suggests which question tags it maps to. User confirms or adjusts.

### Story → Question linking:
- On any study card, if the user has a story tagged to that topic: show "Your Story" block in teal
- On the story bank screen: click a story → see all questions it maps to → can jump to studying those

---

## Interview Day Mode

Triggered when user has set a target interview date and it is within 24 hours, or they click "Interview day prep" manually.

### Screen: Interview Day
```
Today is the day. Let's make sure you're sharp.

Your 3 weakest areas right now:
  JWT Security         52% confidence  [ Quick review ]
  MongoDB Sharding     61% confidence  [ Quick review ]
  CAP Theorem          64% confidence  [ Quick review ]

Your strongest stories for this role:
  Ghost-worker debugging  → RCA, Distributed Systems, MongoDB
  RBAC hole fix           → Security, JWT, Auth
  57-hour divergence      → Async, Event Loop, Debugging

Rapid fire review: 20 questions, 60 seconds each.
[ Start 20-min rapid review ]
```

---

## Settings (Job Seeker)

- Change target role / re-run JD decode
- Reset progress on a topic
- Edit or delete stories
- Set interview date countdown
- Notification preferences (daily reminder email)
- Export study progress as PDF