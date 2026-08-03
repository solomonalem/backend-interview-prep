import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { questionsRouter } from './routes/questions.js';
import { assessmentsRouter } from './routes/assessments.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Express app factory (exported for testing). Resource routers mount under /api/v1.
export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Infra health check (used by docker/deploy probes and local smoke tests).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'assessiq-api' });
  });

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/questions', questionsRouter);
  api.use('/assessments', assessmentsRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
