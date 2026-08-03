// Augment Express Request with the authenticated interviewer, set by authInterviewer.
import 'express';

declare global {
  namespace Express {
    interface Request {
      interviewer?: { id: string; email: string };
      candidate?: { sessionId: string };
    }
  }
}

export {};
