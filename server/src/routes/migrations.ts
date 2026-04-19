import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { MigrationListFilters, MigrationStatus } from '@vm-migration/shared';
import * as ctrl from '../controllers/migrationController.js';

export const migrationRoutes = Router();

const statusEnum = z.enum([
  'pending',
  'in_progress',
  'migrated',
  'failed',
  'decommissioned',
]);

function parseFilters(req: Request): MigrationListFilters {
  const { status, namespace, search, from, to } = req.query;
  const filters: MigrationListFilters = {};
  if (typeof status === 'string' && status.length > 0) {
    const list = status.split(',').filter(Boolean) as MigrationStatus[];
    filters.status = list.length === 1 ? list[0] : list;
  }
  if (typeof namespace === 'string') filters.namespace = namespace;
  if (typeof search === 'string') filters.search = search;
  if (typeof from === 'string') filters.from = from;
  if (typeof to === 'string') filters.to = to;
  return filters;
}

migrationRoutes.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = ctrl.listMigrations(parseFilters(req));
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

migrationRoutes.get('/report', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: ctrl.buildReport() });
  } catch (err) {
    next(err);
  }
});

migrationRoutes.get('/export.csv', (req: Request, res: Response, next: NextFunction) => {
  try {
    const csv = ctrl.exportCsv(parseFilters(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="migrations-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

migrationRoutes.post('/reconcile', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ctrl.reconcileNow();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

migrationRoutes.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'Invalid id' });
      return;
    }
    const found = ctrl.getMigration(id);
    if (!found) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: found });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  status: statusEnum,
  reason: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
});

migrationRoutes.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'Invalid id' });
      return;
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid body', details: parsed.error.issues });
      return;
    }
    const updated = ctrl.updateMigrationStatus(
      id,
      parsed.data.status,
      parsed.data.reason,
      parsed.data.notes,
    );
    if (!updated) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
