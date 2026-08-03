# 05 — Proctoring & Behavior Tracking

> Proctoring is passive. No webcam. No screen recording. No automatic disqualification.
> The system logs behavioral signals and presents them as context for the interviewer to interpret.
> The candidate is told upfront exactly what is being tracked.

---

## Disclosure (Required)

Before the candidate starts, they must see and acknowledge:

```
ABOUT THIS ASSESSMENT

This assessment is timed and monitored for the following behaviors:
  • Tab switching or leaving this window
  • Loss of window focus (switching to another app)
  • Large paste events (pasting a significant amount of text)
  • Periods of inactivity

These signals are logged and shared with the interviewer alongside your scores.
They are not used to automatically pass or fail you — the interviewer reviews them
alongside your answers.

By clicking "Start Assessment" you acknowledge this monitoring.

[ Start Assessment ]
```

This disclosure is non-negotiable. Display it on every assessment regardless of whether the interviewer enabled proctoring — they may have disabled some signals but the candidate should always know the session is tracked.

---

## Tracked Signals

### 1. Tab Switch (visibilitychange event)

```typescript
// Frontend — mounted when session starts
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    logEvent({
      type: 'tab_switch',
      timestamp: Date.now(),
      question_index: currentQuestionIndex,
    })
  }
})
```

What is logged:
- Timestamp of each switch (when the tab became hidden)
- Which question was active at the time
- Total count

What it means: candidate left the assessment tab. Could be checking notes, Googling, or just switching music. Context from score tells you which.

---

### 2. Window / App Focus Loss (blur event)

```typescript
window.addEventListener('blur', () => {
  logEvent({
    type: 'focus_loss',
    timestamp: Date.now(),
    question_index: currentQuestionIndex,
  })
})
```

Different from tab switch: this fires when the user switches to another application (e.g. opens VS Code, Slack, or a browser window). Tab switch fires when they switch browser tabs within the same window.

---

### 3. Large Paste Detection (paste event)

```typescript
answerTextarea.addEventListener('paste', (e: ClipboardEvent) => {
  const pasted = e.clipboardData?.getData('text') ?? ''
  if (pasted.length > 150) {   // threshold: 150 characters
    logEvent({
      type: 'paste',
      timestamp: Date.now(),
      question_index: currentQuestionIndex,
      char_count: pasted.length,
      // DO NOT log the pasted content itself — privacy
    })
  }
})
```

What is logged:
- Timestamp
- Character count of pasted text
- Which question

What is NOT logged:
- The pasted content itself — never store what was pasted

What it means: candidate pasted a significant block of text. Could be their own notes, a prepared answer, or ChatGPT output. Interesting when the paste is large AND the score is suspiciously high.

---

### 4. Idle Time Detection

```typescript
let lastActivity = Date.now()
let idleWarningFired = false

const IDLE_THRESHOLD_MS = 120_000  // 2 minutes

const activityEvents = ['keydown', 'mousemove', 'click', 'scroll']
activityEvents.forEach(event => {
  document.addEventListener(event, () => {
    lastActivity = Date.now()
    idleWarningFired = false
  })
})

setInterval(() => {
  const idle = Date.now() - lastActivity
  if (idle >= IDLE_THRESHOLD_MS && !idleWarningFired) {
    idleWarningFired = true
    logEvent({
      type: 'idle',
      timestamp: Date.now(),
      idle_duration_ms: idle,
      question_index: currentQuestionIndex,
    })
  }
}, 10_000)   // check every 10 seconds
```

Idle periods logged: timestamp start, duration, which question was active.

---

### 5. Time Per Question

This is not an event — it is calculated from timestamps:

```typescript
// When question is shown
const questionStartTime = Date.now()

// When answer is submitted
const timeSpentMs = Date.now() - questionStartTime

// Stored on the Answer record
answer.time_spent_ms = timeSpentMs
```

This is the most useful signal of all proctoring data. Cross-reference with score:
- Fast + high score = mastery
- Fast + low score = guessing or gave up
- Slow + high score = careful, thorough
- Slow + low score = struggling
- Very slow with paste event = probably looked it up

---

## Event Log Structure

All events are batched and sent to the server every 30 seconds AND on session submit (to avoid losing data if the tab closes):

```typescript
type BehaviorEvent = {
  session_id: string
  type: 'tab_switch' | 'focus_loss' | 'paste' | 'idle'
  timestamp: number          // unix ms
  question_index: number     // which question was active (0-indexed)
  metadata: {
    char_count?: number      // paste events only
    idle_duration_ms?: number // idle events only
  }
}
```

### Batched sync to server:
```typescript
// Every 30 seconds
const flushEvents = async () => {
  if (pendingEvents.length === 0) return
  const batch = [...pendingEvents]
  pendingEvents = []

  await fetch('/api/sessions/:id/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch }),
    keepalive: true   // survives tab close
  })
}

setInterval(flushEvents, 30_000)

// Also flush on page unload (tab close / navigate away)
window.addEventListener('beforeunload', () => flushEvents())
```

The `keepalive: true` flag ensures the request completes even if the page is closing.

---

## How Flags Appear in the Report

Proctoring flags are never shown as pass/fail. They are shown as context:

```
PROCTORING SUMMARY
─────────────────────────────────────────────────────────────
Tab switches:    6
  → At min 8 (Q1), min 14 (Q2), min 14 (Q2), min 22 (Q3), min 31 (Q4), min 37 (Q4)

Focus losses:    3

Paste events:    1
  → Q4 — Idempotency question — 340 characters at 6m 02s into question
  → Q4 score: 88%   (high score despite paste — probe verbally)

Idle periods:    0

CONTEXT NOTE
This candidate had 6 tab switches but maintained strong scores throughout.
The paste on Q4 is the most meaningful flag — a large paste followed by a high
score on a complex question warrants a verbal follow-up on that topic.
```

The context note is auto-generated by Claude as part of the report compilation step.

---

## What the Candidate Sees During the Assessment

- A discreet status bar: `[ Recording session | Tab switches: 0 ]`
- This updates in real time so the candidate is never surprised
- They can see their own tab switch count — this is intentional (transparency, not gotcha)
- No other proctoring UI — no "you switched tabs" warning popups, no interruption to their flow

---

## Proctoring Configuration (Interviewer Controls)

Interviewers can disable individual signals:

```typescript
type ProctoringConfig = {
  track_tab_switches: boolean    // default: true
  track_focus_loss: boolean      // default: true
  detect_paste: boolean          // default: true
  detect_idle: boolean           // default: true
  tab_switch_flag_threshold: number  // default: 3 — flag in report after N switches
}
```

If an interviewer disables all proctoring, the disclosure page still shows but says "This assessment is not monitored."

---

## Data Retention

- Behavior event logs are retained for 90 days after session submission
- After 90 days, raw event logs are deleted; only the summary counts are kept in the report
- Candidate answers are retained for 1 year unless the interviewer deletes the assessment
- No PII is stored in behavior logs — only session ID, timestamps, question index, and char counts