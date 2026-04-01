import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
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
