import Anthropic from '@anthropic-ai/sdk';

// Model for rubric scoring — the product's core. Sonnet 4.6 is a real, active
// model that still accepts `temperature: 0` (required for deterministic scoring —
// Sonnet 5 / Opus 4.7+ reject temperature). Override via SCORING_MODEL.
export const SCORING_MODEL = process.env.SCORING_MODEL ?? 'claude-sonnet-4-6';

// Cheaper Haiku 4.5 for low-stakes peripheral tasks (JD decode, story tagging).
// Same Anthropic key + SDK. Haiku 4.5 also accepts `temperature`.
export const DECODE_MODEL = process.env.DECODE_MODEL ?? 'claude-haiku-4-5';
export const TAGGING_MODEL = process.env.TAGGING_MODEL ?? 'claude-haiku-4-5';

// null when no API key is configured — the scoring service falls back to a
// deterministic dev stub so the pipeline is testable without a key.
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
