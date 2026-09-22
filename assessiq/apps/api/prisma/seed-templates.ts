import { PrismaClient, type Difficulty } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Built-in assessment templates.
 *
 * Composed from what the bank ACTUALLY CONTAINS, not from a list of roles we
 * wish we could assess. The same rule the role presets follow: offering
 * "SRE / DevOps — Screen" against a bank holding one Terraform question would
 * produce a two-question screen and a manager who stops trusting the feature.
 *
 * Each spec names topics in priority order and a difficulty preference; the
 * seeder fills up to `count` from vetted, active questions and SKIPS a template
 * it cannot fill at least two thirds of. Re-runnable: templates are matched by
 * title and their question list is refreshed, so seeding after the bank grows
 * improves them.
 */

interface TemplateSpec {
  title: string;
  description: string;
  /** Topic prefixes, in priority order. Matched case-insensitively. */
  topics: string[];
  /** Preferred difficulties, in order. Anything vetted is fair game after. */
  difficulties: Difficulty[];
  count: number;
  timer_minutes: number;
  probes_mode: 'off' | 'flagged_only' | 'all';
}

const SPECS: TemplateSpec[] = [
  {
    title: 'Backend Engineer — Screen',
    description:
      'A first-round screen for a general backend role: runtime fundamentals, data access, APIs and a security question.',
    topics: ['Node.js', 'MongoDB', 'Databases', 'REST', 'Security', 'System Design'],
    difficulties: ['mid', 'senior', 'junior'],
    count: 5,
    timer_minutes: 35,
    probes_mode: 'flagged_only',
  },
  {
    title: 'Senior Backend — Deep Dive',
    description:
      'For candidates who cleared a screen: concurrency, distributed state, caching and a root-cause question.',
    topics: [
      'Concurrency',
      'Distributed Transactions',
      'Caching',
      'Cache Invalidation',
      'System Design',
      'RCA',
      'Data Integrity',
    ],
    difficulties: ['senior', 'staff'],
    count: 6,
    timer_minutes: 50,
    probes_mode: 'all',
  },
  {
    title: 'API & Integrations — Screen',
    description:
      'For a role that lives at the boundary: REST, GraphQL, gRPC and what happens when a dependency misbehaves.',
    topics: ['REST', 'GraphQL', 'gRPC', 'API resilience', 'API Gateway'],
    difficulties: ['senior', 'mid'],
    count: 5,
    timer_minutes: 35,
    probes_mode: 'flagged_only',
  },
  {
    title: 'Auth & Security — Screen',
    description:
      'Token handling, session design and the failure modes that turn into incidents.',
    topics: ['JWT', 'OAuth', 'Security'],
    difficulties: ['senior', 'mid'],
    count: 5,
    timer_minutes: 35,
    probes_mode: 'all',
  },
  {
    title: 'Data & Messaging — Deep Dive',
    description:
      'Event pipelines and the state behind them: Kafka, Redis, document stores and transactional boundaries.',
    topics: ['Kafka', 'Redis', 'MongoDB', 'Distributed Transactions', 'Cache Invalidation'],
    difficulties: ['senior', 'staff'],
    count: 6,
    timer_minutes: 45,
    probes_mode: 'flagged_only',
  },
];

/** Vetted and active only — a built-in must never hand anyone a draft. */
async function pickQuestions(spec: TemplateSpec): Promise<string[]> {
  const pool = await prisma.question.findMany({
    where: { status: 'vetted', is_active: true },
    select: { id: true, topic: true, difficulty: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });

  const matchesTopic = (topic: string, prefix: string): boolean =>
    topic.toLowerCase().includes(prefix.toLowerCase());

  const chosen: string[] = [];
  const taken = new Set<string>();

  // Topic order first, then difficulty preference: a screen that opens on its
  // headline topic reads as designed rather than assembled.
  for (const prefix of spec.topics) {
    if (chosen.length >= spec.count) break;
    for (const difficulty of spec.difficulties) {
      const hit = pool.find(
        (q) => !taken.has(q.id) && matchesTopic(q.topic, prefix) && q.difficulty === difficulty,
      );
      if (hit) {
        chosen.push(hit.id);
        taken.add(hit.id);
        break;
      }
    }
  }

  // Top up from the same topics at any difficulty before giving up.
  for (const prefix of spec.topics) {
    if (chosen.length >= spec.count) break;
    const hit = pool.find((q) => !taken.has(q.id) && matchesTopic(q.topic, prefix));
    if (hit) {
      chosen.push(hit.id);
      taken.add(hit.id);
    }
  }

  return chosen.slice(0, spec.count);
}

export async function seedBuiltInTemplates(): Promise<void> {
  console.log('Seeding built-in assessment templates…');
  for (const spec of SPECS) {
    const question_ids = await pickQuestions(spec);
    // Two thirds is the line between "a slightly short screen" and "a template
    // that misrepresents itself". Skipped, not half-built.
    if (question_ids.length < Math.ceil((spec.count * 2) / 3)) {
      console.log(
        `  ! skip "${spec.title}" — only ${question_ids.length}/${spec.count} vetted questions available`,
      );
      continue;
    }

    const existing = await prisma.assessmentTemplate.findFirst({
      where: { owner_id: null, title: spec.title },
      select: { id: true },
    });

    const data = {
      title: spec.title,
      description: spec.description,
      question_ids,
      timer_minutes: spec.timer_minutes,
      probes_mode: spec.probes_mode,
      proctoring_config: {
        track_tab_switches: true,
        track_focus_loss: true,
        detect_paste: true,
        detect_idle: true,
        tab_switch_flag_threshold: 3,
      },
    };

    if (existing) {
      await prisma.assessmentTemplate.update({ where: { id: existing.id }, data });
      console.log(`  = refreshed "${spec.title}" (${question_ids.length} questions)`);
    } else {
      await prisma.assessmentTemplate.create({ data: { ...data, owner_id: null } });
      console.log(`  + "${spec.title}" (${question_ids.length} questions · ${spec.timer_minutes}m)`);
    }
  }
}

// Runnable on its own (`tsx prisma/seed-templates.ts`) as well as from seed.ts.
if (process.argv[1]?.endsWith('seed-templates.ts')) {
  seedBuiltInTemplates()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
