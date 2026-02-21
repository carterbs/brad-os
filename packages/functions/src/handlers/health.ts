import express from 'express';
import cors from 'cors';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';

// Health check doesn't need express.json() or App Check
const app = express();
app.use(cors({ origin: true }));
app.use(stripPathPrefix('health'));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: 'cloud-functions',
    },
  });
});

export const healthApp = app;
