import type {
  MigrationSchedule,
  ScheduleParams,
  ScheduleWindow,
  ScheduledVM,
} from '@vm-migration/shared';
import type { VM } from '@vm-migration/shared';
import type { CalculationResult } from '@vm-migration/shared';

/** Build a full migration schedule from discovered VMs and calculation results. */
export function buildSchedule(
  vms: VM[],
  results: CalculationResult[],
  params: ScheduleParams,
): MigrationSchedule {
  // For each VM, pick the fastest compatible method (falling back to network_copy)
  const preferredResult =
    results.find((r) => r.method === params.preferredMethod && r.compatible) ??
    results.find((r) => r.compatible) ??
    results[0];

  const scheduledVMs: ScheduledVM[] = vms.map((vm) => {
    // Per-VM override takes priority over preferred method
    const overrideMethod = params.vmMethodOverrides?.[vm.id];
    const methodResult = overrideMethod
      ? (results.find((r) => r.method === overrideMethod && r.compatible) ?? preferredResult)
      : preferredResult;
    const vmResult = methodResult.perVMResults.find((r) => r.vmId === vm.id);
    const estimatedMinutes = vmResult
      ? Math.max(1, Math.ceil(vmResult.estimatedSeconds / 60))
      : Math.max(1, Math.ceil((vm.totalDiskSizeGB / 10) * 60)); // fallback: 1 min per 10 GB
    return {
      vmId: vm.id,
      vmName: vm.name,
      guestOS: vm.guestOS,
      vCPUs: vm.vCPUs,
      memoryGB: vm.memoryGB,
      diskCount: vm.disks.length,
      network: vm.network,
      powerState: vm.powerState,
      diskSizeGB: vm.totalDiskSizeGB,
      estimatedMinutes,
      method: overrideMethod ?? preferredResult.method,
    };
  });

  // Sort largest-first so big VMs don't get stranded at the end of days
  scheduledVMs.sort((a, b) => b.diskSizeGB - a.diskSizeGB);

  const windowMinutes = windowDuration(params.windowStart, params.windowEnd);
  const windows: ScheduleWindow[] = [];

  let vmQueue = [...scheduledVMs];
  let currentDate = parseDate(params.startDate);

  while (vmQueue.length > 0) {
    if (isWorkDay(currentDate, params.workDays)) {
      const window = fillWindow(vmQueue, params, windowMinutes, currentDate);
      vmQueue = vmQueue.slice(window.vms.length);
      windows.push(window);
    }
    currentDate = nextDay(currentDate);

    // Safety valve — never loop more than 2 years
    if (windows.length > 730) break;
  }

  const completionDate = windows.length > 0 ? windows[windows.length - 1].date : params.startDate;
  const startDt = parseDate(params.startDate);
  const endDt = parseDate(completionDate);
  const totalDays = Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000) + 1;

  return {
    generatedAt: new Date().toISOString(),
    startDate: params.startDate,
    completionDate,
    totalDays,
    windows,
    params,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fillWindow(
  queue: ScheduledVM[],
  params: ScheduleParams,
  windowMinutes: number,
  date: Date,
): ScheduleWindow {
  const assigned: ScheduledVM[] = [];
  let minutesUsed = 0;
  let slot = 0;

  for (const vm of queue) {
    if (assigned.length >= params.maxConcurrent) break;
    const needed = vm.estimatedMinutes + (slot > 0 ? params.bufferMinutes : 0);
    if (minutesUsed + needed > windowMinutes) break;
    minutesUsed += needed;
    assigned.push(vm);
    slot++;
  }

  // If nothing fits (single VM larger than window), force-assign just that VM
  if (assigned.length === 0 && queue.length > 0) {
    assigned.push(queue[0]);
    minutesUsed = queue[0].estimatedMinutes;
  }

  return {
    date: formatDate(date),
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    vms: assigned,
    totalMinutes: minutesUsed,
  };
}

function windowDuration(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function parseDate(iso: string): Date {
  // Parse as local date to avoid timezone shifts
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextDay(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return next;
}

function isWorkDay(d: Date, workDays: number[]): boolean {
  return workDays.includes(d.getDay());
}
