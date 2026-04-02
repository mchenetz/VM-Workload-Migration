import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as discoveryController from '../controllers/discoveryController.js';

export const discoveryRoutes = Router();

discoveryRoutes.get(
  '/vmware/vms',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await discoveryController.discoverVMwareVMs();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

discoveryRoutes.get(
  '/openshift/cluster',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await discoveryController.discoverOpenShift();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

discoveryRoutes.get(
  '/flasharray/volumes',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await discoveryController.discoverFlashArray();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

const importVMSchema = z.object({
  vms: z.array(z.object({
    id: z.string(),
    name: z.string(),
    guestOS: z.string(),
    powerState: z.enum(['poweredOn', 'poweredOff', 'suspended']),
    vCPUs: z.number(),
    memoryGB: z.number(),
    disks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      capacityGB: z.number(),
      thinProvisioned: z.boolean(),
      datastore: z.string(),
    })),
    totalDiskSizeGB: z.number(),
    datastoreName: z.string(),
    resourcePool: z.string(),
    network: z.string(),
  })),
});

discoveryRoutes.post(
  '/vmware/import',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = importVMSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ success: false, error: 'Invalid VM data', details: result.error.issues });
        return;
      }
      discoveryController.importVMs(result.data.vms);
      res.json({ success: true, data: { imported: result.data.vms.length } });
    } catch (error) {
      next(error);
    }
  },
);

discoveryRoutes.get(
  '/compatibility',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = discoveryController.getCompatibility();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
