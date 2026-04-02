import type { VM, TuningParams, CalculationResult } from '@vm-migration/shared';
import { GBPS_TO_BYTES_PER_SEC } from '@vm-migration/shared';

export function getRecommendations(
  vms: VM[],
  tuning: TuningParams,
  results: CalculationResult[],
): string[] {
  const recommendations: string[] = [];
  const vmCount = vms.length;

  // 1. Optimal concurrent transfer count
  const totalBandwidthBytes = tuning.networkBandwidthGbps * GBPS_TO_BYTES_PER_SEC;
  const targetPerVmBandwidth = 100 * 1024 * 1024; // 100 MB/s target per transfer
  const optimalConcurrent = Math.max(1, Math.min(vmCount, Math.floor(totalBandwidthBytes / targetPerVmBandwidth)));

  if (optimalConcurrent !== tuning.concurrentTransfers) {
    recommendations.push(
      `Optimal concurrent transfers for ${tuning.networkBandwidthGbps} Gbps bandwidth: ${optimalConcurrent} (currently set to ${tuning.concurrentTransfers}).`,
    );
  }

  // 2. Warm migration suggestion
  const poweredOnVMs = vms.filter((vm) => vm.powerState === 'poweredOn');
  if (!tuning.warmMigration && poweredOnVMs.length > 0) {
    recommendations.push(
      `${poweredOnVMs.length} of ${vmCount} VMs are powered on. Enable warm migration to reduce cutover downtime by pre-copying data while VMs remain running.`,
    );
  }

  // 3. Batch size recommendations for large inventories
  if (vmCount > 50) {
    const batchSize = Math.ceil(vmCount / Math.ceil(vmCount / 25));
    recommendations.push(
      `Large inventory detected (${vmCount} VMs). Consider migrating in batches of ~${batchSize} VMs to maintain predictable performance and easier rollback.`,
    );
  }

  return recommendations;
}
