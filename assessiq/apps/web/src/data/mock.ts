// Mock data for screens whose backend isn't built yet (everything except auth +
// question bank). Shapes intentionally mirror docs/08-api-routes.md so swapping
// in real endpoints later is a drop-in change.

export type CandidateStatus = 'not_opened' | 'opened' | 'in_progress' | 'submitted' | 'expired';

export interface MockCandidate {
  id: string;
  name: string;
  assessment: string;
  status: CandidateStatus;
  overall_pct: number | null;
  verdict: string | null;
  submitted_at: string | null;
  flags: number;
}

export const candidates: MockCandidate[] = [
  { id: 'c1', name: 'Alex Chen', assessment: 'Senior Backend — Node', status: 'submitted', overall_pct: 82, verdict: 'Strong_Senior', submitted_at: '2h ago', flags: 0 },
  { id: 'c2', name: 'Sam Rivera', assessment: 'Senior Backend — Node', status: 'submitted', overall_pct: 64, verdict: 'Approaching_Senior', submitted_at: '5h ago', flags: 2 },
  { id: 'c3', name: 'Priya Patel', assessment: 'Platform — Microservices', status: 'in_progress', overall_pct: null, verdict: null, submitted_at: null, flags: 0 },
  { id: 'c4', name: 'Jordan Lee', assessment: 'Senior Backend — Node', status: 'submitted', overall_pct: 47, verdict: 'Mid_Level', submitted_at: '1d ago', flags: 5 },
  { id: 'c5', name: 'Morgan Diaz', assessment: 'Platform — Microservices', status: 'opened', overall_pct: null, verdict: null, submitted_at: null, flags: 0 },
  { id: 'c6', name: 'Taylor Kim', assessment: 'Healthcare — PHI', status: 'not_opened', overall_pct: null, verdict: null, submitted_at: null, flags: 0 },
];

export interface MockAssessment {
  id: string;
  title: string;
  question_count: number;
  timer_minutes: number | null;
  created_at: string;
  candidates: number;
  completed: number;
  avg_score: number | null;
}

export const assessments: MockAssessment[] = [
  { id: 'a1', title: 'Senior Backend — Node', question_count: 8, timer_minutes: 45, created_at: 'Jul 28', candidates: 4, completed: 3, avg_score: 64 },
  { id: 'a2', title: 'Platform — Microservices', question_count: 6, timer_minutes: 60, created_at: 'Jul 30', candidates: 2, completed: 0, avg_score: null },
  { id: 'a3', title: 'Healthcare — PHI & Compliance', question_count: 5, timer_minutes: 40, created_at: 'Aug 1', candidates: 1, completed: 0, avg_score: null },
];

// A full report for the Report screen (mirrors GET /reports/session/:id).
export const sampleReport = {
  session: { candidate_label: 'Alex Chen', started_at: 'Aug 1, 2:14 PM', submitted_at: 'Aug 1, 2:51 PM', time_used_ms: 37 * 60_000, auto_submitted: false },
  assessment: { title: 'Senior Backend — Node', timer_seconds: 45 * 60 },
  overall: { total_pct: 82, verdict: 'Strong_Senior', core_avg: 85, senior_signal_avg: 88, trap_avg: 74, evidence_avg: 76 },
  proctoring: { tab_switch_count: 1, focus_loss_count: 0, paste_count: 0, idle_count: 1, context_note: 'One brief tab switch during Q4 (12s) and one idle period. Behavior consistent with a focused candidate — no signals suggesting outside assistance.' },
  questions: [
    { position: 0, topic: 'Node.js', difficulty: 'mid', text: 'Explain the Node.js event loop and its phases.', total_pct: 88, core_pct: 90, senior_signal_pct: 92, trap_pct: 80, evidence_pct: 82, confidence: 4, confidence_flag: 'well_calibrated', hit: ['Named all event-loop phases', 'Distinguished microtask queue draining'], missed: ['Did not mention worker_threads for CPU work'], probe: 'Ask how they would offload a CPU-bound task without blocking the loop.' },
    { position: 1, topic: 'MongoDB', difficulty: 'senior', text: '50M-doc collection, slow filter+sort query. Fix it and prove the fix.', total_pct: 84, core_pct: 88, senior_signal_pct: 86, trap_pct: 78, evidence_pct: 80, confidence: 5, confidence_flag: 'well_calibrated', hit: ['Compound index in ESR order', 'Used explain() executionStats'], missed: ['Did not discuss index size / write amplification'], probe: 'Probe the tradeoff of adding the index on write-heavy workloads.' },
    { position: 2, topic: 'Security', difficulty: 'senior', text: 'A JWT is stolen — blast radius and mitigations.', total_pct: 72, core_pct: 78, senior_signal_pct: 82, trap_pct: 55, evidence_pct: 70, confidence: 5, confidence_flag: 'overconfident', hit: ['Short-lived access + refresh rotation', 'httpOnly cookie storage'], missed: ['Understated statelessness — claimed instant revocation'], probe: 'Push on how they would actually revoke a stateless JWT before expiry.' },
  ],
  pdf_url: null,
};

// ── Job-seeker (study) mock data ─────────────────────────────────────────────
export const studyStats = {
  streak_days: 7,
  due_today: 12,
  reviewed_this_week: 48,
  mastery_pct: 61,
};

export const weakTopics = [
  { topic: 'Security & JWT', confidence: 38, count: 5 },
  { topic: 'Microservices', confidence: 44, count: 6 },
  { topic: 'System Design', confidence: 52, count: 5 },
  { topic: 'MongoDB', confidence: 67, count: 8 },
];

export const topicProgress = [
  { topic: 'Node.js', mastered: 4, total: 5 },
  { topic: 'MongoDB', mastered: 5, total: 8 },
  { topic: 'REST & API', mastered: 3, total: 4 },
  { topic: 'Security', mastered: 2, total: 5 },
  { topic: 'Microservices', mastered: 2, total: 6 },
  { topic: 'System Design', mastered: 3, total: 5 },
];

export interface MockStory {
  id: string;
  title: string;
  type: 'bug_fix' | 'feature' | 'incident' | 'architecture';
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
}

export const stories: MockStory[] = [
  {
    id: 's1',
    title: 'Cut p99 latency 4s → 90ms on the orders API',
    type: 'incident',
    situation: 'Nightly p99 latency spiked to 4s with no deploy; on-call paged at 2am.',
    task: 'Own the RCA and restore service without guessing.',
    action: 'Correlated latency with a nightly analytics job saturating the DB connection pool; capped the job pool and added an alert.',
    result: 'p99 back to 90ms; recurrence eliminated; added a runbook.',
    tags: ['RCA', 'Databases', 'Performance'],
  },
  {
    id: 's2',
    title: 'Idempotency keys to stop double charges',
    type: 'bug_fix',
    situation: 'Queue redelivery occasionally double-charged customers.',
    task: 'Make POST /payments safe to retry.',
    action: 'Added client Idempotency-Key with a pending lock and cached response replay.',
    result: 'Zero duplicate charges across 1.2M subsequent payments.',
    tags: ['REST', 'Payments', 'Reliability'],
  },
];
