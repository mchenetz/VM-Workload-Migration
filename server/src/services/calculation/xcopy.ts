import type { VM, TuningParams, CalculationResult, FormulaStep, VMResult } from '@vm-migration/shared';
import { METHOD_LABELS } from '@vm-migration/shared';
import { formatTime } from './utils.js';

export function calculateXCopy(vms: VM[], tuning: TuningParams): CalculationResult {
  const steps: FormulaStep[] = [];
  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);
  const vmCount = vms.length;

  // Step 1: Array speed in GB/s
  const arraySpeedGBps = (tuning.networkBandwidthGbps * tuning.xcopySpeedMultiplier) / 8;
  steps.push({
    label: 'Array Copy Speed',
    formula: 'networkBandwidthGbps * xcopySpeedMultiplier / 8',
    values: `${tuning.networkBandwidthGbps} * ${tuning.xcopySpeedMultiplier} / 8`,
    result: `${arraySpeedGBps.toFixed(2)} GB/s`,
  });

  // Step 2: Copy time
  const copyTime = totalDiskGB / arraySpeedGBps;
  steps.push({
    label: 'Copy Time',
    formula: 'total_disk_GB / array_speed_GBps',
    values: `${totalDiskGB} / ${arraySpeedGBps.toFixed(2)}`,
    result: `${copyTime.toFixed(2)} seconds`,
  });

  // Step 3: Metadata overhead
  const metadataOverhead = vmCount * 2;
  steps.push({
    label: 'Metadata Overhead',
    formula: 'vm_count * 2',
    values: `${vmCount} * 2`,
    result: `${metadataOverhead} seconds`,
  });

  // Step 4: Total time
  const totalTimeSec = copyTime + metadataOverhead;
  steps.push({
    label: 'Total Migration Time',
    formula: 'copy_time + metadata_overhead',
    values: `${copyTime.toFixed(2)} + ${metadataOverhead}`,
    result: `${totalTimeSec.toFixed(2)} seconds`,
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
    method: 'xcopy',
    methodLabel: METHOD_LABELS.xcopy,
    totalTimeSeconds: totalTimeSec,
    totalTimeFormatted: formatTime(totalTimeSec),
    perVMResults,
    formulaSteps: steps,
    bottlenecks: [],
    recommendations: [],
    compatible: true,
  };
}
