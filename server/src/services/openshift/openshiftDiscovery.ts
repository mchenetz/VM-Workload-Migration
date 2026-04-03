import type { ClusterInfo, StorageClass, PortworxInfo, PortworxVolume, PortworxNode, OpenShiftVM } from '@vm-migration/shared';
import type { OpenshiftClient, PxStorageCluster, K8sStorageClass, KubeVirtVM } from './OpenshiftClient.js';

export async function discoverOpenShift(
  client: OpenshiftClient,
  /** VMware VM names for migration correlation (optional) */
  vmwareVMNames: string[] = [],
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
  const portworxInfo = await discoverPortworx(client, storageClassList.items);
  const virtualMachines = await discoverVirtualMachines(client, vmwareVMNames);

  return {
    name: nodeList.items[0]?.metadata.labels?.['kubernetes.io/cluster-name'] ?? 'openshift-cluster',
    nodeCount: nodeList.items.length,
    totalCPU,
    totalMemoryGB: Math.round(totalMemoryGB * 100) / 100,
    storageClasses,
    mtvInstalled,
    portworxInfo: portworxInfo ?? undefined,
    virtualMachines,
  };
}

async function discoverPortworx(client: OpenshiftClient, storageClasses: K8sStorageClass[] = []): Promise<PortworxInfo | null> {
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
    const pxNamespace = cluster.metadata.namespace;
    const hasPureSecret = await client.secretExists(pxNamespace, 'px-pure-secret');
    const backendType = detectBackendType(cluster, storageClasses, hasPureSecret);
    const version = cluster.status?.version ?? 'unknown';
    const clusterName = cluster.metadata.name;

    // Map StorageNodes to PortworxNode
    const nodes: PortworxNode[] = nodeList.items.map((n) => {
      const storage = n.status?.storage;
      const pools = storage?.pools ?? [];
      // totalSize / usedSize are the actual field names from the StorageNode CRD
      const totalBytes = parseStorageBytes(storage?.totalSize ?? '0')
        || pools.reduce((s, p) => s + parseStorageBytes(p.totalSize ?? '0'), 0);
      const usedBytes = parseStorageBytes(storage?.usedSize ?? '0')
        || pools.reduce((s, p) => s + parseStorageBytes(p.usedSize ?? '0'), 0);
      return {
        id: n.status?.nodeUid ?? n.metadata.name,
        hostname: n.metadata.name,
        ip: n.status?.network?.dataIP ?? n.status?.network?.mgmtIP ?? '',
        poolCount: pools.length || (totalBytes > 0 ? 1 : 0),
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

    let totalCapacityGB = nodes.reduce((s, n) => s + n.totalCapacityGB, 0);
    let usedCapacityGB = nodes.reduce((s, n) => s + n.usedCapacityGB, 0);
    // Fall back to cluster-level capacity if nodes reported nothing
    if (totalCapacityGB === 0 && cluster.status?.storage?.totalCapacityRaw) {
      totalCapacityGB = Math.round(parseStorageBytes(cluster.status.storage.totalCapacityRaw) / (1024 ** 3));
      usedCapacityGB = Math.round(parseStorageBytes(cluster.status.storage.usedRaw ?? '0') / (1024 ** 3));
    }
    // Final fallback: sum PV sizes as proxy for used storage
    if (totalCapacityGB === 0 && volumes.length > 0) {
      usedCapacityGB = Math.round(volumes.reduce((s, v) => s + v.sizeGB, 0));
    }

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

async function discoverVirtualMachines(
  client: OpenshiftClient,
  vmwareVMNames: string[],
): Promise<OpenShiftVM[]> {
  try {
    const [vmList, migrationList] = await Promise.all([
      client.getVirtualMachines(),
      client.getMTVMigrations('openshift-mtv').catch(() => ({ items: [] })),
    ]);

    if (vmList.items.length === 0) return [];

    // Build set of plan names referenced by completed migrations
    const completedPlanNames = new Set<string>();
    for (const m of migrationList.items) {
      const succeeded = m.status?.conditions?.some(
        (c) => c.type === 'Succeeded' && c.status === 'True',
      );
      if (succeeded && m.spec?.plan?.name) {
        completedPlanNames.add(m.spec.plan.name);
      }
    }

    const vmwareNamesLower = new Set(vmwareVMNames.map((n) => n.toLowerCase()));

    return vmList.items.map((vm: KubeVirtVM): OpenShiftVM => {
      const labels = vm.metadata.labels ?? {};
      const annotations = vm.metadata.annotations ?? {};

      // MTV/Forklift stamps these labels on migrated VMs
      const mtvPlanName =
        labels['forklift.konveyor.io/plan'] ??
        annotations['forklift.konveyor.io/plan'] ??
        undefined;
      const migratedViaMTV = !!(
        mtvPlanName ||
        labels['forklift.konveyor.io/migration'] ||
        annotations['forklift.konveyor.io/migration']
      );

      // Name-match against known VMware VMs
      const sourceVMwareName = vmwareNamesLower.has(vm.metadata.name.toLowerCase())
        ? vmwareVMNames.find((n) => n.toLowerCase() === vm.metadata.name.toLowerCase())
        : undefined;

      const domain = vm.spec?.template?.spec?.domain;
      const cpu = domain?.cpu;
      const cores = (cpu?.sockets ?? 1) * (cpu?.cores ?? 1) * (cpu?.threads ?? 1) || 1;
      const memoryStr = domain?.memory?.guest ?? '0';
      const memoryGB = parseStorageBytes(memoryStr) / (1024 ** 3);

      const rawStatus = vm.status?.printableStatus ?? 'Unknown';
      const status: OpenShiftVM['status'] =
        rawStatus === 'Running' ? 'Running'
        : rawStatus === 'Stopped' ? 'Stopped'
        : rawStatus === 'Paused' ? 'Paused'
        : rawStatus === 'Migrating' ? 'Migrating'
        : 'Unknown';

      return {
        name: vm.metadata.name,
        namespace: vm.metadata.namespace,
        status,
        vCPUs: cores,
        memoryGB: Math.round(memoryGB * 10) / 10,
        migratedViaMTV,
        mtvPlanName,
        sourceVMwareName,
      };
    });
  } catch {
    return [];
  }
}

function detectBackendType(cluster: PxStorageCluster, storageClasses: K8sStorageClass[] = [], hasPureSecret = false): 'flasharray' | 'cloud' | 'generic' {
  // 0. px-pure-secret exists in the Portworx namespace — definitive FlashArray signal
  if (hasPureSecret) {
    return 'flasharray';
  }
  // 1. Explicit backend providers in cluster status
  const providers = cluster.status?.storage?.backendProviders ?? [];
  if (providers.some((p) => p.providerName?.toLowerCase().includes('pure') || p.providerName?.toLowerCase().includes('flasharray'))) {
    return 'flasharray';
  }

  // 2. Pure-related env vars (PURE_FLASHARRAY_SAN_TYPE, PURE_BACKEND, etc.)
  const envVars = cluster.spec?.env ?? [];
  if (envVars.some((e) => e.name.startsWith('PURE_') || e.name.includes('FLASHARRAY'))) {
    return 'flasharray';
  }

  // 3. px-pure-secret mounted as a volume — definitive signal for Pure backend
  const volumes = cluster.spec?.volumes ?? [];
  if (volumes.some((v) => v.secret?.secretName?.toLowerCase().includes('pure'))) {
    return 'flasharray';
  }

  // 4. Device specs mentioning pure or fa-
  const devices = [...(cluster.spec?.storage?.devices ?? []), ...(cluster.spec?.cloudStorage?.deviceSpecs ?? [])];
  if (devices.some((d) => d.toLowerCase().includes('pure') || d.toLowerCase().includes('fa-'))) {
    return 'flasharray';
  }

  // 5. Storage class parameters — pure_block / pure_file backend param, or pure provisioner
  const pxStorageClasses = storageClasses.filter((sc) => sc.provisioner === 'pxd.portworx.com');
  const hasPureBackend = pxStorageClasses.some((sc) => {
    const params = sc.parameters ?? {};
    return Object.values(params).some((v) => v.toLowerCase().includes('pure'));
  });
  if (hasPureBackend) {
    return 'flasharray';
  }

  // 6. Cloud storage specs present
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
