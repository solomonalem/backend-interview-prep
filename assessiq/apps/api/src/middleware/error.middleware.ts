import type { NextFunction, Request, Response } from 'express';
import { logErr } from '../lib/safe-log.js';

// Typed application error. Carries the HTTP status and the machine `code`
// that the API contract (docs/08) promises alongside the message.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    /** Optional structured payload merged into the response body — e.g. the
     *  prior completion behind a DUPLICATE_CANDIDATE 409. */
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Wraps an async route handler so thrown errors reach the error middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

// Global error handler — always returns { error, code }.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, ...(err.details ?? {}) });
    return;
  }
  // Never print the raw error: a Prisma failure carries the row it could not
  // write, and a finding row carries an excerpt of the customer's source.
  logErr('api', 'unhandled', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}
