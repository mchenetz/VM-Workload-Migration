import type { VM, TuningParams, CalculationResult } from '@vm-migration/shared';
import { METHOD_LABELS } from '@vm-migration/shared';
import { formatTime } from './utils.js';

/**
 * Portworx Migration estimation.
 *
 * Unlike full-copy methods (network_copy, xcopy), Portworx migration is
 * delta-based: Portworx continuously syncs the volume and only the final
 * delta (changes since last sync) needs to transfer at cutover.
 *
 * Estimated cutover time per VM:
 *   delta_GB = totalDiskGB * dailyChangeRate * (cutoverWindowHours / 24)
 *   transferTime = delta_GB / effectiveBandwidth
 *   overhead = 2 minutes for snapshot + PVC binding
 *
 * Minimum 2 minutes per VM to account for control-plane operations.
 */
export function calculatePortworxMigration(
  vms: VM[],
  tuning: TuningParams,
): CalculationResult {
  const effectiveBandwidthGBps =
    (tuning.networkBandwidthGbps * tuning.bandwidthUtilization) / 8;

  // Assume a 1-hour cutover window for delta calculation
  const cutoverWindowHours = 1;

  const perVMResults = vms.map((vm) => {
    const deltaGB = vm.totalDiskSizeGB * tuning.dailyChangeRate * (cutoverWindowHours / 24);
    const transferSeconds = deltaGB / effectiveBandwidthGBps;
    const overheadSeconds = 120; // 2 min snapshot + PVC bind
    const estimatedSeconds = Math.max(120, transferSeconds + overheadSeconds);

    return {
      vmId: vm.id,
      vmName: vm.name,
      diskSizeGB: vm.totalDiskSizeGB,
      estimatedSeconds: Math.round(estimatedSeconds),
    };
  });

  const totalTimeSeconds = perVMResults.reduce(
    (sum, r) => sum + r.estimatedSeconds,
    0,
  );

  const formulaSteps = [
    {
      label: 'Effective bandwidth',
      formula: 'networkBandwidthGbps × utilization ÷ 8',
      values: `${tuning.networkBandwidthGbps} × ${tuning.bandwidthUtilization} ÷ 8`,
      result: `${effectiveBandwidthGBps.toFixed(3)} GB/s`,
    },
    {
      label: 'Delta per VM (1h cutover window)',
      formula: 'totalDiskGB × dailyChangeRate × (1h / 24h)',
      values: `diskGB × ${tuning.dailyChangeRate} × 0.042`,
      result: 'varies per VM',
    },
    {
      label: 'Overhead per VM',
      formula: 'snapshot creation + PVC binding',
      values: '120 seconds',
      result: '2 min fixed',
    },
  ];

  return {
    method: 'portworx_migration',
    methodLabel: METHOD_LABELS['portworx_migration'],
    totalTimeSeconds,
    totalTimeFormatted: formatTime(totalTimeSeconds),
    perVMResults,
    formulaSteps,
    bottlenecks: [],
    recommendations: [
      'Portworx Migration transfers only the delta since last sync — cutover is near-instant for low-change VMs.',
      'Ensure Portworx replication is healthy on all source nodes before cutover.',
      'Use pxctl volume inspect to verify volume health before scheduling cutover windows.',
    ],
    compatible: true,
  };
}
