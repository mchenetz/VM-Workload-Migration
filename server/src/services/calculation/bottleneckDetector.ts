import type { VM, TuningParams, CalculationResult, Bottleneck } from '@vm-migration/shared';
import { GBPS_TO_BYTES_PER_SEC } from '@vm-migration/shared';

export function detectBottlenecks(
  vms: VM[],
  tuning: TuningParams,
  results: CalculationResult[],
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);

  // 1. Network saturation check
  const totalBandwidthBytes = tuning.networkBandwidthGbps * GBPS_TO_BYTES_PER_SEC;
  const minPerVmBandwidth = 50 * 1024 * 1024; // 50 MB/s minimum per transfer
  const requiredBandwidth = tuning.concurrentTransfers * minPerVmBandwidth;

  if (requiredBandwidth > totalBandwidthBytes) {
    bottlenecks.push({
      type: 'network_saturation',
      severity: 'critical',
      message: `Concurrent transfers (${tuning.concurrentTransfers}) require ${(requiredBandwidth / GBPS_TO_BYTES_PER_SEC).toFixed(1)} Gbps, exceeding available ${tuning.networkBandwidthGbps} Gbps.`,
      suggestion: `Reduce concurrent transfers to ${Math.floor(totalBandwidthBytes / minPerVmBandwidth)} or increase network bandwidth.`,
    });
  }

  // 2. Storage IOPS check
  const totalDisks = vms.reduce((sum, vm) => sum + vm.disks.length, 0);
  const estimatedOpsPerDisk = 500; // estimated sequential read IOPS per disk
  const estimatedIOPS = totalDisks * estimatedOpsPerDisk;

  if (estimatedIOPS > tuning.storageIOPS) {
    bottlenecks.push({
      type: 'storage_iops',
      severity: 'warning',
      message: `Estimated read IOPS (${estimatedIOPS.toLocaleString()}) from ${totalDisks} disks may exceed storage capacity of ${tuning.storageIOPS.toLocaleString()} IOPS.`,
      suggestion: 'Reduce concurrent transfers or schedule migrations during off-peak hours to lower IOPS pressure.',
    });
  }

  // 3. Large VM warning
  const largeVMs = vms.filter((vm) => vm.totalDiskSizeGB > 500);
  if (largeVMs.length > 0) {
    const names = largeVMs.map((vm) => vm.name).join(', ');
    bottlenecks.push({
      type: 'large_vm',
      severity: 'warning',
      message: `${largeVMs.length} VM(s) exceed 500 GB: ${names}.`,
      suggestion: 'Consider migrating large VMs separately or during maintenance windows to avoid prolonged transfer times.',
    });
  }

  // 4. Time disparity between methods
  const compatibleResults = results.filter((r) => r.compatible);
  if (compatibleResults.length >= 2) {
    const sorted = [...compatibleResults].sort((a, b) => a.totalTimeSeconds - b.totalTimeSeconds);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];

    if (slowest.totalTimeSeconds >= fastest.totalTimeSeconds * 10) {
      bottlenecks.push({
        type: 'time_disparity',
        severity: 'info',
        message: `${fastest.methodLabel} is ${Math.round(slowest.totalTimeSeconds / fastest.totalTimeSeconds)}x faster than ${slowest.methodLabel}.`,
        suggestion: `Consider using ${fastest.methodLabel} for significantly faster migration.`,
      });
    }
  }

  return bottlenecks;
}
