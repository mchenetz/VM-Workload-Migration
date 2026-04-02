import type { VM } from '../types/vm';

/** Parse a size string like "258.03 GB", "4.55 TB", "17.08 GB", "0 B" into GB */
function parseSizeGB(raw: string): number {
  const s = raw.trim();
  const match = s.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  switch (unit) {
    case 'TB': return value * 1024;
    case 'GB': return value;
    case 'MB': return value / 1024;
    case 'KB': return value / (1024 * 1024);
    default: return 0;
  }
}

function parsePowerState(state: string): VM['powerState'] {
  const s = state.trim().toLowerCase();
  if (s === 'powered on') return 'poweredOn';
  if (s === 'powered off') return 'poweredOff';
  if (s === 'suspended') return 'suspended';
  return 'poweredOff';
}

/**
 * Parse a vCenter CSV export. Recognized columns (case-insensitive):
 *   Name, State, Provisioned Space, Host Mem, Guest OS, CPUs, NICs
 * All columns are optional except Name.
 */
export function parseVCenterCSV(text: string): VM[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (needle: string) => header.indexOf(needle);
  const colContains = (substr: string) => header.findIndex((h) => h.includes(substr));

  const nameIdx      = col('name');
  const stateIdx     = col('state');
  const provisionedIdx = colContains('provisioned');
  const memIdx       = colContains('mem');
  const guestOSIdx   = colContains('guest os');
  const cpuIdx       = col('cpus');
  const nicIdx       = col('nics');

  if (nameIdx === -1) return [];

  const vms: VM[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;

    const name = parts[nameIdx]?.trim();
    if (!name) continue;

    const powerState     = stateIdx     !== -1 ? parsePowerState(parts[stateIdx]     ?? '') : 'poweredOff';
    const totalDiskSizeGB = provisionedIdx !== -1 ? parseSizeGB(parts[provisionedIdx] ?? '') : 0;
    const memoryGB       = memIdx       !== -1 ? parseSizeGB(parts[memIdx]           ?? '') : 0;
    const guestOS        = guestOSIdx   !== -1 ? (parts[guestOSIdx]?.trim() || 'unknown') : 'unknown';
    const vCPUs          = cpuIdx       !== -1 ? (parseInt(parts[cpuIdx] ?? '0', 10) || 0) : 0;

    const id = `csv-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${i}`;

    const vm: VM = {
      id,
      name,
      guestOS,
      powerState,
      vCPUs,
      memoryGB: parseFloat(memoryGB.toFixed(2)),
      disks: [
        {
          id: `${id}-disk-0`,
          name: 'Hard disk 1',
          capacityGB: totalDiskSizeGB,
          thinProvisioned: true,
          datastore: 'imported',
        },
      ],
      totalDiskSizeGB: parseFloat(totalDiskSizeGB.toFixed(2)),
      datastoreName: 'imported',
      resourcePool: '',
      network: '',
    };

    // Attach NIC count as network hint if available
    if (nicIdx !== -1) {
      const nics = parseInt(parts[nicIdx] ?? '0', 10);
      if (nics > 0) vm.network = `${nics} NIC${nics > 1 ? 's' : ''}`;
    }

    vms.push(vm);
  }

  return vms;
}
