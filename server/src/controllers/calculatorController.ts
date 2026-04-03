import type {
  VM,
  ManualCalculationInput,
  AutoCalculationInput,
  CalculationResponse,
  CalculationResult,
  MigrationMethod,
  TuningParams,
} from '@vm-migration/shared';
import { ALL_METHODS } from '@vm-migration/shared';
import { DEFAULT_TUNING_PARAMS } from '../config/defaults.js';
import { calculateNetworkCopy } from '../services/calculation/networkCopy.js';
import { calculateXCopy } from '../services/calculation/xcopy.js';
import { calculatePortworxMigration } from '../services/calculation/portworxMigration.js';
import { detectBottlenecks } from '../services/calculation/bottleneckDetector.js';
import { getCachedVMs } from './discoveryController.js';

function runCalculation(
  vms: VM[],
  tuning: TuningParams,
  methods: MigrationMethod[],
): CalculationResponse {
  const results: CalculationResult[] = [];

  for (const method of methods) {
    let result: CalculationResult;

    switch (method) {
      case 'network_copy':
        result = calculateNetworkCopy(vms, tuning);
        break;
      case 'xcopy':
        result = calculateXCopy(vms, tuning);
        break;
      case 'portworx_migration':
        result = calculatePortworxMigration(vms, tuning);
        break;
      default:
        result = calculateNetworkCopy(vms, tuning);
        break;
    }

    results.push(result);
  }

  // Detect bottlenecks and attach to each result
  const bottlenecks = detectBottlenecks(vms, tuning, results);
  for (const result of results) {
    result.bottlenecks = bottlenecks;
  }

  // Add recommendations
  const compatibleResults = results.filter((r) => r.compatible);
  for (const result of compatibleResults) {
    if (compatibleResults.length > 1) {
      const fastest = compatibleResults.reduce((a, b) =>
        a.totalTimeSeconds < b.totalTimeSeconds ? a : b,
      );
      if (result.method === fastest.method) {
        result.recommendations.push(`${result.methodLabel} is the fastest compatible method.`);
      }
    }
  }

  // Determine fastest compatible method
  const sortedCompatible = [...compatibleResults].sort(
    (a, b) => a.totalTimeSeconds - b.totalTimeSeconds,
  );
  const fastest = sortedCompatible[0];
  const totalDiskGB = vms.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0);

  return {
    results,
    recommendedMethod: fastest?.method ?? 'network_copy',
    summary: {
      totalVMs: vms.length,
      totalDiskGB,
      fastestMethod: fastest?.method ?? 'network_copy',
      fastestTimeFormatted: fastest?.totalTimeFormatted ?? 'N/A',
    },
  };
}

export function manualCalculate(input: ManualCalculationInput): CalculationResponse {
  const tuning: TuningParams = { ...DEFAULT_TUNING_PARAMS, ...input.tuning };
  const methods = input.methods?.length ? input.methods : ALL_METHODS;

  // Create synthetic VMs from manual input
  const avgDiskPerVM = input.totalDiskSizeGB / input.vmCount;
  const vms: VM[] = Array.from({ length: input.vmCount }, (_, i) => ({
    id: `manual-vm-${i + 1}`,
    name: `VM ${i + 1}`,
    guestOS: 'unknown',
    powerState: 'poweredOn' as const,
    vCPUs: 2,
    memoryGB: 4,
    disks: [
      {
        id: `disk-${i + 1}`,
        name: `Hard disk 1`,
        capacityGB: avgDiskPerVM,
        thinProvisioned: false,
        datastore: 'manual',
      },
    ],
    totalDiskSizeGB: avgDiskPerVM,
    datastoreName: 'manual',
    resourcePool: '',
    network: '',
  }));

  return runCalculation(vms, tuning, methods);
}

export function autoCalculate(input: AutoCalculationInput): CalculationResponse {
  const tuning: TuningParams = { ...DEFAULT_TUNING_PARAMS, ...input.tuning };
  const methods = input.methods?.length ? input.methods : ALL_METHODS;

  const allVMs = getCachedVMs();
  if (allVMs.length === 0) {
    throw new Error('No discovered VMs available. Run VMware discovery first.');
  }

  const selectedVMs = allVMs.filter((vm) => input.vmIds.includes(vm.id));
  if (selectedVMs.length === 0) {
    throw new Error('None of the specified VM IDs match discovered VMs.');
  }

  return runCalculation(selectedVMs, tuning, methods);
}
