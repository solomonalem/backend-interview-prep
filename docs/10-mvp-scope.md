# 10 — MVP Scope & Phased Roadmap

> This file tells Claude Code exactly what to build first, what to defer, and in what order.
> Do not build anything in Phase 2 or 3 until Phase 1 is working end-to-end.

---

## The MVP Test (Phase 0)

The MVP is done when this exact flow works without manual intervention:

1. An interviewer signs up, browses the question bank, picks 5 questions, sets a 45-minute timer, and generates a link
2. A candidate opens the link, reads the disclosure, starts the assessment
3. The candidate answers all 5 questions, rates their confidence on each, and submits
4. The platform scores every answer via Claude in the background
5. The interviewer receives an email with the full report — per-question scores, proctoring flags, verdict, and recommended live probes
6. The interviewer can also view the report in the dashboard

If all six steps work, MVP is done. Everything else is Phase 1 or later.

---

## Phase 0 — Core Loop (Weeks 1–6)

### What to build

**Backend:**
- [ ] Prisma schema + migrations (full schema from `07-data-model.md`)
- [ ] Seed script: 50 starter questions across Node.js, MongoDB, Security, Microservices, Behavioral, Healthcare
- [ ] Auth: Google OAuth + JWT cookie for interviewers
- [ ] `GET /questions` — basic list with topic/difficulty filter
- [ ] `POST /assessments` — create assessment with questions + timer
- [ ] `POST /assessments/:id/links` — generate shareable link
- [ ] `GET /sessions/link/:token` — validate link (public)
- [ ] `POST /sessions/start` — create session, issue session JWT
- [ ] `GET /sessions/:id/question/:position` — get question
- [ ] `POST /sessions/:id/answers` — submit answer
- [ ] `POST /sessions/:id/events` — batch behavior events
- [ ] `POST /sessions/:id/submit` — manual submit
- [ ] Auto-submit trigger when timer expires (check on every answer submit if time is up)
- [ ] BullMQ scoring queue + worker (calls Claude, stores Score)
- [ ] Report compilation service (runs after all answers scored)
- [ ] Email notification to interviewer on report ready (Resend)
- [ ] `GET /reports/session/:id` — full report data

**Frontend:**
- [ ] Login page (Google OAuth button)
- [ ] Question bank page (list, filter by topic, preview question)
- [ ] Assessment builder page (pick questions, set timer, proctoring toggles)
- [ ] Link generation + copy UI
- [ ] Interviewer dashboard (list assessments, candidate statuses)
- [ ] Report page (all sections from `03-interviewer-behaviour.md`)
- [ ] Candidate: link landing page (instructions + disclosure + start button)
- [ ] Candidate: assessment page (timer, one question at a time, answer textarea, confidence rating, progress bar)
- [ ] Candidate: submitted confirmation page
- [ ] Proctoring event listeners (all four signals from `05-proctoring.md`)

### What is explicitly deferred from Phase 0

- Study mode / job seeker features (entire `02-jobseeker-behaviour.md`)
- PDF report generation (email link to web report instead)
- Candidate comparison view
- Question analytics (too few data points)
- Custom question creation by interviewers
- Story bank
- JD decode

---

## Phase 1 — Depth + Polish (Weeks 7–12)

Add depth to what already works. Do not add new workflows.

- [ ] PDF report generation (Puppeteer → R2 → download link in report)
- [ ] Candidate comparison view in dashboard
- [ ] Per-question time heatmap in report
- [ ] Confidence vs score delta analysis and flags in report
- [ ] Proctoring timeline: tab switches mapped to questions and timestamps (currently only counts)
- [ ] Recommended live probes surfaced prominently in report
- [ ] Custom question builder for interviewers
- [ ] Resend link (generate new link for same assessment, same candidate)
- [ ] Assessment duplication (clone an existing assessment)
- [ ] Question search (full text on question.text)
- [ ] Email preview: show report summary in email body, not just a link
- [ ] Bull Board UI for queue monitoring (`/admin/queues` — internal only)

---

## Phase 2 — Job Seeker Mode (Weeks 13–20)

The self-prep experience. Same user account, different mode.

- [ ] Onboarding wizard: JD paste + decode (Claude) + resume paste
- [ ] Study deck: weighted question list based on JD decode
- [ ] Study card UI: reveal, self-rating (missed/partial/got it)
- [ ] Spaced repetition: next review date calculation on each rating
- [ ] Study dashboard: progress per topic, streak, daily queue
- [ ] Practice mode: timed answer with Claude feedback
- [ ] Story bank: add STAR stories, Claude auto-tags them
- [ ] Story → question linking: teal callout on study cards
- [ ] Interview day mode: rapid review of weakest topics

---

## Phase 3 — Enterprise + AI Generation (Weeks 21+)

- [ ] Team/company accounts: multiple interviewers under one org
- [ ] Shared question banks within a company
- [ ] ATS integration: push report as note to Greenhouse / Lever
- [ ] Healthcare compliance question module (HIPAA, PHI, HL7/FHIR)
- [ ] Fintech compliance module (PCI, SOX)
- [ ] Audit-ready PDF export with scoring methodology included
- [ ] Question generation from JD (Claude generates new questions weighted to a pasted JD)
- [ ] Question analytics: flag questions that are too easy or too hard based on aggregate data
- [ ] Interviewer calibration: flag score inconsistencies across interviewers for same question
- [ ] HIPAA BAA + migrate to AWS (required for healthcare orgs)

---

## Build Order Within Phase 0

Follow this sequence. Each step should be working before starting the next.

```
Week 1:
  1. Monorepo scaffold (apps/web, apps/api, packages/types)
  2. Docker Compose up (postgres + redis)
  3. Prisma schema + first migration
  4. Seed 10 questions (enough to test)
  5. Express app skeleton with health check route

Week 2:
  6. Auth routes (Google OAuth + JWT)
  7. authInterviewer middleware
  8. GET /questions (basic list, no filter yet)
  9. Login page + protected route shell in React

Week 3:
  10. POST /assessments
  11. POST /assessments/:id/links
  12. GET /assessments (list)
  13. Assessment builder UI (pick questions, timer config)
  14. Link generation UI (copy link)

Week 4:
  15. GET /sessions/link/:token (public — validate link)
  16. POST /sessions/start (issue session JWT)
  17. authCandidate middleware
  18. GET /sessions/:id/question/:position
  19. POST /sessions/:id/answers
  20. POST /sessions/:id/submit
  21. POST /sessions/:id/events (behavior log)
  22. Candidate: landing page + assessment page + submitted page
  23. Session timer (client-side countdown, auto-submit on expire)
  24. Proctoring event listeners

Week 5:
  25. BullMQ scoring queue setup
  26. Scoring worker (Claude API call + parse + store Score)
  27. Report compilation service
  28. GET /reports/session/:id

Week 6:
  29. Email notification (Resend) — report ready
  30. Report page in React (all sections)
  31. Interviewer dashboard — candidate statuses
  32. End-to-end test: full flow manually
  33. Fix bugs. Seed 40 more questions.
```

---

## Definition of Done for Each Feature

A feature is done when:
1. The API route works (test with curl or Postman)
2. The frontend calls it and displays the result
3. Error states are handled (loading, empty, error message)
4. It does not break any previously working feature

Do NOT write unit tests in Phase 0. Manual testing is sufficient. Add tests in Phase 1 when the shape has stabilized.

---

## Starter Questions to Seed (Phase 0)

Seed at least 2–3 questions per topic to make the question bank usable for testing:

| Topic | Count |
|-------|-------|
| Node.js / Event Loop | 5 |
| MongoDB | 8 |
| Express / REST | 4 |
| Security / JWT | 5 |
| Microservices | 6 |
| System Design | 5 |
| RCA / Debugging | 5 |
| Behavioral / STAR | 5 |
| Healthcare Domain | 5 |
| AWS / Cloud | 2 |

Total: 50 questions. Write them with all fields populated (`_guide` and `_display` versions).

---

## What Success Looks Like After Phase 0

- One real interviewer (you) has used it to send an assessment to one real candidate
- The report was useful — it told you something about the candidate you would not have known from a resume
- The proctoring flags were accurate
- No manual intervention was needed to score or send the report
- You would use it again for the next hire