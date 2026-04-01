import type { TuningParams } from '@vm-migration/shared';

export const DEFAULT_TUNING_PARAMS: TuningParams = {
  concurrentTransfers: 4,
  networkBandwidthGbps: 10,
  bandwidthUtilization: 0.7,
  compressionRatio: 0.35,
  vddkOverhead: 0.12,
  xcopySpeedMultiplier: 5,
  storageIOPS: 50000,
  warmMigration: false,
  dailyChangeRate: 0.02,
  daysSinceCutover: 1,
};
