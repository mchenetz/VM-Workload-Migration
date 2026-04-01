import type { PresetProfile } from '@vm-migration/shared';
import { DEFAULT_TUNING_PARAMS } from './defaults.js';

export const PRESETS: PresetProfile[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Lower concurrency and utilization for minimal impact on production workloads.',
    tuning: {
      ...DEFAULT_TUNING_PARAMS,
      concurrentTransfers: 2,
      bandwidthUtilization: 0.5,
      compressionRatio: 0.2,
      vddkOverhead: 0.15,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Default settings balancing speed and resource consumption.',
    tuning: {
      ...DEFAULT_TUNING_PARAMS,
    },
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Maximum concurrency and throughput for fastest migration during maintenance windows.',
    tuning: {
      ...DEFAULT_TUNING_PARAMS,
      concurrentTransfers: 8,
      bandwidthUtilization: 0.85,
      compressionRatio: 0.5,
      vddkOverhead: 0.10,
    },
  },
];
