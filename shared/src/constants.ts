import type { MigrationMethod } from './types.js';

export const METHOD_LABELS: Record<MigrationMethod, string> = {
  network_copy: 'Network Copy (VDDK)',
  xcopy: 'XCopy (VAAI)',
  portworx_migration: 'Portworx Migration',
};

export const METHOD_COLORS: Record<MigrationMethod, string> = {
  network_copy: '#3b82f6',        // blue-500
  xcopy: '#a855f7',               // purple-500
  portworx_migration: '#8b5cf6',  // violet-500
};

export const METHOD_DESCRIPTIONS: Record<MigrationMethod, string> = {
  network_copy: 'Standard Forklift method. Transfers VM disks over the network via VMware VDDK.',
  xcopy: 'VMware VAAI storage primitive. Offloads copy to the storage array for faster transfers.',
  portworx_migration: 'Delta-based migration using Portworx continuous replication. Only the final delta transfers at cutover.',
};

// Unit conversions
export const GB_TO_BYTES = 1_073_741_824;
export const GBPS_TO_BYTES_PER_SEC = 125_000_000; // 1 Gbps = 125 MB/s

// Defaults
export const DEFAULT_TUNING = {
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

export const ALL_METHODS: MigrationMethod[] = ['network_copy', 'xcopy', 'portworx_migration'];
