import type { StoryType as DbStoryType, StudyRating as DbStudyRating } from '@prisma/client';
import type {
  CreateStoryRequest,
  CreateStoryResponse,
  DecodeJdResponse,
  DecodeJdSource,
  Difficulty,
  JdWeight,
  PracticeResponse,
  QuestionType,
  RecordProgressResponse,
  StoryDTO,
  StudyDeckResponse,
  StudyRating,
  WeakTopic,
} from '@assessiq/types';
import { prisma } from '../lib/prisma.js';
import { anthropic, DECODE_MODEL, TAGGING_MODEL } from '../lib/claude.js';
import { AppError } from '../middleware/error.middleware.js';
import { confidenceForRating, nextReviewDate } from '../utils/spaced-repetition.js';
import { weightedTotal } from '../utils/score-calc.js';
import { scoreAnswerText } from './scoring.service.js';

// Small JSON helper for the cheap peripheral models (Haiku). Callers guard on
// `anthropic` and fall back to a heuristic if this throws.
async function callModelJSON<T>(model: string, system: string, user: string): Promise<T> {
  const res = await anthropic!.messages.create({
    model,
    max_tokens: 700,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') throw new Error('unexpected response type');
  return JSON.parse(block.text.replace(/```json|```/g, '').trim()) as T;
}

const DISPLAY_SELECT = {
  id: true,
  text: true,
  topic: true,
  difficulty: true,
  type: true,
  core_answer_display: true,
  senior_signal_display: true,
  trap_display: true,
} as const;

async function topicCounts(): Promise<Map<string, number>> {
  const rows = await prisma.question.groupBy({
    by: ['topic'],
    where: { is_active: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.topic, r._count._all]));
}

// Distinct local calendar days the user studied, counting the consecutive run
// ending today or yesterday. (Approximate — StudyProgress keeps only last_seen.)
function computeStreak(lastSeenDates: Date[]): number {
  const days = new Set(lastSeenDates.map((d) => d.toISOString().slice(0, 10)));
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  // Allow the run to start today or yesterday.
  const today = cursor.toISOString().slice(0, 10);
  const yesterday = new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (!days.has(today) && !days.has(yesterday)) return 0;
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ── GET /study/deck ──────────────────────────────────────────────────────────
export async function getDeck(userId: string): Promise<StudyDeckResponse> {
  const progresses = await prisma.studyProgress.findMany({ where: { user_id: userId } });
  const now = Date.now();
  const progressByQ = new Map(progresses.map((p) => [p.question_id, p]));
  const seenIds = progresses.map((p) => p.question_id);

  const dueIds = progresses.filter((p) => p.next_review.getTime() <= now).map((p) => p.question_id);
  const dueQuestions = dueIds.length
    ? await prisma.question.findMany({ where: { id: { in: dueIds }, is_active: true }, select: DISPLAY_SELECT })
    : [];

  const items: StudyDeckResponse['due_today'] = dueQuestions.map((q) => {
    const p = progressByQ.get(q.id);
    return {
      question: {
        id: q.id,
        text: q.text,
        topic: q.topic,
        difficulty: q.difficulty as Difficulty,
        type: q.type as QuestionType,
        core_answer_display: q.core_answer_display,
        senior_signal_display: q.senior_signal_display,
        trap_display: q.trap_display,
      },
      progress: p
        ? { rating: p.rating as StudyRating, next_review: p.next_review.toISOString(), review_count: p.review_count }
        : null,
    };
  });

  // Top up with unseen questions so a fresh account still has a deck.
  if (items.length < 10) {
    const fresh = await prisma.question.findMany({
      where: { is_active: true, id: { notIn: seenIds.length ? seenIds : ['__none__'] } },
      select: DISPLAY_SELECT,
      take: 10 - items.length,
      orderBy: { created_at: 'asc' },
    });
    for (const q of fresh) {
      items.push({
        question: {
          id: q.id,
          text: q.text,
          topic: q.topic,
          difficulty: q.difficulty as Difficulty,
          type: q.type as QuestionType,
          core_answer_display: q.core_answer_display,
          senior_signal_display: q.senior_signal_display,
          trap_display: q.trap_display,
        },
        progress: null,
      });
    }
  }

  // Weak topics: average confidence per topic across seen questions.
  let weak_topics: WeakTopic[] = [];
  if (seenIds.length) {
    const seenQs = await prisma.question.findMany({
      where: { id: { in: seenIds } },
      select: { id: true, topic: true },
    });
    const topicByQ = new Map(seenQs.map((q) => [q.id, q.topic]));
    const agg = new Map<string, { sum: number; n: number }>();
    for (const p of progresses) {
      const topic = topicByQ.get(p.question_id);
      if (!topic) continue;
      const a = agg.get(topic) ?? { sum: 0, n: 0 };
      a.sum += confidenceForRating(p.rating as StudyRating);
      a.n += 1;
      agg.set(topic, a);
    }
    weak_topics = [...agg.entries()]
      .map(([topic, a]) => ({ topic, avg_confidence: Math.round(a.sum / a.n), question_count: a.n }))
      .sort((x, y) => x.avg_confidence - y.avg_confidence);
  }

  return {
    due_today: items,
    weak_topics,
    streak_days: computeStreak(progresses.map((p) => p.last_seen)),
  };
}

// ── POST /study/progress ─────────────────────────────────────────────────────
export async function recordProgress(
  userId: string,
  questionId: string,
  rating: StudyRating,
): Promise<RecordProgressResponse> {
  const exists = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
  if (!exists) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');

  const existing = await prisma.studyProgress.findUnique({
    where: { user_id_question_id: { user_id: userId, question_id: questionId } },
  });
  const reviewCount = (existing?.review_count ?? 0) + 1;
  const next = nextReviewDate(rating, reviewCount);

  await prisma.studyProgress.upsert({
    where: { user_id_question_id: { user_id: userId, question_id: questionId } },
    create: {
      user_id: userId,
      question_id: questionId,
      rating: rating as DbStudyRating,
      review_count: 1,
      next_review: nextReviewDate(rating, 1),
      last_seen: new Date(),
    },
    update: {
      rating: rating as DbStudyRating,
      review_count: reviewCount,
      next_review: next,
      last_seen: new Date(),
    },
  });

  return { next_review: next.toISOString() };
}

// ── POST /study/practice (synchronous scoring) ───────────────────────────────
export async function practice(questionId: string, answerText: string): Promise<PracticeResponse> {
  const q = await prisma.question.findUnique({ where: { id: questionId } });
  if (!q) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found');

  const { result } = await scoreAnswerText(q, answerText, questionId);
  const total = weightedTotal(result.core_pct, result.senior_signal_pct, result.trap_pct, result.evidence_pct);

  return {
    score: {
      total_pct: total,
      core_pct: result.core_pct,
      core_reasoning: result.core_reasoning,
      senior_signal_pct: result.senior_signal_pct,
      senior_signal_reasoning: result.senior_signal_reasoning,
      trap_pct: result.trap_pct,
      trap_reasoning: result.trap_reasoning,
      evidence_pct: result.evidence_pct,
      evidence_reasoning: result.evidence_reasoning,
      what_was_hit: result.what_was_hit,
      what_was_missed: result.what_was_missed,
    },
    rubric: {
      core_answer_display: q.core_answer_display,
      senior_signal_display: q.senior_signal_display,
      trap_display: q.trap_display,
    },
  };
}

// ── POST /study/decode-jd ────────────────────────────────────────────────────
function detectDomain(jd: string): string | null {
  const lc = jd.toLowerCase();
  if (/health|pharma|clinical|hipaa|patient|hl7|fhir/.test(lc)) return 'healthcare';
  if (/fintech|payment|banking|pci|trading|ledger/.test(lc)) return 'fintech';
  return null;
}


function weightFor(topic: string, lc: string): JdWeight {
  const tokens = topic.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const hit = tokens.some((t) => lc.includes(t));
  // A topic the JD never mentions is 'Low', not 'Differentiator'. This keeps
  // the two engines on the same scale so `matched` means the same thing in
  // both — previously the heuristic rated every unmatched topic above Low and
  // could never report a no-match.
  return hit ? 'Critical' : 'Low';
}

const WEIGHT_ORDER: Record<JdWeight, number> = { Critical: 0, High: 1, Differentiator: 2, Low: 3 };

type DecodedTopics = { topic: string; weight: JdWeight; question_count: number }[];

// A decode "matched" only if something rose above 'Low'. When nothing did, the
// JD does not overlap the bank, and returning the full all-'Low' table reads as
// a broken result — so drop it and let the caller say so plainly.
function finalizeDecode(
  base: { role_title: string; domain: string | null },
  topics: DecodedTopics,
  source: DecodeJdSource,
): DecodeJdResponse {
  const matched = topics.some((t) => t.weight !== 'Low');
  return { ...base, matched, source, topics: matched ? topics : [] };
}

function decodeJdHeuristic(jdText: string, counts: Map<string, number>): DecodeJdResponse {
  const lc = jdText.toLowerCase();
  const topics = [...counts.entries()]
    .map(([topic, question_count]) => ({ topic, weight: weightFor(topic, lc), question_count }))
    .sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight] || b.question_count - a.question_count);
  const firstLine = jdText.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return finalizeDecode(
    {
      role_title: firstLine ? firstLine.slice(0, 80) : 'Software Engineer',
      domain: detectDomain(jdText),
    },
    topics,
    'heuristic',
  );
}

async function decodeJdClaude(jdText: string, counts: Map<string, number>): Promise<DecodeJdResponse> {
  const known = [...counts.keys()];
  const system =
    'You screen job descriptions for a SOFTWARE ENGINEERING interview question bank. Return ONLY a JSON object, no prose, no markdown.';
  const user = `Job description:
${jdText}

STEP 1 — Is this a software/technology engineering role?
Software roles include: backend, frontend, full-stack, mobile, data, platform,
infrastructure, SRE/DevOps, ML/AI engineering, security engineering, QA
automation, and engineering management of those.
NOT software roles: civil, structural, mechanical, electrical, chemical,
industrial, environmental, aerospace and biomedical engineering; construction;
architecture (buildings); and every non-engineering field (nursing, teaching,
marketing, sales, finance, HR, legal, operations).

Judge the ROLE, not the vocabulary. Other disciplines use the same words
software does — "engineer", "design", "development", "system", "architecture",
"analysis", "testing", "platform", "infrastructure". A civil engineer doing
"site design", "land development" and "stormwater system design" is NOT a
software role.

If it is NOT a software role, return exactly this and stop:
{"is_software_role": false, "role_title": "<short role title>", "domain": null, "topics": []}

STEP 2 — Only if it IS a software role.
Known topics (use only these): ${JSON.stringify(known)}

Include a topic ONLY if the role genuinely requires it as a software
competency. Match on meaning, never on a shared word:
- "site design" / "land development" → NOT "System Design"
- "drainage analysis" / "root cause of erosion" → NOT "RCA"
- "structural engineering" → NOT any software topic
Omit any topic you are unsure about. Returning fewer, correct topics is better
than padding the list.

Return exactly:
{"is_software_role": true, "role_title": "<short role title>", "domain": "healthcare"|"fintech"|"general", "topics": [{"topic": "<one known topic>", "weight": "Critical"|"High"|"Differentiator"|"Low"}]}
Critical = core to the role, High = important, Differentiator = nice-to-have edge, Low = barely mentioned.`;

  const parsed = await callModelJSON<{
    is_software_role?: boolean;
    role_title?: string;
    domain?: string | null;
    topics?: { topic: string; weight: JdWeight }[];
  }>(DECODE_MODEL, system, user);

  // Domain gate. Only an explicit `false` blocks: if the model omits the field
  // we fall through to topic matching, because wrongly telling a real backend
  // role "no match" is a worse failure than the noise we are removing.
  if (parsed.is_software_role === false) {
    return finalizeDecode(
      { role_title: (parsed.role_title || 'Unknown role').slice(0, 80), domain: null },
      [],
      'ai',
    );
  }

  const byTopic = new Map<string, JdWeight>();
  for (const t of parsed.topics ?? []) {
    if (counts.has(t.topic) && t.weight in WEIGHT_ORDER) byTopic.set(t.topic, t.weight);
  }
  // Complete the table: any known topic Claude omitted is 'Low'.
  const topics = [...counts.entries()]
    .map(([topic, question_count]) => ({ topic, weight: byTopic.get(topic) ?? 'Low', question_count }))
    .sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight] || b.question_count - a.question_count);

  const domain = !parsed.domain || parsed.domain === 'general' ? null : parsed.domain;
  return finalizeDecode(
    { role_title: (parsed.role_title || 'Software Engineer').slice(0, 80), domain },
    topics,
    'ai',
  );
}

// Connection blips and rate limits are worth one retry; a 400 or a malformed
// JSON body will fail identically the second time, so those fall through.
function isTransientError(err: unknown): boolean {
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };
  if (e?.name === 'APIConnectionError' || e?.name === 'APIConnectionTimeoutError') return true;
  const code = e?.code ?? e?.cause?.code;
  if (code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  return typeof e?.status === 'number' && (e.status === 429 || e.status >= 500);
}

const RETRY_DELAY_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function decodeJd(jdText: string): Promise<DecodeJdResponse> {
  const counts = await topicCounts();
  if (anthropic) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await decodeJdClaude(jdText, counts);
      } catch (err) {
        const retrying = attempt === 1 && isTransientError(err);
        console.error(
          `[decode-jd] Claude call failed (attempt ${attempt}/2)` +
            (retrying ? ', retrying' : ', falling back to heuristic'),
          err,
        );
        if (!retrying) break;
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return decodeJdHeuristic(jdText, counts);
}

// ── Stories ──────────────────────────────────────────────────────────────────
function toStoryDTO(s: {
  id: string;
  title: string;
  type: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}): StoryDTO {
  return {
    id: s.id,
    title: s.title,
    type: s.type as StoryDTO['type'],
    situation: s.situation,
    task: s.task,
    action: s.action,
    result: s.result,
    tags: s.tags,
    created_at: s.created_at.toISOString(),
    updated_at: s.updated_at.toISOString(),
  };
}

function suggestTagsHeuristic(text: string, counts: Map<string, number>): string[] {
  const lc = text.toLowerCase();
  const tags = [...counts.keys()].filter((topic) =>
    topic
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
      .some((t) => lc.includes(t)),
  );
  for (const [kw, tag] of [
    ['perform', 'Performance'],
    ['debug', 'Debugging'],
    ['incident', 'RCA'],
    ['scale', 'Scalability'],
  ] as const) {
    if (lc.includes(kw) && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 5);
}

async function suggestTagsClaude(text: string, counts: Map<string, number>): Promise<string[]> {
  const known = [...counts.keys()];
  const system =
    'You tag an engineering STAR story with the topics it maps to, for interview prep. Return ONLY a JSON array of strings.';
  const user = `Known topics (prefer these): ${JSON.stringify(known)}

Story:
${text}

Return a JSON array of up to 5 short, relevant tags. Prefer the known topics; you may add 1–2 concise skill tags (e.g. "Performance", "RCA") when clearly warranted.`;
  const arr = await callModelJSON<unknown>(TAGGING_MODEL, system, user);
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => String(t)).filter((t) => t.length > 0).slice(0, 5);
}

async function suggestTags(text: string): Promise<string[]> {
  const counts = await topicCounts();
  if (anthropic) {
    try {
      const tags = await suggestTagsClaude(text, counts);
      if (tags.length) return tags;
    } catch (err) {
      console.error('[tags] Claude call failed, falling back to heuristic:', err);
    }
  }
  return suggestTagsHeuristic(text, counts);
}

export async function listStories(userId: string): Promise<StoryDTO[]> {
  const rows = await prisma.story.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } });
  return rows.map(toStoryDTO);
}

export async function createStory(userId: string, input: CreateStoryRequest): Promise<CreateStoryResponse> {
  const suggested = await suggestTags(
    [input.title, input.situation, input.task, input.action, input.result].join(' '),
  );
  const story = await prisma.story.create({
    data: {
      user_id: userId,
      title: input.title,
      type: input.type as DbStoryType,
      situation: input.situation,
      task: input.task,
      action: input.action,
      result: input.result,
      tags: suggested,
    },
  });
  return { ...toStoryDTO(story), suggested_tags: suggested };
}

export async function updateStory(
  userId: string,
  id: string,
  patch: Partial<CreateStoryRequest> & { tags?: string[] },
): Promise<StoryDTO> {
  const existing = await prisma.story.findFirst({ where: { id, user_id: userId }, select: { id: true } });
  if (!existing) throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  const story = await prisma.story.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.type !== undefined ? { type: patch.type as DbStoryType } : {}),
      ...(patch.situation !== undefined ? { situation: patch.situation } : {}),
      ...(patch.task !== undefined ? { task: patch.task } : {}),
      ...(patch.action !== undefined ? { action: patch.action } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    },
  });
  return toStoryDTO(story);
}

export async function deleteStory(userId: string, id: string): Promise<void> {
  const existing = await prisma.story.findFirst({ where: { id, user_id: userId }, select: { id: true } });
  if (!existing) throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  await prisma.story.delete({ where: { id } });
}
