import type {
  MigrationListFilters,
  MigrationReport,
  MigrationStatus,
  ReconcileResult,
  MigrationItem,
} from '@vm-migration/shared';
import * as db from '../services/migrationTracking/db.js';
import { reconcile as runReconcile } from '../services/migrationTracking/reconciler.js';
import { getClient } from './platformController.js';
import type { VmwareClient } from '../services/vmware/VmwareClient.js';
import type { OpenshiftClient } from '../services/openshift/OpenshiftClient.js';
import { discoverOpenShift as runOSDiscovery } from '../services/openshift/openshiftDiscovery.js';
import { getCachedVMs } from './discoveryController.js';
import type { VM } from '@vm-migration/shared';

export function listMigrations(filters: MigrationListFilters = {}): MigrationItem[] {
  return db.listItems(filters);
}

export function getMigration(id: number) {
  const item = db.getItemById(id);
  if (!item) return null;
  return { item, events: db.listEventsForItem(id) };
}

export function updateMigrationStatus(
  id: number,
  status: MigrationStatus,
  reason: string,
  notes?: string,
) {
  return db.setStatus(id, status, reason, { notes });
}

/**
 * Pull fresh VMware + OpenShift inventories and reconcile.
 *
 * If VMware has not been discovered in this session, fall back to the cached
 * VM list (from `discoveryController`) so the reconciler can still mark
 * existing rows as decommissioned when things disappear.
 */
export async function reconcileNow(): Promise<ReconcileResult> {
  const vmwareClient = getClient('vmware') as VmwareClient | null;
  const osClient = getClient('openshift') as OpenshiftClient | null;

  let vmwareVMs: VM[] = getCachedVMs();
  if (vmwareClient) {
    try {
      const summaries = await vmwareClient.getVMs();
      if (summaries.length > 0) {
        vmwareVMs = await Promise.all(
          summaries.map(async (s) => {
            const detail = await vmwareClient.getVM(s.vm);
            const disks = Object.entries(detail.disks).map(([key, disk]) => ({
              id: key,
              name: disk.label,
              capacityGB: Math.round((disk.capacity || 0) / (1024 * 1024 * 1024)),
              thinProvisioned: disk.backing?.thin_provisioned ?? false,
              datastore: disk.backing?.vmdk_file?.split(']')[0]?.replace('[', '') ?? '',
            }));
            return {
              id: s.vm,
              name: detail.name,
              guestOS: detail.guest_OS,
              powerState:
                detail.power_state === 'POWERED_ON'
                  ? ('poweredOn' as const)
                  : detail.power_state === 'POWERED_OFF'
                    ? ('poweredOff' as const)
                    : ('suspended' as const),
              vCPUs: detail.cpu.count,
              memoryGB: Math.round(detail.memory.size_MiB / 1024),
              disks,
              totalDiskSizeGB: disks.reduce((n, d) => n + d.capacityGB, 0),
              datastoreName: disks[0]?.datastore ?? '',
              resourcePool: '',
              network: '',
            };
          }),
        );
      }
    } catch (err) {
      console.warn('[migrations] VMware fetch failed; using cached VMs:', err instanceof Error ? err.message : err);
    }
  }

  let openshiftVMs: import('@vm-migration/shared').OpenShiftVM[] = [];
  if (osClient) {
    try {
      const cluster = await runOSDiscovery(osClient, vmwareVMs.map((v) => v.name));
      openshiftVMs = cluster.virtualMachines;
    } catch (err) {
      console.warn('[migrations] OpenShift discovery failed:', err instanceof Error ? err.message : err);
    }
  }

  return runReconcile(vmwareVMs, openshiftVMs);
}

export function buildReport(): MigrationReport {
  const counts = db.countsByStatus();
  const disks = db.diskGBByStatus();
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      total,
      pending: counts.pending,
      in_progress: counts.in_progress,
      migrated: counts.migrated,
      failed: counts.failed,
      decommissioned: counts.decommissioned,
      migratedDiskGB: disks.migrated,
      pendingDiskGB: disks.pending,
    },
    throughput: db.weeklyThroughput(),
    stuckInProgress: db.stuckInProgress(3),
    byNamespace: db.countByNamespace(),
    recentEvents: db.listRecentEvents(25),
  };
}

export function exportCsv(filters: MigrationListFilters = {}): string {
  const items = db.listItems(filters);
  const header = [
    'id',
    'sourceId',
    'sourceName',
    'status',
    'targetNamespace',
    'targetName',
    'mtvPlan',
    'sourceVCPUs',
    'sourceMemoryGB',
    'sourceDiskGB',
    'startedAt',
    'completedAt',
    'lastSeenSourceAt',
    'lastSeenTargetAt',
    'updatedAt',
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const it of items) {
    lines.push(
      [
        it.id,
        it.sourceId,
        it.sourceName,
        it.status,
        it.targetNamespace,
        it.targetName,
        it.mtvPlan,
        it.sourceVCPUs,
        it.sourceMemoryGB,
        it.sourceDiskGB,
        it.startedAt,
        it.completedAt,
        it.lastSeenSourceAt,
        it.lastSeenTargetAt,
        it.updatedAt,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n');
}
