import type { NextFunction, Request, Response } from 'express';
import { redisConnection } from '../lib/redis.js';
import { logErr } from '../lib/safe-log.js';

/**
 * Per-owner rate limiting for the endpoints that cost real money (design §9,
 * Slice 4).
 *
 * Scoped to the authenticated interviewer rather than an IP: the thing worth
 * bounding is how much scanning and generation one account can trigger, and an
 * IP is neither stable nor the unit that pays.
 *
 * A fixed window in Redis, not a sliding log. The point here is a ceiling on
 * spend, and a fixed window states that ceiling in terms a person can act on
 * ("10 scans an hour"); the extra precision of a sliding window buys nothing
 * against an accidental double-click or an over-eager script.
 */
export interface RateLimitOptions {
  /** Distinguishes counters, e.g. 'scan'. */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export function rateLimit({ bucket, limit, windowSeconds }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ownerId = req.interviewer?.id;
    // Unauthenticated requests never reach here — authInterviewer runs first —
    // but if the order is ever changed, failing open on the limiter is better
    // than failing open on auth.
    if (!ownerId) {
      next();
      return;
    }

    const key = `rl:${bucket}:${ownerId}`;
    try {
      const count = await redisConnection.incr(key);
      if (count === 1) await redisConnection.expire(key, windowSeconds);

      const ttl = count > limit ? await redisConnection.ttl(key) : windowSeconds;
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

      if (count > limit) {
        const retry = Math.max(1, ttl);
        res.setHeader('Retry-After', String(retry));
        res.status(429).json({
          error: `Rate limit reached — ${limit} per ${unit(windowSeconds)}. Try again in ${describe(retry)}.`,
          code: 'RATE_LIMITED',
          retry_after_seconds: retry,
        });
        return;
      }
      next();
    } catch (err) {
      // Redis being down must not take the product down. The limiter is a
      // spend guard, not an authorisation control — failing open is the right
      // trade, but it is loud so it cannot go unnoticed.
      logErr('rate-limit', `${bucket} check failed, allowing request`, err);
      next();
    }
  };
}

/** Bare unit for "N per ___" — "10 per hour", not "10 per an hour". */
function unit(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.round(seconds / 3600);
    return h === 1 ? 'hour' : `${h} hours`;
  }
  const m = Math.round(seconds / 60);
  return m === 1 ? 'minute' : `${m} minutes`;
}

function describe(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.round(seconds / 3600);
    return h === 1 ? 'an hour' : `${h} hours`;
  }
  if (seconds >= 60) {
    const m = Math.round(seconds / 60);
    return m === 1 ? 'a minute' : `${m} minutes`;
  }
  return `${seconds} seconds`;
}
