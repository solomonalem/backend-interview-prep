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
