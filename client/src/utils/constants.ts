import type { MigrationMethod, TuningParams } from '../types/calculation';

export const METHOD_LABELS: Record<MigrationMethod, string> = {
  network_copy: 'Network Copy (VDDK)',
  xcopy: 'XCopy (VAAI)',
  flasharray_copy: 'FlashArray Volume Copy',
};

export const METHOD_COLORS: Record<MigrationMethod, string> = {
  network_copy: '#3b82f6',
  xcopy: '#a855f7',
  flasharray_copy: '#22c55e',
};

export const METHOD_ICONS: Record<MigrationMethod, string> = {
  network_copy: '🌐',
  xcopy: '⚡',
  flasharray_copy: '💾',
};

export const DEFAULT_TUNING: TuningParams = {
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

export const ALL_METHODS: MigrationMethod[] = ['network_copy', 'xcopy', 'flasharray_copy'];
