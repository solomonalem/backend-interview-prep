import Anthropic from '@anthropic-ai/sdk';

// Model for rubric scoring — the product's core. Sonnet 4.6 is a real, active
// model that still accepts `temperature: 0` (required for deterministic scoring —
// Sonnet 5 / Opus 4.7+ reject temperature). Override via SCORING_MODEL.
export const SCORING_MODEL = process.env.SCORING_MODEL ?? 'claude-sonnet-4-6';

// Cheaper Haiku 4.5 for low-stakes peripheral tasks (JD decode, story tagging).
// Same Anthropic key + SDK. Haiku 4.5 also accepts `temperature`.
export const DECODE_MODEL = process.env.DECODE_MODEL ?? 'claude-haiku-4-5';
export const TAGGING_MODEL = process.env.TAGGING_MODEL ?? 'claude-haiku-4-5';

// Writing a question AND a four-part scoring rubric calibrated to a seniority
// level is a judgement task, not a tagging one — Haiku is too light for it.
// Sonnet 4.6 also still accepts `temperature`, which generation needs above 0
// for variety (the rubric is kept precise by the prompt, not by the sampler).
export const GENERATION_MODEL = process.env.GENERATION_MODEL ?? 'claude-sonnet-4-6';

// Repo scanning reads a lot of code and concludes very little per file, so the
// per-batch pass runs on Haiku (design §5.4). The final synthesis — turning
// dozens of flat observations into a handful of findings worth interviewing on
// — is a judgement task and gets Sonnet.
//
// §9 names only ANALYSIS_MODEL. SYNTHESIS_MODEL is an addition, because the
// design body asks for two different models here and one variable cannot
// express that.
export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL ?? 'claude-haiku-4-5';
export const SYNTHESIS_MODEL = process.env.SYNTHESIS_MODEL ?? 'claude-sonnet-4-6';

// null when no API key is configured — the scoring service falls back to a
// deterministic dev stub so the pipeline is testable without a key.
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
