import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ── Schemas ──

export const connectSchema = z.object({
  type: z.enum(['vmware', 'openshift', 'flasharray']),
  endpoint: z.string().url(),
  credentials: z.object({}).passthrough(),
});

const tuningParamsSchema = z.object({
  concurrentTransfers: z.number().int().positive().optional(),
  networkBandwidthGbps: z.number().positive().optional(),
  bandwidthUtilization: z.number().min(0).max(1).optional(),
  compressionRatio: z.number().min(0).max(1).optional(),
  vddkOverhead: z.number().min(0).max(1).optional(),
  xcopySpeedMultiplier: z.number().positive().optional(),
  storageIOPS: z.number().positive().optional(),
  warmMigration: z.boolean().optional(),
  dailyChangeRate: z.number().min(0).max(1).optional(),
  daysSinceCutover: z.number().int().nonnegative().optional(),
});

const migrationMethodSchema = z.enum(['network_copy', 'xcopy']);

export const manualCalcSchema = z.object({
  vmCount: z.number().int().positive(),
  totalDiskSizeGB: z.number().positive(),
  tuning: tuningParamsSchema.optional(),
  methods: z.array(migrationMethodSchema).optional(),
});

const calculationResultSchema = z.object({
  method: migrationMethodSchema,
  methodLabel: z.string(),
  totalTimeSeconds: z.number(),
  totalTimeFormatted: z.string(),
  perVMResults: z.array(z.object({
    vmId: z.string(),
    vmName: z.string(),
    diskSizeGB: z.number(),
    estimatedSeconds: z.number(),
  })),
  formulaSteps: z.array(z.object({
    label: z.string(),
    formula: z.string(),
    values: z.string(),
    result: z.string(),
  })),
  bottlenecks: z.array(z.object({
    type: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    message: z.string(),
    suggestion: z.string(),
  })),
  recommendations: z.array(z.string()),
  compatible: z.boolean(),
  incompatibleReason: z.string().optional(),
});

const exportOptionsSchema = z.object({
  projectName: z.string().min(1),
  companyName: z.string().optional(),
  includeVMDetails: z.boolean(),
  includeFormulas: z.boolean(),
  includeRecommendations: z.boolean(),
});

export const exportSchema = z.object({
  results: z.array(calculationResultSchema),
  options: exportOptionsSchema,
});

// ── Schedule ──

const scheduleParamsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/, 'windowStart must be HH:MM'),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/, 'windowEnd must be HH:MM'),
  workDays: z.array(z.number().int().min(0).max(6)),
  maxConcurrent: z.number().int().positive(),
  preferredMethod: migrationMethodSchema,
  bufferMinutes: z.number().int().nonnegative(),
});

export const scheduleGenerateSchema = z.object({
  params: scheduleParamsSchema,
  results: z.array(calculationResultSchema).optional(),
});

export const schedulePdfSchema = z.object({
  schedule: z.object({}).passthrough(),
  projectName: z.string().min(1),
  companyName: z.string().optional(),
});

// ── Middleware ──

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
