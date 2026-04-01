import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as exportController from '../controllers/exportController.js';
import { validate, exportSchema } from '../middleware/validation.js';

export const exportRoutes = Router();

exportRoutes.post(
  '/pdf',
  validate(exportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { results, options } = req.body;
      const pdfBuffer = await exportController.generatePDF(results, options);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="migration-estimate-${Date.now()}.pdf"`,
      );
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  },
);
