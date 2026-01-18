import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { APP_VERSION, createSuccessResponse } from '@lifting/shared';
import { initializeDatabase } from './db/index.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, requestLogger } from './middleware/index.js';

const app: Express = express();
// Server runs on PORT+1 (client runs on PORT, proxies /api to server)
// Default: client=3000, server=3001. E2E tests: client=3100, server=3101
const basePort = parseInt(process.env['PORT'] ?? '3000', 10);
const PORT = basePort + 1;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());

// Request logging
app.use(requestLogger);

// Initialize database
initializeDatabase();

// API routes
app.use('/api', apiRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response): void => {
  res.json(
    createSuccessResponse({
      message: 'Lifting API',
      version: APP_VERSION,
    })
  );
});

// Error handling (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, (): void => {
  console.log(`Server running on http://localhost:${String(PORT)}`);
});

export { app };
