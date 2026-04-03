import type { ClusterInfo, StorageClass, PortworxInfo, PortworxVolume, PortworxNode } from '@vm-migration/shared';
import type { OpenshiftClient, PxStorageCluster } from './OpenshiftClient.js';

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
  const portworxInfo = await discoverPortworx(client);

  return {
    name: nodeList.items[0]?.metadata.labels?.['kubernetes.io/cluster-name'] ?? 'openshift-cluster',
    nodeCount: nodeList.items.length,
    totalCPU,
    totalMemoryGB: Math.round(totalMemoryGB * 100) / 100,
    storageClasses,
    mtvInstalled,
    portworxInfo: portworxInfo ?? undefined,
  };
}

async function discoverPortworx(client: OpenshiftClient): Promise<PortworxInfo | null> {
  try {
    const [clusterList, nodeList, pvList] = await Promise.all([
      client.getPortworxStorageCluster(),
      client.getPortworxStorageNodes(),
      client.getPortworxPersistentVolumes(),
    ]);

    if (clusterList.items.length === 0) {
      return null; // Portworx not installed
    }

    const cluster = clusterList.items[0];
    const backendType = detectBackendType(cluster);
    const version = cluster.status?.version ?? 'unknown';
    const clusterName = cluster.metadata.name;

    // Map StorageNodes to PortworxNode
    const nodes: PortworxNode[] = nodeList.items.map((n) => {
      const totalBytes = parseStorageBytes(n.status?.storage?.totalCapacityRaw ?? '0');
      const usedBytes = parseStorageBytes(n.status?.storage?.usedRaw ?? '0');
      return {
        id: n.status?.nodeUid ?? n.metadata.name,
        hostname: n.metadata.name,
        ip: n.status?.network?.dataIp ?? n.status?.network?.mgmtIp ?? '',
        poolCount: n.status?.storage?.pools?.length ?? 0,
        totalCapacityGB: Math.round(totalBytes / (1024 ** 3)),
        usedCapacityGB: Math.round(usedBytes / (1024 ** 3)),
      };
    });

    // Map Portworx PVs to PortworxVolume
    const volumes: PortworxVolume[] = pvList.items.map((pv) => {
      const sizeStr = pv.spec?.capacity?.storage ?? '0Gi';
      const sizeGB = parseStorageBytes(sizeStr) / (1024 ** 3);
      const attrs = pv.spec?.csi?.volumeAttributes ?? {};
      return {
        id: pv.spec?.csi?.volumeHandle ?? pv.metadata.name,
        name: pv.metadata.name,
        sizeGB: Math.round(sizeGB * 10) / 10,
        replicationFactor: parseInt(attrs['repl'] ?? '1', 10),
        backendType: attrs['backend']?.includes('flasharray') ? 'flasharray' : backendType,
        ioProfile: attrs['io_profile'] ?? 'auto',
        state: 'running',
      };
    });

    const totalCapacityGB = nodes.reduce((s, n) => s + n.totalCapacityGB, 0);
    const usedCapacityGB = nodes.reduce((s, n) => s + n.usedCapacityGB, 0);

    return {
      installed: true,
      version,
      clusterName,
      backendType,
      nodeCount: nodes.length,
      totalCapacityGB,
      usedCapacityGB,
      volumes,
      nodes,
    };
  } catch {
    return null;
  }
}

function detectBackendType(cluster: PxStorageCluster): 'flasharray' | 'cloud' | 'generic' {
  const providers = cluster.status?.storage?.backendProviders ?? [];
  if (providers.some((p) => p.providerName?.toLowerCase().includes('pure') || p.providerName?.toLowerCase().includes('flasharray'))) {
    return 'flasharray';
  }
  const envVars = cluster.spec?.env ?? [];
  if (envVars.some((e) => e.name === 'PURE_FLASHARRAY_SAN_TYPE')) {
    return 'flasharray';
  }
  const devices = [...(cluster.spec?.storage?.devices ?? []), ...(cluster.spec?.cloudStorage?.deviceSpecs ?? [])];
  if (devices.some((d) => d.toLowerCase().includes('pure') || d.toLowerCase().includes('fa-'))) {
    return 'flasharray';
  }
  if (cluster.spec?.cloudStorage?.deviceSpecs && cluster.spec.cloudStorage.deviceSpecs.length > 0) {
    return 'cloud';
  }
  return 'generic';
}

function parseStorageBytes(value: string): number {
  if (!value) return 0;
  const num = parseInt(value, 10);
  if (value.endsWith('Ki')) return num * 1024;
  if (value.endsWith('Mi')) return num * 1024 ** 2;
  if (value.endsWith('Gi')) return num * 1024 ** 3;
  if (value.endsWith('Ti')) return num * 1024 ** 4;
  if (value.endsWith('K') || value.endsWith('k')) return num * 1000;
  if (value.endsWith('M')) return num * 1000 ** 2;
  if (value.endsWith('G')) return num * 1000 ** 3;
  if (value.endsWith('T')) return num * 1000 ** 4;
  return num;
}

async function checkMTVInstalled(client: OpenshiftClient): Promise<boolean> {
  try {
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
  return value / (1024 * 1024 * 1024);
}
