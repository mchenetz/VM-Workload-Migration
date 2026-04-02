import type { VM, TuningParams, MigrationMethod, CalculationResult } from '@vm-migration/shared';
import { METHOD_LABELS } from '@vm-migration/shared';
import { calculateNetworkCopy } from './networkCopy.js';
import { calculateXCopy } from './xcopy.js';
import { detectBottlenecks } from './bottleneckDetector.js';
import { getRecommendations } from './optimizer.js';
export { formatTime } from './utils.js';

const calculators: Record<MigrationMethod, (vms: VM[], tuning: TuningParams) => CalculationResult> = {
  network_copy: calculateNetworkCopy,
  xcopy: calculateXCopy,
};

export interface CalculationSummary {
  totalVMs: number;
  totalDiskGB: number;
  fastestMethod: MigrationMethod;
  fastestTimeFormatted: string;
}

export interface EngineResult {
  results: CalculationResult[];
  recommendedMethod: MigrationMethod;
  summary: CalculationSummary;
}

export function runCalculation(
  vms: VM[],
  tuning: TuningParams,
  methods: MigrationMethod[],
): EngineResult {
  // Run each requested method calculator
  const results: CalculationResult[] = methods.map((method) => {
    const calculate = calculators[method];
    return calculate(vms, tuning);
  });

  // Detect bottlenecks across all results
  const bottlenecks = detectBottlenecks(vms, tuning, results);

  // Get optimization recommendations
  const recommendations = getRecommendations(vms, tuning, results);

  // Merge bottlenecks and recommendations into each result
  for (const result of results) {
    const relevantBottlenecks = bottlenecks.filter((b) => {
      // Network saturation and storage IOPS only apply to network_copy
      if (b.type === 'network_saturation' || b.type === 'storage_iops') {
        return result.method === 'network_copy';
      }
      // Large VM and time disparity apply to all methods
      return true;
    });
    result.bottlenecks = relevantBottlenecks;
    result.recommendations = recommendations;
  }

  // Determine recommended method: fastest compatible
  const compatibleResults = results.filter((r) => r.compatible);
  const fastest = compatibleResults.length > 0
    ? compatibleResults.reduce((best, r) =>
        r.totalTimeSeconds < best.totalTimeSeconds ? r : best
      )
    : results[0];

  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);

  return {
    results,
    recommendedMethod: fastest.method,
    summary: {
      totalVMs: vms.length,
      totalDiskGB,
      fastestMethod: fastest.method,
      fastestTimeFormatted: fastest.totalTimeFormatted,
    },
  };
}
