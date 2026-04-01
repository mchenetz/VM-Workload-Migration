import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as platformController from '../controllers/platformController.js';
import { validate, connectSchema } from '../middleware/validation.js';

export const platformRoutes = Router();

platformRoutes.get(
  '/status',
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const platforms = platformController.getStatus();
      res.json({ success: true, data: { platforms } });
    } catch (error) {
      next(error);
    }
  },
);

platformRoutes.post(
  '/connect',
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, endpoint, credentials } = req.body;
      const connection = await platformController.connect(type, endpoint, credentials);
      res.json({ success: true, data: connection });
    } catch (error) {
      next(error);
    }
  },
);

platformRoutes.post(
  '/disconnect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.body;
      const connection = platformController.disconnect(type);
      res.json({ success: true, data: connection });
    } catch (error) {
      next(error);
    }
  },
);

platformRoutes.post(
  '/test',
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, endpoint, credentials } = req.body;
      const result = await platformController.testConnection(type, endpoint, credentials);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
