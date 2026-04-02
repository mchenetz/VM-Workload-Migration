import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as scheduleController from '../controllers/scheduleController.js';
import { generateSchedulePDF } from '../controllers/exportController.js';
import { validate, scheduleGenerateSchema, schedulePdfSchema } from '../middleware/validation.js';

export const scheduleRoutes = Router();

scheduleRoutes.post(
  '/generate',
  validate(scheduleGenerateSchema),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { params, results } = req.body;
      const schedule = scheduleController.generateSchedule(params, results);
      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  },
);

scheduleRoutes.post(
  '/pdf',
  validate(schedulePdfSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schedule, projectName, companyName } = req.body;
      const pdfBuffer = await generateSchedulePDF(schedule, { projectName, companyName });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="migration-schedule-${Date.now()}.pdf"`,
      );
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  },
);
