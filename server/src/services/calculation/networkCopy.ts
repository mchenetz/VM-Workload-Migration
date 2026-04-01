import type { VM, TuningParams, CalculationResult, FormulaStep, VMResult } from '@vm-migration/shared';
import { METHOD_LABELS, GB_TO_BYTES, GBPS_TO_BYTES_PER_SEC } from '@vm-migration/shared';
import { formatTime } from './utils.js';

export function calculateNetworkCopy(vms: VM[], tuning: TuningParams): CalculationResult {
  const steps: FormulaStep[] = [];
  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);

  // Step 1: Effective size after compression
  const effectiveSize = totalDiskGB * (1 - tuning.compressionRatio);
  steps.push({
    label: 'Effective Data Size',
    formula: 'total_disk_GB * (1 - compression_ratio)',
    values: `${totalDiskGB} * (1 - ${tuning.compressionRatio})`,
    result: `${effectiveSize.toFixed(2)} GB`,
  });

  // Step 2: Effective bandwidth in Gbps
  const protocolEfficiency = 0.95;
  const effectiveBwGbps =
    tuning.networkBandwidthGbps *
    tuning.bandwidthUtilization *
    (1 - tuning.vddkOverhead) *
    protocolEfficiency;
  steps.push({
    label: 'Effective Bandwidth (Gbps)',
    formula: 'network_Gbps * utilization * (1 - vddk_overhead) * 0.95',
    values: `${tuning.networkBandwidthGbps} * ${tuning.bandwidthUtilization} * (1 - ${tuning.vddkOverhead}) * ${protocolEfficiency}`,
    result: `${effectiveBwGbps.toFixed(4)} Gbps`,
  });

  // Step 3: Effective bandwidth in bytes/sec
  const effectiveBwBytes = effectiveBwGbps * GBPS_TO_BYTES_PER_SEC;
  steps.push({
    label: 'Effective Bandwidth (bytes/sec)',
    formula: 'effective_bw_gbps * 125,000,000',
    values: `${effectiveBwGbps.toFixed(4)} * ${GBPS_TO_BYTES_PER_SEC}`,
    result: `${effectiveBwBytes.toFixed(0)} bytes/sec`,
  });

  // Step 4: Per-transfer bandwidth
  const perTransferBw = effectiveBwBytes / tuning.concurrentTransfers;
  steps.push({
    label: 'Per-Transfer Bandwidth',
    formula: 'effective_bw_bytes / concurrent_transfers',
    values: `${effectiveBwBytes.toFixed(0)} / ${tuning.concurrentTransfers}`,
    result: `${perTransferBw.toFixed(0)} bytes/sec`,
  });

  // Step 5: Transfer time
  const transferTimeSec = (effectiveSize * GB_TO_BYTES) / perTransferBw;
  steps.push({
    label: 'Transfer Time',
    formula: '(effective_size * 1,073,741,824) / per_transfer_bw',
    values: `(${effectiveSize.toFixed(2)} * ${GB_TO_BYTES}) / ${perTransferBw.toFixed(0)}`,
    result: `${transferTimeSec.toFixed(2)} seconds`,
  });

  let totalTimeSec = transferTimeSec;

  // Warm migration incremental sync
  if (tuning.warmMigration) {
    const incrementalGB = totalDiskGB * tuning.dailyChangeRate * tuning.daysSinceCutover;
    const incrementalTimeSec = (incrementalGB * GB_TO_BYTES) / perTransferBw;

    steps.push({
      label: 'Incremental Sync Data',
      formula: 'total_disk_GB * dailyChangeRate * daysSinceCutover',
      values: `${totalDiskGB} * ${tuning.dailyChangeRate} * ${tuning.daysSinceCutover}`,
      result: `${incrementalGB.toFixed(4)} GB`,
    });

    steps.push({
      label: 'Incremental Sync Time',
      formula: '(incremental_GB * GB_TO_BYTES) / per_transfer_bw',
      values: `(${incrementalGB.toFixed(4)} * ${GB_TO_BYTES}) / ${perTransferBw.toFixed(0)}`,
      result: `${incrementalTimeSec.toFixed(2)} seconds`,
    });

    totalTimeSec += incrementalTimeSec;
  }

  steps.push({
    label: 'Total Migration Time',
    formula: tuning.warmMigration ? 'transfer_time + incremental_sync_time' : 'transfer_time',
    values: `${totalTimeSec.toFixed(2)}`,
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
    method: 'network_copy',
    methodLabel: METHOD_LABELS.network_copy,
    totalTimeSeconds: totalTimeSec,
    totalTimeFormatted: formatTime(totalTimeSec),
    perVMResults,
    formulaSteps: steps,
    bottlenecks: [],
    recommendations: [],
    compatible: true,
  };
}
