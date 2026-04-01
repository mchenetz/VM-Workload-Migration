import type { ClusterInfo, StorageClass } from '@vm-migration/shared';
import { OpenshiftClient } from './OpenshiftClient.js';

export async function discoverOpenShift(
  client: OpenshiftClient,
): Promise<ClusterInfo> {
  const [nodeList, storageClassList] = await Promise.all([
    client.getNodes(),
    client.getStorageClasses(),
  ]);

  let totalCPU = 0;
  let totalMemoryGB = 0;

  for (const node of nodeList.items) {
    totalCPU += parseCPU(node.status.allocatable.cpu);
    totalMemoryGB += parseMemoryToGB(node.status.allocatable.memory);
  }

  const storageClasses: StorageClass[] = storageClassList.items.map((sc) => ({
    name: sc.metadata.name,
    provisioner: sc.provisioner,
    isDefault:
      sc.metadata.annotations?.[
        'storageclass.kubernetes.io/is-default-class'
      ] === 'true',
    volumeBindingMode: sc.volumeBindingMode ?? 'Immediate',
  }));

  const mtvInstalled = await checkMTVInstalled(client);

  return {
    name: nodeList.items[0]?.metadata.labels?.['kubernetes.io/cluster-name'] ?? 'openshift-cluster',
    nodeCount: nodeList.items.length,
    totalCPU,
    totalMemoryGB: Math.round(totalMemoryGB * 100) / 100,
    storageClasses,
    mtvInstalled,
  };
}

async function checkMTVInstalled(client: OpenshiftClient): Promise<boolean> {
  try {
    // If we can list MTV plans in any namespace, the CRD exists
    await client.getMTVPlans('openshift-mtv');
    return true;
  } catch {
    return false;
  }
}

function parseCPU(cpu: string): number {
  if (cpu.endsWith('m')) {
    return parseInt(cpu, 10) / 1000;
  }
  return parseFloat(cpu) || 0;
}

function parseMemoryToGB(memory: string): number {
  const value = parseInt(memory, 10);
  if (memory.endsWith('Ki')) {
    return value / (1024 * 1024);
  }
  if (memory.endsWith('Mi')) {
    return value / 1024;
  }
  if (memory.endsWith('Gi')) {
    return value;
  }
  if (memory.endsWith('Ti')) {
    return value * 1024;
  }
  // Assume bytes
  return value / (1024 * 1024 * 1024);
}
