import type { VM, Disk, Datastore } from '@vm-migration/shared';
import { VmwareClient } from './VmwareClient.js';

export async function discoverVMware(
  client: VmwareClient,
): Promise<{ vms: VM[]; datastores: Datastore[] }> {
  const [vmSummaries, rawDatastores] = await Promise.all([
    client.getVMs(),
    client.getDatastores(),
  ]);

  const datastores: Datastore[] = rawDatastores.map((ds) => ({
    id: ds.datastore,
    name: ds.name,
    type: mapDatastoreType(ds.type),
    capacityGB: bytesToGB(ds.capacity),
    freeGB: bytesToGB(ds.free_space),
    isVAAICapable: ds.type === 'VMFS' || ds.type === 'vVol',
    isFlashArrayBacked: false,
  }));

  const datastoreMap = new Map(datastores.map((ds) => [ds.name, ds]));

  const vms: VM[] = await Promise.all(
    vmSummaries.map(async (summary) => {
      const rawDisks = await client.getVMDisks(summary.vm);

      const disks: Disk[] = rawDisks.map((d, index) => {
        const datastoreName = extractDatastoreName(d.backing?.vmdk_file);
        return {
          id: d.disk ?? `disk-${index}`,
          name: d.label ?? `Hard disk ${index + 1}`,
          capacityGB: bytesToGB(d.capacity ?? 0),
          thinProvisioned: d.backing?.thin_provisioned ?? false,
          datastore: datastoreName,
        };
      });

      const totalDiskSizeGB = disks.reduce(
        (sum, disk) => sum + disk.capacityGB,
        0,
      );

      const primaryDatastore = disks[0]?.datastore ?? '';

      return {
        id: summary.vm,
        name: summary.name,
        guestOS: summary.power_state ?? 'unknown',
        powerState: mapPowerState(summary.power_state),
        vCPUs: summary.cpu_count ?? 0,
        memoryGB: Math.round((summary.memory_size_MiB ?? 0) / 1024),
        disks,
        totalDiskSizeGB,
        datastoreName: primaryDatastore,
        resourcePool: '',
        network: '',
      };
    }),
  );

  // Enrich VMs with detail data for guest OS and network
  for (const vm of vms) {
    try {
      const detail = await client.getVM(vm.id);
      vm.guestOS = detail.guest_OS ?? vm.guestOS;

      if (detail.nics) {
        const firstNic = Object.values(detail.nics)[0];
        if (firstNic) {
          vm.network = firstNic.backing?.network ?? '';
        }
      }
    } catch {
      // If detail fetch fails, keep summary-level data
    }
  }

  return { vms, datastores };
}

function bytesToGB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
}

function mapPowerState(
  state: string | undefined,
): 'poweredOn' | 'poweredOff' | 'suspended' {
  switch (state) {
    case 'POWERED_ON':
      return 'poweredOn';
    case 'POWERED_OFF':
      return 'poweredOff';
    case 'SUSPENDED':
      return 'suspended';
    default:
      return 'poweredOff';
  }
}

function mapDatastoreType(type: string): 'VMFS' | 'NFS' | 'vVol' | 'vSAN' {
  switch (type) {
    case 'VMFS':
      return 'VMFS';
    case 'NFS':
    case 'NFS41':
      return 'NFS';
    case 'VVOL':
      return 'vVol';
    case 'VSAN':
      return 'vSAN';
    default:
      return 'VMFS';
  }
}

function extractDatastoreName(vmdkPath: string | undefined): string {
  if (!vmdkPath) return '';
  // VMDK paths look like "[datastore-name] vm/disk.vmdk"
  const match = vmdkPath.match(/^\[(.+?)\]/);
  return match?.[1] ?? '';
}
