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
  const results: CalculationResult[] = methods.map((method) => {
    const calculate = calculators[method];
    return calculate(vms, tuning);
  });

  const bottlenecks = detectBottlenecks(vms, tuning, results);
  const recommendations = getRecommendations(vms, tuning, results);

  for (const result of results) {
    const relevantBottlenecks = bottlenecks.filter((b) => {
      if (b.type === 'network_saturation' || b.type === 'storage_iops') {
        return result.method === 'network_copy';
      }
      return true;
    });
    result.bottlenecks = relevantBottlenecks;
    result.recommendations = recommendations;
  }

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

// Re-export METHOD_LABELS to avoid unused import warning
export { METHOD_LABELS };
