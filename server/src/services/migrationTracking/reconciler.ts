import type {
  VM,
  OpenShiftVM,
  MigrationStatus,
  ReconcileResult,
} from '@vm-migration/shared';
import { upsertItem, listItems } from './db.js';

/**
 * Reconcile persisted migration state against the current inventories.
 *
 * Join key: VMware moref (`VM.id`) ↔ OpenShift VM. Target VMs are first matched
 * by MTV's sourceRef annotation (if present), then by case-insensitive name.
 * Status rules:
 *   - on source only                        → pending
 *   - on source and target                  → in_progress (or migrated if MTV stamped it succeeded-adjacent)
 *   - on target only (seen before on source)→ migrated
 *   - never on source, only on target       → migrated (orphan, but record it)
 *   - on neither (had been seen before)     → decommissioned
 */
export function reconcile(vmwareVMs: VM[], openshiftVMs: OpenShiftVM[]): ReconcileResult {
  const nowIso = new Date().toISOString();
  const transitions: ReconcileResult['transitions'] = [];

  const sourceByMoref = new Map(vmwareVMs.map((v) => [v.id, v]));
  const sourceNames = new Map(vmwareVMs.map((v) => [v.name.toLowerCase(), v]));

  // Track which target VMs we claim against a source, so leftovers can be detected.
  const claimedTargets = new Set<OpenShiftVM>();

  function recordTransition(
    sourceName: string,
    from: MigrationStatus | null,
    to: MigrationStatus,
    reason: string,
  ) {
    transitions.push({ sourceName, from, to, reason });
  }

  // Pass 1: every VMware VM becomes or updates a migration_item.
  for (const vm of vmwareVMs) {
    const target = findTargetForSource(vm, openshiftVMs);
    if (target) claimedTargets.add(target);

    const nextStatus: MigrationStatus = deriveStatus({ onSource: true, target });
    const reason = target
      ? `Source VM present; target ${target.namespace}/${target.name} ${target.migratedViaMTV ? 'MTV-migrated' : 'found'}`
      : 'Source VM present on VMware; no OpenShift target yet';

    const { transitioned, from } = upsertItem(
      {
        sourceId: vm.id,
        sourceName: vm.name,
        sourceGuestOS: vm.guestOS,
        sourceVCPUs: vm.vCPUs,
        sourceMemoryGB: vm.memoryGB,
        sourceDiskGB: vm.totalDiskSizeGB,
        targetNamespace: target?.namespace,
        targetName: target?.name,
        mtvPlan: target?.mtvPlanName,
        status: nextStatus,
        lastSeenSourceAt: nowIso,
        lastSeenTargetAt: target ? nowIso : undefined,
        startedAt: nextStatus === 'in_progress' ? nowIso : undefined,
      },
      reason,
    );
    if (transitioned) recordTransition(vm.name, from, nextStatus, reason);
  }

  // Pass 2: OpenShift VMs with no source on VMware.
  for (const t of openshiftVMs) {
    if (claimedTargets.has(t)) continue;
    // Only track if it looks migrated (has MTV stamps or a sourceVMwareName).
    const looksMigrated = t.migratedViaMTV || !!t.sourceVMwareName;
    if (!looksMigrated) continue;

    // Synthesize a stable key. Prefer a sourceVMwareName-matched moref if we can find it.
    const matchedSource = t.sourceVMwareName
      ? sourceNames.get(t.sourceVMwareName.toLowerCase())
      : undefined;
    const sourceId = matchedSource?.id ?? `target:${t.namespace}/${t.name}`;
    const sourceName = matchedSource?.name ?? t.sourceVMwareName ?? t.name;

    const { transitioned, from } = upsertItem(
      {
        sourceId,
        sourceName,
        targetNamespace: t.namespace,
        targetName: t.name,
        mtvPlan: t.mtvPlanName,
        status: 'migrated',
        lastSeenTargetAt: nowIso,
        completedAt: nowIso,
      },
      'Target VM on OpenShift; source no longer present on VMware',
    );
    if (transitioned) recordTransition(sourceName, from, 'migrated', 'Source gone, target on OpenShift');
  }

  // Pass 3: items previously tracked but neither on source nor target now → decommissioned.
  const persisted = listItems();
  for (const item of persisted) {
    const stillOnSource = sourceByMoref.has(item.sourceId);
    const stillOnTarget =
      !!item.targetName &&
      openshiftVMs.some(
        (t) => t.name === item.targetName && t.namespace === item.targetNamespace,
      );
    if (!stillOnSource && !stillOnTarget && item.status !== 'decommissioned' && item.status !== 'migrated') {
      const { transitioned, from } = upsertItem(
        { sourceId: item.sourceId, sourceName: item.sourceName, status: 'decommissioned' },
        'Not found on VMware or OpenShift',
      );
      if (transitioned) recordTransition(item.sourceName, from, 'decommissioned', 'Absent from both platforms');
    }
  }

  return {
    scannedSource: vmwareVMs.length,
    scannedTarget: openshiftVMs.length,
    transitions,
  };
}

function findTargetForSource(vm: VM, targets: OpenShiftVM[]): OpenShiftVM | undefined {
  const nameLower = vm.name.toLowerCase();
  // Prefer a target that MTV has already stamped with this sourceVMwareName.
  const byStamp = targets.find(
    (t) => t.sourceVMwareName && t.sourceVMwareName.toLowerCase() === nameLower,
  );
  if (byStamp) return byStamp;
  return targets.find((t) => t.name.toLowerCase() === nameLower);
}

function deriveStatus(ctx: { onSource: boolean; target?: OpenShiftVM }): MigrationStatus {
  if (ctx.onSource && !ctx.target) return 'pending';
  if (ctx.onSource && ctx.target) {
    // On both sides — migration not yet cutover. MTV stamps + Running is a decent
    // in-progress signal; we do not flip to 'migrated' until the source is gone.
    return 'in_progress';
  }
  return 'migrated';
}
