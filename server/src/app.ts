import express from 'express';
import cors from 'cors';
import { platformRoutes } from './routes/platforms.js';
import { discoveryRoutes } from './routes/discovery.js';
import { calculatorRoutes } from './routes/calculator.js';
import { exportRoutes } from './routes/export.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/platforms', platformRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/calculate', calculatorRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);
