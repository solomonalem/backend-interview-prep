import type { StudyRating } from '@assessiq/types';

// Spaced-repetition intervals (docs/02): missed → tomorrow, partial → 2 days,
// got_it → 7 then 14, 30, 60, 90 days as the got-it streak grows.
const GOT_IT_INTERVALS = [7, 14, 30, 60, 90];

export function intervalDays(rating: StudyRating, reviewCount: number): number {
  if (rating === 'missed') return 1;
  if (rating === 'partial') return 2;
  const idx = Math.min(Math.max(reviewCount - 1, 0), GOT_IT_INTERVALS.length - 1);
  return GOT_IT_INTERVALS[idx] ?? 7;
}

export function nextReviewDate(rating: StudyRating, reviewCount: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + intervalDays(rating, reviewCount));
  return d;
}

// Map a self-rating to a coarse confidence score for weak-topic aggregation.
export function confidenceForRating(rating: StudyRating): number {
  if (rating === 'got_it') return 100;
  if (rating === 'partial') return 50;
  return 0;
}
