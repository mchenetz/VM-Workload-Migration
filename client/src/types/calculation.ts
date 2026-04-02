export type MigrationMethod = 'network_copy' | 'xcopy';

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

// ── Migration Schedule ──

export interface ScheduleParams {
  startDate: string;
  windowStart: string;
  windowEnd: string;
  workDays: number[];
  maxConcurrent: number;
  preferredMethod: MigrationMethod;
  bufferMinutes: number;
}

export interface ScheduledVM {
  vmId: string;
  vmName: string;
  guestOS: string;
  vCPUs: number;
  memoryGB: number;
  diskCount: number;
  network: string;
  powerState: 'poweredOn' | 'poweredOff' | 'suspended';
  diskSizeGB: number;
  estimatedMinutes: number;
  method: MigrationMethod;
}

export interface ScheduleWindow {
  date: string;
  windowStart: string;
  windowEnd: string;
  vms: ScheduledVM[];
  totalMinutes: number;
}

export interface MigrationSchedule {
  generatedAt: string;
  startDate: string;
  completionDate: string;
  totalDays: number;
  windows: ScheduleWindow[];
  params: ScheduleParams;
}
