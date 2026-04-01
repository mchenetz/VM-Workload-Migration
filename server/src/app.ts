import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { platformRoutes } from './routes/platforms.js';
import { discoveryRoutes } from './routes/discovery.js';
import { calculatorRoutes } from './routes/calculator.js';
import { exportRoutes } from './routes/export.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const pkg = require_('../../package.json') as { version: string; description?: string };

export const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/platforms', platformRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/calculate', calculatorRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/version', (_req, res) => {
  res.json({
    version: pkg.version,
    name: 'VM Workload Migration Time Estimator',
    description: 'Estimates VM migration times for OpenShift MTV/Forklift from VMware',
    repository: 'https://github.com/mchenetz/VM-Workload-Migration',
    license: 'MIT',
    builtWith: [
      { name: 'React', version: '19' },
      { name: 'Node.js', version: process.version },
      { name: 'Express', version: '4' },
      { name: 'TypeScript', version: '5' },
      { name: 'Tailwind CSS', version: '4' },
    ],
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });
});

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);
