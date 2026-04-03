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
import { correlatePortworxToDatastores } from '../services/portworx/portworxCorrelation.js';
import { correlateFlashArrayToDatastores, correlateFlashArrayToPortworxVolumes } from '../services/flasharray/flasharrayCorrelation.js';
import { buildPortworxToFASerialMap } from '../services/portworx/portworxPxctl.js';

// In-memory cache for discovered data
let cachedVMs: VM[] = [];
let cachedDatastores: Datastore[] = [];
let cachedClusterInfo: ClusterInfo | null = null;
let cachedVolumes: FlashArrayVolume[] = [];

/** Run all cross-platform correlations against the current cache. */
function runAllCorrelations(datastores: Datastore[]): Datastore[] {
  let ds = datastores;
  if (cachedClusterInfo?.portworxInfo?.installed) {
    ds = correlatePortworxToDatastores(ds, cachedClusterInfo.portworxInfo);
  }
  if (cachedVolumes.length > 0) {
    ds = correlateFlashArrayToDatastores(ds, cachedVolumes);
  }
  return ds;
}

/** Re-correlate Portworx volumes to FlashArray volumes and update cluster cache. */
async function updatePortworxFACorrelation(): Promise<void> {
  if (!cachedClusterInfo?.portworxInfo || cachedVolumes.length === 0) return;

  const osClient = getClient('openshift');
  let pxctlSerialMap: Map<string, string> | undefined;
  if (osClient) {
    try {
      pxctlSerialMap = await buildPortworxToFASerialMap(
        osClient as import('../services/openshift/OpenshiftClient.js').OpenshiftClient,
        cachedClusterInfo.portworxInfo,
      );
      if (pxctlSerialMap.size > 0) {
        console.log(`[portworx] pxctl serial correlation: ${pxctlSerialMap.size} volumes mapped to FlashArray`);
      }
    } catch (err) {
      console.warn('[portworx] pxctl serial map skipped:', err instanceof Error ? err.message : err);
    }
  }

  const updated = correlateFlashArrayToPortworxVolumes(
    cachedClusterInfo.portworxInfo,
    cachedVolumes,
    pxctlSerialMap,
  );
  cachedClusterInfo = { ...cachedClusterInfo, portworxInfo: updated };
}

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
      const firstNic = detail.nics ? Object.values(detail.nics)[0] : undefined;

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

  let datastores: Datastore[] = datastoreList.map((ds) => ({
    id: ds.datastore,
    name: ds.name,
    type: ds.type as Datastore['type'],
    capacityGB: Math.round(ds.capacity / (1024 * 1024 * 1024)),
    freeGB: Math.round(ds.free_space / (1024 * 1024 * 1024)),
    isVAAICapable: ds.type === 'VMFS',
    isFlashArrayBacked: false,
    isPortworxBacked: false,
  }));

  datastores = runAllCorrelations(datastores);

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
  const vmwareNames = cachedVMs.map((v) => v.name);
  const clusterInfo = await runOSDiscovery(openshiftClient, vmwareNames);

  cachedClusterInfo = clusterInfo;

  // Re-correlate Portworx volumes to FlashArray volumes
  await updatePortworxFACorrelation();

  // Re-run all datastore correlations with fresh OpenShift/Portworx data
  if (cachedDatastores.length > 0) {
    cachedDatastores = runAllCorrelations(cachedDatastores);
  }

  return cachedClusterInfo;
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

  // Correlate FA volumes to Portworx PVs
  await updatePortworxFACorrelation();

  // Correlate FA volumes to datastores
  if (cachedDatastores.length > 0) {
    cachedDatastores = runAllCorrelations(cachedDatastores);
  }

  return result;
}

export function getCompatibility(): CompatibilityResult[] {
  if (cachedVMs.length === 0) {
    throw new Error('No VMware VMs discovered yet. Run VMware discovery first.');
  }

  const storageClasses = cachedClusterInfo?.storageClasses ?? [];

  return cachedVMs.map((vm) => {
    const networkCopy = true;

    const datastoreInfo = cachedDatastores.find((ds) => ds.name === vm.datastoreName);
    const xcopy = datastoreInfo?.isVAAICapable ?? false;
    const xcopyReason = !xcopy ? 'Datastore is not VAAI-capable (requires VMFS)' : undefined;

    const hasPure = storageClasses.some((sc) => sc.provisioner.toLowerCase().includes('pure'));
    const flasharrayCopy = (datastoreInfo?.isFlashArrayBacked ?? false) && hasPure;
    const flasharrayReason = !flasharrayCopy
      ? (!datastoreInfo?.isFlashArrayBacked
        ? 'VM storage is not backed by a FlashArray volume'
        : 'No storage class with a Pure Storage provisioner found')
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
  cachedDatastores = [];
}

export function getVMSource(): {
  source: 'imported' | 'discovered' | 'none';
  availableMethods: Array<{ method: string; label: string; compatible: boolean; reason?: string }>;
  recommendedMethod: string;
} {
  if (cachedVMs.length === 0) {
    return { source: 'none', availableMethods: [], recommendedMethod: 'network_copy' };
  }

  const isImported = cachedDatastores.length === 0;

  if (isImported) {
    return {
      source: 'imported',
      availableMethods: [
        { method: 'network_copy', label: 'Network Copy', compatible: true },
        { method: 'xcopy',        label: 'XCopy (VAAI)', compatible: true },
      ],
      recommendedMethod: 'network_copy',
    };
  }

  const storageClasses = cachedClusterInfo?.storageClasses ?? [];

  const anyVAAI  = cachedVMs.some((vm) => cachedDatastores.find((ds) => ds.name === vm.datastoreName)?.isVAAICapable);
  const anyFlash = cachedVMs.some((vm) => cachedDatastores.find((ds) => ds.name === vm.datastoreName)?.isFlashArrayBacked);
  const hasPure  = storageClasses.some((sc) => sc.provisioner.toLowerCase().includes('pure'));

  const methods = [
    { method: 'network_copy', label: 'Network Copy (VDDK)', compatible: true },
    {
      method: 'xcopy', label: 'XCopy (VAAI)', compatible: anyVAAI,
      reason: anyVAAI ? undefined : 'No VAAI-capable (VMFS) datastores found',
    },
    {
      method: 'flasharray_copy', label: 'FlashArray Copy', compatible: anyFlash && hasPure,
      reason: anyFlash && hasPure ? undefined : 'No FlashArray-backed datastores or Pure CSI not found',
    },
  ];

  const recommended = anyFlash && hasPure ? 'xcopy' : anyVAAI ? 'xcopy' : 'network_copy';

  return { source: 'discovered', availableMethods: methods, recommendedMethod: recommended };
}
