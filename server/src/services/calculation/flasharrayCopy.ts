import type { VM, TuningParams, CalculationResult, FormulaStep, VMResult } from '@vm-migration/shared';
import { METHOD_LABELS } from '@vm-migration/shared';
import { formatTime } from './utils.js';

export function calculateFlashArrayCopy(vms: VM[], tuning: TuningParams): CalculationResult {
  const steps: FormulaStep[] = [];
  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);
  const vmCount = vms.length;

  // Step 1: Snapshot time (constant)
  const snapshotTime = 1;
  steps.push({
    label: 'Snapshot Creation',
    formula: 'constant',
    values: '1',
    result: `${snapshotTime} second`,
  });

  // Step 2: Promotion time
  const promotionTime = vmCount * 0.5;
  steps.push({
    label: 'Volume Promotion',
    formula: 'vm_count * 0.5',
    values: `${vmCount} * 0.5`,
    result: `${promotionTime.toFixed(1)} seconds`,
  });

  // Step 3: Total time
  const totalTimeSec = snapshotTime + promotionTime;
  steps.push({
    label: 'Total Migration Time',
    formula: 'snapshot_time + promotion_time',
    values: `${snapshotTime} + ${promotionTime.toFixed(1)}`,
    result: `${totalTimeSec.toFixed(1)} seconds`,
  });

  // Per-VM results proportional by disk size
  const perVMResults: VMResult[] = vms.map((vm) => {
    const proportion = totalDiskGB > 0 ? vm.totalDiskSizeGB / totalDiskGB : 1 / vms.length;
    return {
      vmId: vm.id,
      vmName: vm.name,
      diskSizeGB: vm.totalDiskSizeGB,
      estimatedSeconds: totalTimeSec * proportion,
    };
  });

  return {
    method: 'xcopy' as const,
    methodLabel: METHOD_LABELS['xcopy'],
    totalTimeSeconds: totalTimeSec,
    totalTimeFormatted: formatTime(totalTimeSec),
    perVMResults,
    formulaSteps: steps,
    bottlenecks: [],
    recommendations: [],
    compatible: true,
  };
}
