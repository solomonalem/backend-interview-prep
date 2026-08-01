# 08 — API Routes

> Every REST endpoint. Auth requirements, request shape, and response shape.
> Base URL: `/api/v1`
> All responses are JSON. All errors return `{ error: string, code: string }`.

---

## Auth Middleware

```typescript
// Two middleware functions used throughout:

authInterviewer   // requires valid interviewer JWT in httpOnly cookie
authCandidate     // requires valid session JWT in Authorization: Bearer header
```

---

## Auth Routes (`/api/v1/auth`)

### `POST /auth/google`
Exchange Google OAuth code for interviewer JWT.
```typescript
// Request
{ code: string }

// Response 200
{ user: { id, email, name, company } }
// Sets httpOnly cookie: assessiq_token (JWT, 7 days)
```

### `POST /auth/login`
Email + password login for interviewers.
```typescript
// Request
{ email: string, password: string }

// Response 200
{ user: { id, email, name, company } }
// Sets httpOnly cookie

// Response 401
{ error: 'Invalid credentials', code: 'AUTH_INVALID' }
```

### `POST /auth/logout`
```typescript
// Response 200
{ ok: true }
// Clears cookie
```

### `GET /auth/me`
```typescript
// Auth: authInterviewer
// Response 200
{ id, email, name, company, created_at }
```

---

## Question Bank Routes (`/api/v1/questions`)

### `GET /questions`
Browse the question bank with filters.
```typescript
// Auth: authInterviewer
// Query params (all optional)
?topic=MongoDB
?difficulty=senior
?type=scenario
?domain=healthcare
?search=idempotency    // full-text search on question text
?page=1
?limit=20

// Response 200
{
  questions: Array<{
    id: string
    text: string
    topic: string
    difficulty: string
    type: string
    domain: string | null
    // NOTE: _guide fields are NOT returned here (private rubric data)
    core_answer_display: string
    senior_signal_display: string
    trap_display: string
  }>
  total: number
  page: number
  pages: number
}
```

### `GET /questions/:id`
Get a single question with full display data.
```typescript
// Auth: authInterviewer
// Response 200 — same shape as above, single object
```

### `POST /questions`
Create a custom question.
```typescript
// Auth: authInterviewer
// Request
{
  text: string
  topic: string
  difficulty: 'junior' | 'mid' | 'senior' | 'staff'
  type: 'conceptual' | 'scenario' | 'rca' | 'design' | 'behavioral'
  domain?: string
  core_answer_guide: string
  senior_signal_guide: string
  trap_guide: string
  evidence_guide: string
  core_answer_display: string
  senior_signal_display: string
  trap_display: string
}

// Response 201
{ id: string, ...question }
```

---

## Assessment Routes (`/api/v1/assessments`)

### `GET /assessments`
List all assessments for the logged-in interviewer.
```typescript
// Auth: authInterviewer
// Response 200
{
  assessments: Array<{
    id: string
    title: string
    question_count: number
    timer_enabled: boolean
    timer_seconds: number | null
    created_at: string
    links: Array<{
      id: string
      token: string
      candidate_label: string | null
      status: 'not_opened' | 'opened' | 'in_progress' | 'submitted' | 'expired'
      overall_score: number | null   // null until submitted and scored
    }>
  }>
}
```

### `POST /assessments`
Create a new assessment.
```typescript
// Auth: authInterviewer
// Request
{
  title: string
  question_ids: string[]              // ordered array of question IDs
  timer_enabled: boolean
  timer_seconds?: number
  proctoring_config?: {
    track_tab_switches: boolean
    track_focus_loss: boolean
    detect_paste: boolean
    detect_idle: boolean
    tab_switch_flag_threshold: number
  }
  confidence_rating_enabled: boolean
}

// Response 201
{ id: string, ...assessment }
```

### `GET /assessments/:id`
Get full assessment detail including questions and candidate statuses.
```typescript
// Auth: authInterviewer
// Response 200
{
  id: string
  title: string
  timer_enabled: boolean
  timer_seconds: number | null
  proctoring_config: object
  confidence_rating_enabled: boolean
  questions: Array<{
    position: number
    question: { id, text, topic, difficulty, type }
  }>
  links: Array<{
    id: string
    token: string
    candidate_label: string | null
    expires_at: string
    status: string
    session?: {
      id: string
      status: string
      started_at: string | null
      submitted_at: string | null
      overall_score: number | null
    }
  }>
}
```

### `PUT /assessments/:id`
Update an assessment (only if no sessions have started yet).
```typescript
// Auth: authInterviewer
// Request — same shape as POST, all fields optional
// Response 200 — updated assessment
// Response 409 if sessions exist
{ error: 'Cannot edit assessment with active or completed sessions', code: 'ASSESSMENT_LOCKED' }
```

### `POST /assessments/:id/links`
Generate a new shareable link for this assessment.
```typescript
// Auth: authInterviewer
// Request
{
  candidate_label?: string    // e.g. "Candidate A" or email
  expires_in_hours?: number   // default: 168 (7 days)
}

// Response 201
{
  id: string
  token: string
  url: string        // full URL: https://assessiq.app/a/{token}
  expires_at: string
}
```

---

## Candidate Session Routes (`/api/v1/sessions`)

These routes are called by the candidate (not the interviewer).

### `GET /sessions/link/:token`
Validate a link and get assessment info before starting.
```typescript
// Auth: none (public)
// Response 200
{
  valid: true
  assessment: {
    title: string
    question_count: number
    timer_seconds: number | null
    proctoring_enabled: boolean
    confidence_rating_enabled: boolean
    company_name: string | null   // interviewer's company — shown on instructions page
  }
}

// Response 404 or 410
{ error: 'Link not found or expired', code: 'LINK_INVALID' }

// Response 409
{ error: 'This link has already been used', code: 'LINK_USED' }
```

### `POST /sessions/start`
Start the assessment. Creates a session and issues a session JWT.
```typescript
// Auth: none (public — the token in body acts as credential)
// Request
{ link_token: string }

// Response 201
{
  session_id: string
  session_token: string    // short-lived JWT — candidate uses this for all subsequent calls
  expires_at: string       // when the timer expires (or null if no timer)
  first_question: {
    position: 0
    question: {
      id: string
      text: string
      topic: string
    }
  }
}
```

### `GET /sessions/:id/question/:position`
Get the question at a given position.
```typescript
// Auth: authCandidate
// Response 200
{
  position: number
  total: number
  question: {
    id: string
    text: string
    topic: string
    // NO rubric fields exposed here
  }
  time_remaining_ms: number | null   // null if no timer
}

// Response 403 if trying to access a question they haven't reached yet
// Response 409 if trying to access a completed/submitted question
```

### `POST /sessions/:id/answers`
Submit an answer to a question.
```typescript
// Auth: authCandidate
// Request
{
  question_id: string
  position: number
  text: string               // the candidate's answer
  confidence_rating?: number  // 1–5, required if confidence_rating_enabled
  time_spent_ms: number      // client-calculated time on this question
}

// Response 201
{
  answer_id: string
  next_position: number | null   // null if this was the last question
}

// Response 400 if answer already submitted for this question
// Response 400 if session is already submitted
```

### `POST /sessions/:id/events`
Batch upload behavior events.
```typescript
// Auth: authCandidate
// Request
{
  events: Array<{
    type: 'tab_switch' | 'focus_loss' | 'paste' | 'idle'
    timestamp: number        // unix ms
    question_index: number
    char_count?: number      // paste only
    idle_duration_ms?: number // idle only
  }>
}

// Response 202 (accepted, no body)
```

### `POST /sessions/:id/submit`
Manually submit the assessment (all questions answered).
```typescript
// Auth: authCandidate
// Request: empty body
// Response 200
{
  ok: true
  message: 'Your assessment has been submitted. Thank you.'
}
// Triggers: scoring jobs enqueued for all answers
```

---

## Report Routes (`/api/v1/reports`)

### `GET /reports/session/:sessionId`
Get the full report for a session.
```typescript
// Auth: authInterviewer (must own the assessment)
// Response 200 — only available after scoring is complete
{
  session: {
    id: string
    candidate_label: string | null
    started_at: string
    submitted_at: string
    time_used_ms: number
    auto_submitted: boolean
  }
  assessment: {
    title: string
    timer_seconds: number | null
  }
  overall: {
    total_pct: number
    verdict: string
    core_avg: number
    senior_signal_avg: number
    trap_avg: number
    evidence_avg: number
  }
  proctoring: {
    tab_switch_count: number
    tab_switch_timestamps: Array<{ timestamp: number, question_index: number }>
    focus_loss_count: number
    paste_events: Array<{ timestamp: number, question_index: number, char_count: number }>
    idle_count: number
    context_note: string   // Claude-generated context
  }
  questions: Array<{
    position: number
    question: { id, text, topic, difficulty }
    answer: { text: string, time_spent_ms: number, paste_detected: boolean }
    score: {
      total_pct: number
      core_pct: number
      core_reasoning: string
      senior_signal_pct: number
      senior_signal_reasoning: string
      trap_pct: number
      trap_reasoning: string
      evidence_pct: number
      evidence_reasoning: string
      what_was_hit: string[]
      what_was_missed: string[]
      recommended_probe: string
    }
    confidence_rating: number | null
    confidence_flag: string | null
  }>
  pdf_url: string | null    // null until PDF is ready
}

// Response 202 if scoring is still in progress
{ status: 'scoring_in_progress', answers_scored: number, total_answers: number }
```

### `GET /reports/session/:sessionId/pdf`
Download the PDF report.
```typescript
// Auth: authInterviewer
// Response 302 redirect to R2 signed URL (valid for 1 hour)
```

---

## Study Mode Routes (`/api/v1/study`)

These routes are for the job seeker mode. Auth: `authInterviewer` (same user account).

### `GET /study/deck`
Get today's study deck (spaced repetition queue + weak areas).
```typescript
// Auth: authInterviewer
// Response 200
{
  due_today: Array<{ question: Question, progress: StudyProgress }>
  weak_topics: Array<{ topic: string, avg_confidence: number, question_count: number }>
  streak_days: number
}
```

### `POST /study/progress`
Record a self-rating on a study card.
```typescript
// Auth: authInterviewer
// Request
{ question_id: string, rating: 'missed' | 'partial' | 'got_it' }

// Response 200
{ next_review: string }   // ISO date of next scheduled review
```

### `POST /study/practice`
Score a practice answer (synchronous — user waits for feedback).
```typescript
// Auth: authInterviewer
// Request
{ question_id: string, answer_text: string }

// Response 200 (after ~3-5 seconds — Claude call)
{
  score: {
    total_pct: number
    core_pct: number, core_reasoning: string
    senior_signal_pct: number, senior_signal_reasoning: string
    trap_pct: number, trap_reasoning: string
    evidence_pct: number, evidence_reasoning: string
    what_was_hit: string[]
    what_was_missed: string[]
  }
  // Also returns full display rubric so user can learn from it
  rubric: {
    core_answer_display: string
    senior_signal_display: string
    trap_display: string
  }
}
```

### `POST /study/decode-jd`
Decode a job description into weighted topics.
```typescript
// Auth: authInterviewer
// Request
{ jd_text: string }

// Response 200
{
  role_title: string
  domain: string | null
  topics: Array<{
    topic: string
    weight: 'Critical' | 'High' | 'Differentiator' | 'Low'
    question_count: number   // how many questions we have for this topic
  }>
}
```

### `POST /study/stories`
Create a story.
```typescript
// Auth: authInterviewer
// Request
{
  title: string
  type: 'bug_fix' | 'feature' | 'incident' | 'architecture'
  situation: string
  task: string
  action: string
  result: string
}

// Response 201
{
  id: string
  suggested_tags: string[]   // Claude-suggested topic tags
  ...story
}
```

### `GET /study/stories`
List user's stories.
```typescript
// Auth: authInterviewer
// Response 200
{ stories: Story[] }
```

### `PUT /study/stories/:id`
Update a story.
```typescript
// Auth: authInterviewer
// Request — any story fields (partial update)
// Response 200 — updated story
```

### `DELETE /study/stories/:id`
```typescript
// Auth: authInterviewer
// Response 204
```