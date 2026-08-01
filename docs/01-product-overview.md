# 01 — Product Overview

## The Problem

Technical hiring is broken in two specific ways:

**For candidates:**
- They study the wrong things because they don't know what a JD actually probes
- Generic prep (LeetCode, flashcards) doesn't connect to their real experience
- They know the answer but can't articulate it at a senior level under pressure

**For interviewers:**
- Async take-homes are unsupervised — candidates Google and use ChatGPT for 3 days
- Live interviews are inconsistent — every interviewer asks different things with no shared rubric
- Pass/fail scoring loses information — "they got it right" doesn't tell you if they reasoned at a senior level
- No tool surfaces domain-specific risk (HIPAA, PHI handling, audit trails) inside technical questions

## The Solution

AssessIQ connects both sides through shared, structured content:

- A **question bank** where every question has a core answer, a senior signal (what separates senior from mid), a trap (the common wrong answer), and a domain overlay for regulated industries
- A **scoring engine** that grades answers as a percentage across four rubric components — not correct/incorrect
- A **proctoring layer** that passively logs candidate behavior (tab switches, paste events, idle time) and surfaces it as context for the interviewer
- A **self-prep mode** where candidates use the same content to study, with spaced repetition and personal story mapping

## The Two Users

### User A — The Job Seeker

**Who:** A mid-to-senior software engineer actively interviewing or preparing to interview.

**Goal:** Get genuinely better at articulating what they know at a senior level, for a specific role they are targeting.

**What they need from the app:**
- Tell it what role they are targeting (paste JD) and what they have done (resume or bullet points)
- Get a personalized study plan weighted to what the JD actually probes
- Study using active recall — not reading, but revealing answers after thinking
- Understand *why* their answer is junior vs senior (the signal/trap layer)
- Map their real work experience to specific questions so they have stories ready
- Practice answering under a timer with AI feedback before the real interview

**What they do NOT need:**
- Proctoring (they are studying alone)
- Shareable links
- A report sent to anyone

---

### User B — The Interviewer

**Who:** An engineering manager, tech lead, or senior engineer who is hiring.

**Goal:** Send a consistent, fair, timed assessment to candidates and receive a detailed scored report that guides the live interview.

**What they need from the app:**
- Browse a question bank and pick the right questions for their role
- Configure a timer and proctoring rules
- Send a shareable link (no candidate account required)
- Get notified when a candidate submits
- See a detailed report: per-question scores, proctoring flags, confidence vs score delta, recommended live probes
- Compare multiple candidates on the same assessment

**What they do NOT need:**
- Spaced repetition
- Story bank
- Self-study mode

---

## What Makes This Different From Existing Tools

| Tool | What It Does | What It Misses |
|------|-------------|----------------|
| LeetCode / HackerRank | Coding challenges with timer | System design, behavioral, domain knowledge, rubric scoring |
| Codility | Proctored coding tests | Rubric % scoring, senior signal layer, non-coding questions |
| Final Round AI | Mock interviews with AI feedback | Interviewer side, shared assessment, proctoring, report card |
| Google Forms / Typeform | Custom questions, shareable | No timer, no proctoring, no scoring |
| iMocha / AG5 | Enterprise skills gap | Generic question banks, no senior/trap layer, no candidate prep mode |

**AssessIQ's lane:** Proctored, rubric-scored, system-design + behavioral + domain assessments — for both the candidate preparing and the interviewer evaluating. Nobody else does both from the same content.