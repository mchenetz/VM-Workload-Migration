export type MigrationMethod = 'network_copy' | 'xcopy' | 'flasharray_copy';

export interface TuningParams {
  concurrentTransfers: number;
  networkBandwidthGbps: number;
  bandwidthUtilization: number;
  compressionRatio: number;
  vddkOverhead: number;
  xcopySpeedMultiplier: number;
  storageIOPS: number;
  warmMigration: boolean;
  dailyChangeRate: number;
  daysSinceCutover: number;
}

export interface FormulaStep {
  label: string;
  formula: string;
  values: string;
  result: string;
}

export interface VMResult {
  vmId: string;
  vmName: string;
  diskSizeGB: number;
  estimatedSeconds: number;
}

export interface Bottleneck {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestion: string;
}

export interface CalculationResult {
  method: MigrationMethod;
  methodLabel: string;
  totalTimeSeconds: number;
  totalTimeFormatted: string;
  perVMResults: VMResult[];
  formulaSteps: FormulaStep[];
  bottlenecks: Bottleneck[];
  recommendations: string[];
  compatible: boolean;
  incompatibleReason?: string;
}

export interface CalculationResponse {
  results: CalculationResult[];
  recommendedMethod: MigrationMethod;
  summary: {
    totalVMs: number;
    totalDiskGB: number;
    fastestMethod: MigrationMethod;
    fastestTimeFormatted: string;
  };
}

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  tuning: TuningParams;
}
