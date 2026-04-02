import type { VM } from '../types/vm';
import type { ScheduledVM } from '../types/calculation';

export type DifficultyTier = 'Easy' | 'Medium' | 'Hard' | 'Complex';

export interface DifficultyScore {
  tier: DifficultyTier;
  score: number;
  reasons: string[];
}

interface VMLike {
  guestOS: string;
  powerState: 'poweredOn' | 'poweredOff' | 'suspended';
  totalDiskSizeGB: number;
  diskCount: number;
  vCPUs: number;
  memoryGB: number;
  network: string;
}

/**
 * Categorise a guestOS string into a broad OS family.
 * vCenter guest OS strings look like:
 *   "Microsoft Windows Server 2019 (64-bit)"
 *   "Red Hat Enterprise Linux 8 (64-bit)"
 *   "Ubuntu Linux (64-bit)"
 *   "Other Linux (64-bit)"
 *   "FreeBSD (64-bit)"
 *   "VMware Photon OS (64-bit)"   ← appliance
 *   "Other (32-bit)"              ← unknown appliance
 */
function osFamily(guestOS: string): 'windows-server' | 'windows-desktop' | 'linux' | 'appliance' | 'unknown' {
  const g = guestOS.toLowerCase();

  if (g === 'unknown' || g === '') return 'unknown';

  // Windows Server variants
  if (g.includes('windows server') || g.includes('windows nt')) return 'windows-server';

  // Windows desktop/workstation
  if (g.includes('windows')) return 'windows-desktop';

  // Known Linux distros
  if (
    g.includes('linux') ||
    g.includes('ubuntu') ||
    g.includes('centos') ||
    g.includes('red hat') ||
    g.includes('rhel') ||
    g.includes('suse') ||
    g.includes('sles') ||
    g.includes('debian') ||
    g.includes('fedora') ||
    g.includes('oracle linux') ||
    g.includes('amazon linux') ||
    g.includes('coreos')
  ) {
    return 'linux';
  }

  // Appliances / exotic OSes
  if (
    g.includes('freebsd') ||
    g.includes('photon') ||
    g.includes('vmware') ||
    g.includes('esx') ||
    g.includes('netbsd') ||
    g.includes('openbsd') ||
    g.includes('solaris') ||
    g.includes('other') ||
    g.includes('appliance')
  ) {
    return 'appliance';
  }

  return 'unknown';
}

function scoreVMLike(vm: VMLike): DifficultyScore {
  let score = 0;
  const reasons: string[] = [];

  // ── OS family ──
  const family = osFamily(vm.guestOS);
  switch (family) {
    case 'windows-server':
      score += 2;
      reasons.push('Windows Server (agent/quiesce complexity)');
      break;
    case 'windows-desktop':
      score += 1;
      reasons.push('Windows Desktop');
      break;
    case 'appliance':
      score += 3;
      reasons.push('Appliance/exotic OS (may not support agents)');
      break;
    case 'unknown':
      score += 2;
      reasons.push('Unknown OS (manual validation needed)');
      break;
    // linux: +0
  }

  // ── Power state ──
  if (vm.powerState === 'poweredOn') {
    score += 1;
    reasons.push('Powered on (live migration)');
  }

  // ── Disk size ──
  if (vm.totalDiskSizeGB >= 1024) {
    score += 2;
    reasons.push(`Large disk (${vm.totalDiskSizeGB.toFixed(0)} GB > 1 TB)`);
  } else if (vm.totalDiskSizeGB >= 500) {
    score += 1;
    reasons.push(`Medium-large disk (${vm.totalDiskSizeGB.toFixed(0)} GB)`);
  }

  // ── Disk count ──
  if (vm.diskCount > 4) {
    score += 1;
    reasons.push(`Many disks (${vm.diskCount})`);
  }

  // ── vCPUs ──
  if (vm.vCPUs > 16) {
    score += 1;
    reasons.push(`High vCPU count (${vm.vCPUs})`);
  }

  // ── Memory ──
  if (vm.memoryGB > 64) {
    score += 1;
    reasons.push(`High memory (${vm.memoryGB} GB)`);
  }

  // ── Multiple NICs ──
  const nicMatch = vm.network?.match(/^(\d+)\s*NIC/i);
  if (nicMatch && parseInt(nicMatch[1], 10) > 1) {
    score += 1;
    reasons.push(`Multiple NICs (${nicMatch[1]})`);
  }

  // ── Tier thresholds ──
  let tier: DifficultyTier;
  if (score <= 1)      tier = 'Easy';
  else if (score <= 3) tier = 'Medium';
  else if (score <= 5) tier = 'Hard';
  else                 tier = 'Complex';

  return { tier, score, reasons };
}

/** Score a full VM (from VMware discovery). */
export function scoreVM(vm: VM): DifficultyScore {
  return scoreVMLike({
    guestOS: vm.guestOS,
    powerState: vm.powerState,
    totalDiskSizeGB: vm.totalDiskSizeGB,
    diskCount: vm.disks.length,
    vCPUs: vm.vCPUs,
    memoryGB: vm.memoryGB,
    network: vm.network,
  });
}

/** Score a ScheduledVM (from schedule generation). */
export function scoreScheduledVM(vm: ScheduledVM): DifficultyScore {
  return scoreVMLike({
    guestOS: vm.guestOS,
    powerState: vm.powerState,
    totalDiskSizeGB: vm.diskSizeGB,
    diskCount: vm.diskCount,
    vCPUs: vm.vCPUs,
    memoryGB: vm.memoryGB,
    network: vm.network,
  });
}

export const TIER_STYLE: Record<DifficultyTier, string> = {
  Easy:    'bg-green-500/20 text-green-400',
  Medium:  'bg-yellow-500/20 text-yellow-400',
  Hard:    'bg-orange-500/20 text-orange-400',
  Complex: 'bg-red-500/20 text-red-400',
};
