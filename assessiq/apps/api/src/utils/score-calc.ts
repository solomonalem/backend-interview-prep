import type { ProbeDeltaFlag } from '@assessiq/types';
import type { ConfidenceFlag, Verdict } from '@prisma/client';

// Weighted total per docs/04: core 25% · senior 35% · trap 25% · evidence 15%.
export function weightedTotal(
  core: number,
  senior: number,
  trap: number,
  evidence: number,
): number {
  return Math.round(core * 0.25 + senior * 0.35 + trap * 0.25 + evidence * 0.15);
}

// Verdict is driven primarily by the senior-signal average (docs/04).
export function verdictFor(seniorAvg: number, overallAvg: number): Verdict {
  if (seniorAvg >= 70 && overallAvg >= 70) return 'Strong_Senior';
  if (seniorAvg >= 50 && overallAvg >= 55) return 'Approaching_Senior';
  if (seniorAvg >= 30 && overallAvg >= 40) return 'Mid_Level';
  return 'Junior';
}

// Confidence vs. actual score calibration (docs/04). null if no confidence rating.
export function confidenceFlag(
  confidence: number | null,
  total: number,
): ConfidenceFlag | null {
  if (confidence == null) return null;
  const gap = (confidence / 5) * 100 - total;
  if (gap > 25) return 'overconfident';
  if (gap < -25) return 'underconfident';
  return 'well_calibrated';
}

// ── Follow-up probes ─────────────────────────────────────────────────────────

/**
 * A defense is scored on core and senior signal only — trap and evidence do not
 * apply to 90 seconds of defending something you already wrote.
 *
 * The two are re-weighted against each other rather than re-invented: 25 and 35
 * out of the 60 they share, so senior signal stays the dominant term exactly as
 * it is in a full score. Scoring a defense on a scale that ranked its parts
 * differently from the answer would make the delta between them meaningless.
 */
export function defenseTotal(core: number, senior: number): number {
  return Math.round((core * 25 + senior * 35) / 60);
}

/**
 * How the gap between an answer and its defense reads.
 *
 * Bands from docs/BLUEPRINT_POST_EPIC.md §B.5. A negative delta — a defense
 * that scored higher than the answer — is `defended`: someone who improves
 * under a 90-second clock has demonstrated the thing this measures.
 */
export function probeDeltaFlag(delta: number): ProbeDeltaFlag {
  if (delta <= 20) return 'defended';
  if (delta <= 40) return 'partially_defended';
  return 'not_defended';
}
