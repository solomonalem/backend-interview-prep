# 07 — Data Model

> This is the Prisma schema. Copy this directly into `apps/api/prisma/schema.prisma`.
> All entities, fields, types, relationships, and indexes are defined here.

---

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── USERS (INTERVIEWERS) ────────────────────────────────────────────────────

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  name          String?
  company       String?
  google_id     String?       @unique
  password_hash String?       // null if Google OAuth only
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt

  assessments   Assessment[]

  @@map("users")
}

// ─── QUESTIONS ────────────────────────────────────────────────────────────────

model Question {
  id          String          @id @default(cuid())
  text        String          // the question shown to candidate

  topic       String          // e.g. "MongoDB", "Node.js", "Security"
  difficulty  Difficulty
  type        QuestionType
  domain      String?         // e.g. "healthcare", "fintech" — null = general

  // Rubric: used by Claude to score answers (never shown to candidates)
  core_answer_guide       String
  senior_signal_guide     String
  trap_guide              String
  evidence_guide          String

  // Display: shown in study mode after answer revealed (job seeker mode)
  core_answer_display     String
  senior_signal_display   String
  trap_display            String

  // Metadata
  is_active     Boolean       @default(true)
  created_by    String?       // null = system question; cuid = user-created
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt

  assessment_questions  AssessmentQuestion[]
  answers               Answer[]

  @@index([topic])
  @@index([difficulty])
  @@index([domain])
  @@map("questions")
}

enum Difficulty {
  junior
  mid
  senior
  staff
}

enum QuestionType {
  conceptual
  scenario
  rca
  design
  behavioral
}

// ─── ASSESSMENTS ─────────────────────────────────────────────────────────────

model Assessment {
  id          String    @id @default(cuid())
  title       String
  owner_id    String
  owner       User      @relation(fields: [owner_id], references: [id])

  // Timer config
  timer_enabled     Boolean   @default(false)
  timer_seconds     Int?      // null if no timer

  // Proctoring config (stored as JSON)
  proctoring_config Json      @default("{\"track_tab_switches\":true,\"track_focus_loss\":true,\"detect_paste\":true,\"detect_idle\":true,\"tab_switch_flag_threshold\":3}")

  // Features
  confidence_rating_enabled Boolean @default(true)

  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  questions   AssessmentQuestion[]
  links       AssessmentLink[]
  sessions    Session[]

  @@map("assessments")
}

// Join table: Assessment ↔ Question (with ordering)
model AssessmentQuestion {
  id            String      @id @default(cuid())
  assessment_id String
  question_id   String
  position      Int         // display order (0-indexed)

  assessment    Assessment  @relation(fields: [assessment_id], references: [id], onDelete: Cascade)
  question      Question    @relation(fields: [question_id], references: [id])

  @@unique([assessment_id, position])
  @@unique([assessment_id, question_id])
  @@map("assessment_questions")
}

// ─── ASSESSMENT LINKS (SHAREABLE URLS) ───────────────────────────────────────

model AssessmentLink {
  id              String      @id @default(cuid())
  token           String      @unique   // random 10-char, URL-safe — this is the URL slug
  assessment_id   String
  assessment      Assessment  @relation(fields: [assessment_id], references: [id], onDelete: Cascade)

  candidate_label String?     // e.g. "Candidate A" or email — optional
  expires_at      DateTime
  opened_at       DateTime?   // set when candidate first clicks link
  session_id      String?     @unique  // set when session is created from this link

  created_at  DateTime  @default(now())

  session     Session?  @relation(fields: [session_id], references: [id])

  @@map("assessment_links")
}

// ─── SESSIONS (A CANDIDATE TAKING AN ASSESSMENT) ─────────────────────────────

model Session {
  id              String          @id @default(cuid())
  assessment_id   String
  assessment      Assessment      @relation(fields: [assessment_id], references: [id])

  candidate_label String?         // carried from AssessmentLink

  status          SessionStatus   @default(not_started)
  started_at      DateTime?
  submitted_at    DateTime?       // null until submitted
  auto_submitted  Boolean         @default(false)  // true if timer expired

  // Session JWT for candidate API calls during assessment
  session_token   String?         @unique

  created_at      DateTime        @default(now())
  updated_at      DateTime        @updatedAt

  link            AssessmentLink?
  answers         Answer[]
  behavior_events BehaviorEvent[]
  report          Report?

  @@index([assessment_id])
  @@map("sessions")
}

enum SessionStatus {
  not_started
  in_progress
  submitted
  expired
}

// ─── ANSWERS ─────────────────────────────────────────────────────────────────

model Answer {
  id              String    @id @default(cuid())
  session_id      String
  session         Session   @relation(fields: [session_id], references: [id], onDelete: Cascade)
  question_id     String
  question        Question  @relation(fields: [question_id], references: [id])
  position        Int       // which question in the assessment (0-indexed)

  text            String    // the candidate's answer text

  confidence_rating Int?    // 1–5, null if feature disabled or skipped
  time_spent_ms   Int       // milliseconds from question shown to answer submitted

  paste_detected  Boolean   @default(false)
  paste_char_count Int?     // largest paste char count during this question

  scoring_status  ScoringStatus @default(pending)
  submitted_at    DateTime  @default(now())

  score           Score?

  @@unique([session_id, question_id])
  @@index([session_id])
  @@map("answers")
}

enum ScoringStatus {
  pending
  scoring
  scored
  failed
}

// ─── SCORES ──────────────────────────────────────────────────────────────────

model Score {
  id          String  @id @default(cuid())
  answer_id   String  @unique
  answer      Answer  @relation(fields: [answer_id], references: [id], onDelete: Cascade)

  // Component scores (0–100)
  core_pct            Int
  senior_signal_pct   Int
  trap_pct            Int
  evidence_pct        Int

  // Claude's one-sentence reasoning per component
  core_reasoning          String
  senior_signal_reasoning String
  trap_reasoning          String
  evidence_reasoning      String

  // Weighted total
  total_pct   Int     // calculated: core*0.25 + senior*0.35 + trap*0.25 + evidence*0.15

  // Claude's structured feedback
  what_was_hit      String[]  // array of strings: things candidate got right
  what_was_missed   String[]  // array of strings: things candidate missed
  recommended_probe String    // suggested live follow-up question

  // Confidence delta
  confidence_flag   ConfidenceFlag?  // null if confidence rating disabled

  // Metadata
  model_used  String    // e.g. "claude-sonnet-4-6"
  scored_at   DateTime  @default(now())

  @@map("scores")
}

enum ConfidenceFlag {
  well_calibrated
  overconfident
  underconfident
}

// ─── BEHAVIOR EVENTS ─────────────────────────────────────────────────────────

model BehaviorEvent {
  id          String            @id @default(cuid())
  session_id  String
  session     Session           @relation(fields: [session_id], references: [id], onDelete: Cascade)

  type        BehaviorEventType
  timestamp   BigInt            // unix ms
  question_index Int            // which question was active (0-indexed)

  // Optional metadata
  char_count      Int?          // paste events: character count of pasted text
  idle_duration_ms Int?         // idle events: how long idle in ms

  @@index([session_id])
  @@map("behavior_events")
}

enum BehaviorEventType {
  tab_switch
  focus_loss
  paste
  idle
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

model Report {
  id          String    @id @default(cuid())
  session_id  String    @unique
  session     Session   @relation(fields: [session_id], references: [id])

  overall_pct Int
  verdict     Verdict

  // Proctoring summary (computed)
  tab_switch_count  Int
  focus_loss_count  Int
  paste_count       Int
  idle_count        Int
  proctoring_context String  // Claude-generated context note

  // PDF
  pdf_url     String?   // R2 URL, null until generated
  pdf_status  PdfStatus @default(pending)

  // Email
  email_sent_at DateTime?

  generated_at DateTime @default(now())

  @@map("reports")
}

enum Verdict {
  Strong_Senior
  Approaching_Senior
  Mid_Level
  Junior
}

enum PdfStatus {
  pending
  generating
  ready
  failed
}

// ─── STUDY PROGRESS (JOB SEEKER MODE) ────────────────────────────────────────

model StudyProgress {
  id          String    @id @default(cuid())
  user_id     String
  question_id String

  rating      StudyRating           // last self-rating
  next_review DateTime              // spaced repetition: when to show again
  review_count Int       @default(0)
  last_seen   DateTime  @default(now())

  @@unique([user_id, question_id])
  @@index([user_id, next_review])
  @@map("study_progress")
}

enum StudyRating {
  missed
  partial
  got_it
}

// ─── STORIES (JOB SEEKER MODE) ───────────────────────────────────────────────

model Story {
  id          String    @id @default(cuid())
  user_id     String
  title       String
  type        StoryType
  situation   String
  task        String
  action      String
  result      String
  tags        String[]  // topic tags, e.g. ["MongoDB", "RCA", "Performance"]
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  @@index([user_id])
  @@map("stories")
}

enum StoryType {
  bug_fix
  feature
  incident
  architecture
}
```

---

## Key Relationships Summary

```
User (interviewer)
  └── Assessment[]
        ├── AssessmentQuestion[] (join — ordered question list)
        └── AssessmentLink[]
              └── Session
                    ├── Answer[]
                    │     ├── Score
                    │     └── (paste_detected, time_spent_ms on Answer)
                    ├── BehaviorEvent[]
                    └── Report

User (job seeker)
  ├── StudyProgress[] (per question)
  └── Story[]
```

---

## Important Notes

1. **Candidates are not Users.** Candidates have no account. They exist only in `Session.candidate_label` (a string).

2. **Questions have two sets of rubric fields**: `_guide` (for Claude scoring, private) and `_display` (shown to job seekers in study mode, after answer reveal). Never expose `_guide` fields to the frontend in assessment mode.

3. **BehaviorEvent.timestamp is BigInt** because JavaScript Date.now() returns a number that can exceed 32-bit int in some edge cases. Always convert to number when sending to frontend: `Number(event.timestamp)`.

4. **Score.total_pct is stored, not computed at query time.** Calculate it once when scoring, store the result. Do not recompute on every query.

5. **Session.session_token is a short-lived JWT** issued only to the active candidate, scoped only to that session's API calls. It expires when the session is submitted or when `timer_seconds` elapses.