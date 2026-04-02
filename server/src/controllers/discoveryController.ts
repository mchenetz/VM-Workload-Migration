import type {
  VM,
  ClusterInfo,
  FlashArrayVolume,
  Datastore,
  CompatibilityResult,
} from '@vm-migration/shared';
import { getClient } from './platformController.js';
import { VmwareClient } from '../services/vmware/VmwareClient.js';
import { OpenshiftClient } from '../services/openshift/OpenshiftClient.js';
import { FlashArrayClient } from '../services/flasharray/FlashArrayClient.js';
import { discoverOpenShift as runOSDiscovery } from '../services/openshift/openshiftDiscovery.js';
import { discoverFlashArray as runFADiscovery } from '../services/flasharray/flasharrayDiscovery.js';

// In-memory cache for discovered data
let cachedVMs: VM[] = [];
let cachedDatastores: Datastore[] = [];
let cachedClusterInfo: ClusterInfo | null = null;
let cachedVolumes: FlashArrayVolume[] = [];

export async function discoverVMwareVMs(): Promise<{
  vms: VM[];
  datastores: Datastore[];
}> {
  const client = getClient('vmware');
  if (!client) {
    throw new Error('VMware platform is not connected');
  }

  const vmwareClient = client as VmwareClient;
  const vmSummaries = await vmwareClient.getVMs();
  const datastoreList = await vmwareClient.getDatastores();

  // Map vSphere summaries to our VM type
  const vms: VM[] = await Promise.all(
    vmSummaries.map(async (summary) => {
      const detail = await vmwareClient.getVM(summary.vm);
      const disks = Object.entries(detail.disks).map(([key, disk]) => ({
        id: key,
        name: disk.label,
        capacityGB: Math.round((disk.capacity || 0) / (1024 * 1024 * 1024)),
        thinProvisioned: disk.backing?.thin_provisioned ?? false,
        datastore: disk.backing?.vmdk_file?.split(']')[0]?.replace('[', '') ?? '',
      }));

      const totalDiskSizeGB = disks.reduce((sum, d) => sum + d.capacityGB, 0);
      const firstNic = detail.nics
        ? Object.values(detail.nics)[0]
        : undefined;

      return {
        id: summary.vm,
        name: detail.name,
        guestOS: detail.guest_OS,
        powerState: detail.power_state === 'POWERED_ON'
          ? 'poweredOn' as const
          : detail.power_state === 'POWERED_OFF'
            ? 'poweredOff' as const
            : 'suspended' as const,
        vCPUs: detail.cpu.count,
        memoryGB: Math.round(detail.memory.size_MiB / 1024),
        disks,
        totalDiskSizeGB,
        datastoreName: disks[0]?.datastore ?? '',
        resourcePool: '',
        network: firstNic?.backing?.network ?? '',
      };
    }),
  );

  // Map datastores
  const datastores: Datastore[] = datastoreList.map((ds) => ({
    id: ds.datastore,
    name: ds.name,
    type: ds.type as Datastore['type'],
    capacityGB: Math.round(ds.capacity / (1024 * 1024 * 1024)),
    freeGB: Math.round(ds.free_space / (1024 * 1024 * 1024)),
    isVAAICapable: ds.type === 'VMFS',
    isFlashArrayBacked: false,
  }));

  cachedVMs = vms;
  cachedDatastores = datastores;

  return { vms, datastores };
}

export async function discoverOpenShift(): Promise<ClusterInfo> {
  const client = getClient('openshift');
  if (!client) {
    throw new Error('OpenShift platform is not connected');
  }

  const openshiftClient = client as OpenshiftClient;
  const clusterInfo = await runOSDiscovery(openshiftClient);

  cachedClusterInfo = clusterInfo;
  return clusterInfo;
}

export async function discoverFlashArray(): Promise<{
  volumes: FlashArrayVolume[];
}> {
  const client = getClient('flasharray');
  if (!client) {
    throw new Error('FlashArray platform is not connected');
  }

  const flashArrayClient = client as FlashArrayClient;
  const result = await runFADiscovery(flashArrayClient);

  cachedVolumes = result.volumes;
  return result;
}

export function getCompatibility(): CompatibilityResult[] {
  if (cachedVMs.length === 0) {
    throw new Error('No VMware VMs discovered yet. Run VMware discovery first.');
  }

  return cachedVMs.map((vm) => {
    // Network copy is always compatible
    const networkCopy = true;

    // XCopy requires VAAI-capable datastores (VMFS)
    const datastoreInfo = cachedDatastores.find((ds) => ds.name === vm.datastoreName);
    const xcopy = datastoreInfo?.isVAAICapable ?? false;
    const xcopyReason = !xcopy ? 'Datastore is not VAAI-capable (requires VMFS)' : undefined;

    // FlashArray copy requires FlashArray-backed storage and discovered volumes
    const flasharrayCopy = datastoreInfo?.isFlashArrayBacked ?? false;
    const flasharrayReason = !flasharrayCopy
      ? 'VM storage is not backed by a FlashArray volume'
      : undefined;

    return {
      vmId: vm.id,
      vmName: vm.name,
      networkCopy,
      xcopy,
      xcopyReason,
      flasharrayCopy,
      flasharrayReason,
    };
  });
}

export function getCachedVMs(): VM[] {
  return cachedVMs;
}

export function importVMs(vms: VM[]): void {
  cachedVMs = vms;
  // Reset datastores to empty when using imported VMs
  cachedDatastores = [];
}
