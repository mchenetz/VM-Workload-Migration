import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as calculatorController from '../controllers/calculatorController.js';
import { validate, manualCalcSchema } from '../middleware/validation.js';

export const calculatorRoutes = Router();

calculatorRoutes.post(
  '/manual',
  validate(manualCalcSchema),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = calculatorController.manualCalculate(req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

calculatorRoutes.post(
  '/auto',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = calculatorController.autoCalculate(req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
