/**
 * Roles AssessIQ can actually assess today, each mapped to the topics we
 * expect that role to be tested on.
 *
 * SINGLE SOURCE OF TRUTH — add a role here as the question bank grows.
 *
 * Two rules, both there to avoid promising more than the bank can deliver:
 *  1. Only list a role we have questions for. Offering "Frontend Engineer"
 *     with an empty frontend bank recreates the "looks broken" empty-results
 *     problem this list exists to prevent.
 *  2. `topics` must use the exact topic strings stored on Question.topic —
 *     they are pre-filled into the technology chips and matched against the
 *     bank. Callers filter this list against the topics actually present, so
 *     a role whose topics all disappear stops being offered automatically.
 */
export interface RolePreset {
  /** Shown in the dropdown. */
  label: string;
  /** Bank topics pre-filled as technology chips when this role is picked. */
  topics: string[];
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    label: 'Backend Engineer',
    topics: ['Node.js', 'MongoDB', 'REST', 'Databases', 'Security'],
  },
  {
    label: 'Senior Backend / Platform Engineer',
    topics: ['Node.js', 'Microservices', 'System Design', 'Databases', 'RCA'],
  },
  {
    label: 'API / Integrations Engineer',
    topics: ['REST', 'Microservices', 'Security', 'Node.js'],
  },
  {
    label: 'Database / Data Engineer',
    topics: ['Databases', 'MongoDB', 'System Design'],
  },
  {
    label: 'Site Reliability / DevOps Engineer',
    topics: ['Microservices', 'System Design', 'RCA', 'Security'],
  },
  {
    label: 'Healthcare Software Engineer',
    topics: ['Healthcare', 'Security', 'Databases', 'REST'],
  },
];

/**
 * Drop any preset the bank cannot serve. A preset survives if at least one of
 * its topics exists in the bank, so the dropdown can never offer a role that
 * would return nothing.
 */
export function supportedRolePresets(bankTopics: string[]): RolePreset[] {
  const available = new Set(bankTopics.map((t) => t.toLowerCase()));
  return ROLE_PRESETS.filter((r) => r.topics.some((t) => available.has(t.toLowerCase())));
}
