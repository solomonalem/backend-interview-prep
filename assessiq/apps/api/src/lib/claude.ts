import Anthropic from '@anthropic-ai/sdk';

// Model for rubric scoring. Sonnet 4.6 is a real, active model that still accepts
// `temperature: 0` (required by the spec for deterministic scoring — Sonnet 5 /
// Opus 4.7+ reject temperature). Override via SCORING_MODEL if desired.
export const SCORING_MODEL = process.env.SCORING_MODEL ?? 'claude-sonnet-4-6';

// null when no API key is configured — the scoring service falls back to a
// deterministic dev stub so the pipeline is testable without a key.
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
