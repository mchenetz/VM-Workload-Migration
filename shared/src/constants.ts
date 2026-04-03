import type { MigrationMethod } from './types.js';

export const METHOD_LABELS: Record<MigrationMethod, string> = {
  network_copy: 'Network Copy (VDDK)',
  xcopy: 'XCopy (VAAI)',
  portworx_migration: 'Portworx Migration',
};

export const METHOD_COLORS: Record<MigrationMethod, string> = {
  network_copy: '#3b82f6',        // blue-500
  xcopy: '#a855f7',               // purple-500
  portworx_migration: '#8b5cf6',  // violet-500
};

export const METHOD_DESCRIPTIONS: Record<MigrationMethod, string> = {
  network_copy: 'Standard Forklift method. Transfers VM disks over the network via VMware VDDK.',
  xcopy: 'VMware VAAI storage primitive. Offloads copy to the storage array for faster transfers.',
  portworx_migration: 'Delta-based migration using Portworx continuous replication. Only the final delta transfers at cutover.',
};

export interface MethodInfo {
  headline: string;
  dataPath: string;
  howItWorks: string[];
  requirements: string[];
  bestFor: string;
}

export const METHOD_INFO: Record<MigrationMethod, MethodInfo> = {
  network_copy: {
    headline: 'Streams VM disk data across the network using VMware VDDK',
    dataPath: 'vCenter → network → OpenShift',
    howItWorks: [
      'MTV deploys a conversion pod in OpenShift for each VM',
      'VDDK reads each disk block-by-block from vCenter and streams it over the network',
      'Blocks are written into a new PersistentVolumeClaim in the target namespace',
      'Warm migration option: initial bulk copy runs while the VM is still live, then only changed blocks are transferred at cutover',
    ],
    requirements: [
      'Any datastore type (VMFS, NFS, vSAN)',
      'Network connectivity between vCenter and OpenShift',
      'MTV (Migration Toolkit for Virtualization) installed in OpenShift',
    ],
    bestFor: 'Any environment — this is the universal fallback compatible with all datastores',
  },
  xcopy: {
    headline: 'Offloads the disk copy to the storage array using the VAAI XCOPY primitive',
    dataPath: 'Storage array internal copy — no data crosses the ESXi network adapter',
    howItWorks: [
      'MTV issues a VAAI XCOPY command directly to the storage array',
      'The array copies data internally at array speed (typically 10–40 GB/s)',
      'No VM disk data traverses the ESXi host network or the migration network link',
      'Array signals completion; MTV creates the KubeVirt VM object in OpenShift',
    ],
    requirements: [
      'VMFS or vVol datastore (NFS and vSAN do not support VAAI XCOPY)',
      'VAAI plugin enabled on ESXi hosts',
      'Source and destination storage on the same array or array family',
      'OpenShift storage class backed by the same array (e.g. Pure Storage CSI)',
    ],
    bestFor: 'Large VMs on VMFS datastores where array-internal copy eliminates network bottlenecks',
  },
  portworx_migration: {
    headline: 'Near-zero downtime migration using Portworx continuous volume replication',
    dataPath: 'Pre-replicated — only the change-rate delta is transferred at cutover',
    howItWorks: [
      'Portworx replicates the source volume to the target OpenShift namespace asynchronously before cutover',
      'The VM continues running on vCenter while replication keeps the target in sync',
      'At cutover the VM is powered off and only the delta since the last snapshot is applied — seconds to minutes of data, not hours',
      'The target PVC is promoted from replica to primary; no bulk data movement occurs',
    ],
    requirements: [
      'Portworx Enterprise deployed in the OpenShift cluster',
      'VMware datastores exported from Portworx via NFS or iSCSI',
      'Portworx CSI driver (pxd.portworx.com) storage class in OpenShift',
      'Portworx replication pre-configured between source volume and target namespace',
    ],
    bestFor: 'Large, low-change-rate VMs where minimal cutover downtime is critical',
  },
};

// Unit conversions
export const GB_TO_BYTES = 1_073_741_824;
export const GBPS_TO_BYTES_PER_SEC = 125_000_000; // 1 Gbps = 125 MB/s

// Defaults
export const DEFAULT_TUNING = {
  concurrentTransfers: 4,
  networkBandwidthGbps: 10,
  bandwidthUtilization: 0.7,
  compressionRatio: 0.35,
  vddkOverhead: 0.12,
  xcopySpeedMultiplier: 5,
  storageIOPS: 50000,
  warmMigration: false,
  dailyChangeRate: 0.02,
  daysSinceCutover: 1,
};

export const ALL_METHODS: MigrationMethod[] = ['network_copy', 'xcopy', 'portworx_migration'];
