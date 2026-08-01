# 04 — Scoring Engine

> This file explains how answer scoring works end-to-end: the rubric model, the Claude API integration, the async queue flow, and how scores are stored and displayed.

---

## The Rubric Model

Every answer is scored against **four weighted components**. The total is a percentage out of 100.

| Component | Weight | What It Measures |
|-----------|--------|-----------------|
| Core answer | 25% | Did the candidate cover the fundamental correct answer? |
| Senior signal | 35% | Did they name the tradeoff, the edge case, or the "when not to" judgment? |
| Trap avoidance | 25% | Did they avoid the common wrong answer interviewers expect juniors to give? |
| Evidence / example | 15% | Did they ground the answer in real work, a specific system, or a concrete scenario? |

**Senior signal is weighted highest (35%)** because it is the hardest thing to fake and the most predictive of on-the-job performance.

### Score calculation:
```
total_score = (core_pct * 0.25) + (senior_signal_pct * 0.35) + (trap_pct * 0.25) + (evidence_pct * 0.15)
```

Example:
```
core_pct:          82   → 82 * 0.25 = 20.5
senior_signal_pct: 91   → 91 * 0.35 = 31.9
trap_pct:          40   → 40 * 0.25 = 10.0
evidence_pct:      70   → 70 * 0.15 = 10.5
                          ──────────────────
total:                              72.9%
```

---

## Question Data Structure (the rubric source)

Each question in the database stores the rubric definition that Claude uses to grade answers:

```typescript
type Question = {
  id: string
  text: string                    // the question shown to candidate
  topic: string                   // e.g. "MongoDB"
  difficulty: 'junior' | 'mid' | 'senior' | 'staff'
  type: 'conceptual' | 'scenario' | 'rca' | 'design' | 'behavioral'
  domain_overlay: string | null   // e.g. "healthcare" — adds domain-specific traps

  // Rubric fields — used by Claude to score
  core_answer_guide: string       // what a correct answer must cover
  senior_signal_guide: string     // what a senior answer adds beyond correct
  trap_guide: string              // the specific wrong answer to watch for
  evidence_guide: string          // what a grounded, specific example looks like

  // Display fields — shown to job seeker after revealing answer
  core_answer_display: string     // readable version for study mode
  senior_signal_display: string   // readable version for study mode
  trap_display: string            // readable version for study mode
}
```

Note: `_guide` fields are used only by the scoring engine (never shown to candidates during assessment). `_display` fields are shown in study mode after the answer is revealed.

---

## Claude API Integration

### When scoring fires:
1. Candidate submits an answer (or timer expires → auto-submit)
2. API immediately returns `{ status: 'submitted', message: 'Your assessment has been submitted.' }`
3. A BullMQ job is enqueued: `score-answer` with `{ answerId, questionId, answerText }`
4. The queue worker picks up the job and calls Claude
5. Score is written to the database
6. When all answers in a session are scored: report is compiled and emailed to interviewer

### The Claude prompt (per answer):

```
System:
You are an expert technical interview rubric grader.
You will receive a question, its rubric definition, and a candidate's answer.
You must score the answer against four components and return ONLY a JSON object.
Do not include any explanation, preamble, or markdown. Return raw JSON only.

User:
QUESTION:
{question.text}

RUBRIC DEFINITIONS:

Core Answer (weight: 25%):
{question.core_answer_guide}

Senior Signal (weight: 35%):
{question.senior_signal_guide}

Trap to Avoid (weight: 25%):
{question.trap_guide}

Evidence / Example (weight: 15%):
{question.evidence_guide}

CANDIDATE'S ANSWER:
{answer.text}

Return this exact JSON structure:
{
  "core_pct": <0-100>,
  "core_reasoning": "<one sentence explaining the score>",
  "senior_signal_pct": <0-100>,
  "senior_signal_reasoning": "<one sentence>",
  "trap_pct": <0-100>,
  "trap_reasoning": "<one sentence>",
  "evidence_pct": <0-100>,
  "evidence_reasoning": "<one sentence>",
  "what_was_hit": ["<specific thing candidate got right>", ...],
  "what_was_missed": ["<specific thing candidate missed>", ...],
  "recommended_probe": "<one follow-up question for live interview based on gaps>"
}
```

### Claude API call configuration:
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1000,
  temperature: 0,          // deterministic scoring — same answer, same score
  messages: [
    { role: 'user', content: prompt }
  ]
})
```

`temperature: 0` is required. Scoring must be deterministic. Never use a higher temperature for scoring calls.

### Parsing the response:
```typescript
const content = response.content[0]
if (content.type !== 'text') throw new Error('Unexpected response type')

let parsed: ScoreResult
try {
  // Strip any accidental markdown fences
  const clean = content.text.replace(/```json|```/g, '').trim()
  parsed = JSON.parse(clean)
} catch (e) {
  // Log and retry once; if second attempt fails, mark answer as scoring_failed
  throw new ScoreParseError(content.text)
}
```

### Score storage:
```typescript
await db.score.create({
  data: {
    answer_id: answerId,
    core_pct: parsed.core_pct,
    core_reasoning: parsed.core_reasoning,
    senior_signal_pct: parsed.senior_signal_pct,
    senior_signal_reasoning: parsed.senior_signal_reasoning,
    trap_pct: parsed.trap_pct,
    trap_reasoning: parsed.trap_reasoning,
    evidence_pct: parsed.evidence_pct,
    evidence_reasoning: parsed.evidence_reasoning,
    what_was_hit: parsed.what_was_hit,
    what_was_missed: parsed.what_was_missed,
    recommended_probe: parsed.recommended_probe,
    total_pct: calculateTotal(parsed),
    scored_at: new Date(),
    model_used: 'claude-sonnet-4-6',
  }
})
```

---

## Async Queue Architecture

### Why async:
Scoring takes 2–8 seconds per answer. A 10-question assessment would take 20–80 seconds if synchronous. The candidate must not wait. They submit and immediately see a confirmation page.

### BullMQ setup:

```typescript
// Queue definition
const scoringQueue = new Queue('scoring', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  }
})

// Worker
const worker = new Worker('scoring', async (job) => {
  const { answerId } = job.data
  await scoreAnswer(answerId)
  await checkIfSessionComplete(answerId)  // if all answers scored, compile report
}, { connection: redisConnection, concurrency: 5 })
```

### Job flow:
```
Answer submitted
  → enqueue { answerId } to 'scoring' queue
  → return 202 to client immediately

Worker picks up job
  → fetch answer + question from DB
  → build Claude prompt
  → call Claude API
  → parse response
  → write Score record to DB
  → check: are all answers in this session now scored?
    → YES: compile report → send email to interviewer
    → NO: wait for remaining jobs
```

### Error handling:
- If Claude returns unparseable JSON: retry up to 3 times with exponential backoff
- If all 3 attempts fail: mark answer with `scoring_status: 'failed'`, flag in report as "Could not score — review manually"
- Never silently drop a scoring failure — always surface it in the report

---

## Practice Mode Scoring (Job Seeker)

Practice mode uses the same scoring engine but:
- Fires synchronously (single question, candidate is waiting for feedback)
- Shown to the candidate immediately after submit
- Includes the full `_display` content of the rubric so they can learn from it
- Does NOT go through BullMQ — direct Claude call on the API route, awaited

---

## Verdict Calculation

After all questions in a session are scored:

```typescript
function calculateVerdict(scores: Score[]): Verdict {
  const seniorSignalAvg = average(scores.map(s => s.senior_signal_pct))
  const overallAvg = average(scores.map(s => s.total_pct))

  if (seniorSignalAvg >= 70 && overallAvg >= 70) return 'Strong Senior'
  if (seniorSignalAvg >= 50 && overallAvg >= 55) return 'Approaching Senior'
  if (seniorSignalAvg >= 30 && overallAvg >= 40) return 'Mid-Level'
  return 'Junior'
}
```

Verdict is primarily driven by senior signal percentage, not overall score. A candidate can get a high overall score by covering core answers well but still land at "Mid-Level" if they never demonstrate senior-level judgment.

---

## Confidence vs Score Delta

```typescript
type ConfidenceDelta = {
  question_id: string
  confidence_rating: number    // 1–5 (candidate self-rated)
  total_pct: number            // 0–100 (actual score)
  delta: number                // confidence_normalized - score_normalized
  flag: 'overconfident' | 'underconfident' | 'well-calibrated'
}

function calculateDelta(confidence: number, score: number): ConfidenceDelta['flag'] {
  const confidence_normalized = (confidence / 5) * 100
  const gap = confidence_normalized - score
  if (gap > 25) return 'overconfident'   // said 5/5, scored below 50% → flag
  if (gap < -25) return 'underconfident'
  return 'well-calibrated'
}
```

Overconfidence on a specific topic is a signal worth surfacing — it means the candidate doesn't know what they don't know in that area.