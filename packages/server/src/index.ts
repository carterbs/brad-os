import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_VERSION, createSuccessResponse } from '@brad-os/shared';
import { initializeDatabase } from './db/index.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, requestLogger } from './middleware/index.js';

const app: Express = express();
// Development: Server runs on PORT+1 (client runs on PORT, proxies /api to server)
// Production: Single server on PORT serving both static files and API
// Default: client=3000, server=3001. E2E tests: client=3100, server=3101
const isProduction = process.env['NODE_ENV'] === 'production';
const basePort = parseInt(process.env['PORT'] ?? '3000', 10);
const PORT = isProduction ? basePort : basePort + 1;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());

// Request logging
app.use(requestLogger);

// Initialize database
initializeDatabase();

// Production: serve static files (CSS, JS, images)
// __dirname resolves to packages/server/dist/, so go up to packages/ then into client/dist/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, '../../client/dist');
if (isProduction) {
  app.use(express.static(clientDistPath));
}

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

// Production: SPA catch-all (must be after API routes and root endpoint)
if (isProduction) {
  app.get('*', (_req: Request, res: Response): void => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Error handling (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, (): void => {
  console.log(`Server running on http://localhost:${String(PORT)}`);
});

export { app };
