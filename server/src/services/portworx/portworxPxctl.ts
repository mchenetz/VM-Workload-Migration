import type { OpenshiftClient } from '../openshift/OpenshiftClient.js';
import type { PortworxInfo } from '@vm-migration/shared';

/**
 * Builds a map of Portworx volume ID → FlashArray volume serial using pxctl.
 *
 * Works for iSCSI/FC clusters where pool backing devices are DM-MPATH paths
 * like `/dev/mapper/3624a937...` (the 32-char hex encodes the FA WWN/serial).
 *
 * For NVMe-oF clusters (devices appear as `/dev/mapper/eui.xxx`), the EUI
 * doesn't directly embed the FA serial, so this returns an empty map.
 * In that case, UUID-fragment matching in flasharrayCorrelation.ts handles
 * volumes created via the Pure Storage CSI driver (px_*-pvc-* naming).
 *
 * Returns Map<portworxVolumeId, faSerial> for all volumes that could be linked.
 */
export async function buildPortworxToFASerialMap(
  client: OpenshiftClient,
  portworxInfo: PortworxInfo,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (portworxInfo.backendType !== 'flasharray') return result;

  const pxNamespace = portworxInfo.clusterName ? await findPxNamespace(client) : 'kube-system';
  if (!pxNamespace) return result;

  const pod = await client.findPortworxPod(pxNamespace);
  if (!pod) {
    console.warn('[portworx] No running Portworx pod found for pxctl exec');
    return result;
  }

  console.log(`[portworx] Running pxctl correlation via pod "${pod}" in "${pxNamespace}"`);

  try {
    // 1. Get pool → device path mapping
    const poolDeviceMap = await getPoolDeviceMap(client, pxNamespace, pod);
    if (poolDeviceMap.size === 0) return result;

    // 2. Build pool → FA serial
    const poolSerialMap = new Map<string, string>();

    // Fast path: DM-MPATH device names on iSCSI/FC clusters encode the WWN directly.
    // /dev/mapper/3624a937... → strip leading '3' → 624A937... = FA serial (32 hex = 16 bytes NAA-6).
    // NVMe-oF clusters use /dev/mapper/eui.xxx format — EUI doesn't embed FA serial the same way.
    const dmPools: string[] = [];
    for (const [poolId, dev] of poolDeviceMap) {
      const dmMatch = dev.match(/\/dev\/mapper\/3([0-9a-fA-F]{32})/);
      if (dmMatch) {
        poolSerialMap.set(poolId, dmMatch[1].toUpperCase());
      } else {
        dmPools.push(poolId);
      }
    }

    // Slow path: look up non-DM devices via /dev/disk/by-id WWN symlinks or lsblk
    if (dmPools.length > 0) {
      const deviceSerialMap = await getDeviceSerialMap(client, pxNamespace, pod);
      for (const poolId of dmPools) {
        const dev = poolDeviceMap.get(poolId)!;
        const devBase = dev.replace(/^\/dev\//, '');
        const serial = deviceSerialMap.get(devBase) ?? deviceSerialMap.get(dev);
        if (serial) poolSerialMap.set(poolId, serial);
      }
    }

    if (poolSerialMap.size === 0) {
      console.log(`[portworx] No FA serials from pool devices (NVMe-oF EUI format not supported via this path)`);
      return result;
    }
    console.log(`[portworx] Pool serial map: ${poolSerialMap.size} entries`);

    // 4. Get volume → pool mapping and build final map
    const volumePoolMap = await getVolumePoolMap(client, pxNamespace, pod);
    for (const [pxVolId, poolId] of volumePoolMap) {
      const serial = poolSerialMap.get(poolId);
      if (serial) result.set(pxVolId, serial);
    }
  } catch (err) {
    console.warn('[portworx] pxctl correlation failed:', err instanceof Error ? err.message : err);
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function findPxNamespace(client: OpenshiftClient): Promise<string | null> {
  const candidates = ['portworx', 'kube-system', 'px-system', 'px', 'px-backup', 'portworx-system'];
  for (const ns of candidates) {
    const pod = await client.findPortworxPod(ns);
    if (pod) {
      console.log(`[portworx] found Portworx pod "${pod}" in namespace "${ns}"`);
      return ns;
    }
  }
  // Last resort: search all namespaces
  try {
    const allNsRes = await (client as unknown as { api: { get: (p: string) => Promise<{ data: { items: Array<{ metadata: { name: string } }> } }> } }).api.get('/api/v1/namespaces');
    const namespaces: string[] = allNsRes.data.items.map((n: { metadata: { name: string } }) => n.metadata.name);
    for (const ns of namespaces) {
      if (candidates.includes(ns)) continue; // already tried
      const pod = await client.findPortworxPod(ns);
      if (pod) {
        console.log(`[portworx] found Portworx pod "${pod}" in namespace "${ns}"`);
        return ns;
      }
    }
  } catch { /* ignore */ }
  console.warn('[portworx] no Portworx pod found in any namespace');
  return null;
}

/**
 * Runs `pxctl sv pool show` and parses pool ID → primary backing device.
 * Example output line:
 *   Pool 0:  ... Device: /dev/sdb  ...
 */
async function getPoolDeviceMap(
  client: OpenshiftClient,
  ns: string,
  pod: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { stdout } = await client.execInPod(ns, pod, ['pxctl', 'sv', 'pool', 'show'], 'portworx');

    let currentPool: string | null = null;
    for (const line of stdout.split('\n')) {
      // Match "Pool 0:", "Pool ID: 0", "Pool: 0"
      const poolMatch = line.match(/Pool\s*(?:ID)?[\s:]+(\d+)/i);
      if (poolMatch) { currentPool = poolMatch[1]; continue; }
      if (!currentPool) continue;
      // Match "Device:" / "dev:" / "Drives:" lines — allow full path including /dev/mapper/xxx
      const devKV = line.match(/(?:Device|dev|Drives?)[\s:]+(\S+)/i);
      if (devKV && devKV[1].startsWith('/dev/')) {
        if (!map.has(currentPool)) map.set(currentPool, devKV[1]);
        continue;
      }
      // Match numbered drive entries like "0: /dev/sdb ..." or "1:  /dev/mapper/3624a937..."
      const numDrive = line.match(/^\s*\d+:\s+(\/dev\/\S+)/);
      if (numDrive) {
        if (!map.has(currentPool)) map.set(currentPool, numDrive[1]);
      }
    }

    // Fallback: try pxctl status if pool show returned nothing
    if (map.size === 0 && stdout.length < 50) {
      const { stdout: statusOut } = await client.execInPod(ns, pod, ['pxctl', 'status'], 'portworx');
      let statusPool = '0';
      for (const line of statusOut.split('\n')) {
        const spoolMatch = line.match(/Pool\s*(?:ID)?[\s:]+(\d+)/i);
        if (spoolMatch) { statusPool = spoolMatch[1]; continue; }
        const sdriveMatch = line.match(/^\s*\d+:\s+(\/dev\/\S+)/);
        if (sdriveMatch && !map.has(statusPool)) map.set(statusPool, sdriveMatch[1]);
      }
    }
  } catch (err) {
    console.warn('[portworx] pool show failed:', err instanceof Error ? err.message : err);
  }
  return map;
}

/**
 * Reads /dev/disk/by-id/ symlinks to build device-name → FA serial map.
 * WWN entries look like: wwn-0x6624a937... -> ../../sdb
 * The serial is: strip "naa." or "0x", uppercase = FlashArray serial
 */
async function getDeviceSerialMap(
  client: OpenshiftClient,
  ns: string,
  pod: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { stdout } = await client.execInPod(
      ns, pod,
      ['ls', '-la', '/dev/disk/by-id/'],
      'portworx',
    );
    for (const line of stdout.split('\n')) {
      // Match: wwn-0x6624a937... -> ../../sdb
      const m = line.match(/wwn-0x([0-9a-fA-F]{16,32})\s+->\s+.*\/(\w+)$/);
      if (m) {
        const serial = m[1].toUpperCase(); // FlashArray serial format
        const dev = m[2];                  // e.g., "sdb" or "dm-3"
        map.set(dev, serial);
      }
    }

    // Fallback: try lsblk if by-id had nothing useful
    if (map.size === 0) {
      const { stdout: lsblkOut } = await client.execInPod(
        ns, pod,
        ['lsblk', '-J', '-o', 'NAME,SERIAL,TYPE'],
        'portworx',
      );
      try {
        const parsed = JSON.parse(lsblkOut) as { blockdevices: Array<{ name: string; serial?: string; type: string }> };
        for (const dev of parsed.blockdevices ?? []) {
          if (dev.serial && dev.type === 'disk') {
            map.set(dev.name, dev.serial.trim().toUpperCase().replace(/^NAA\./, ''));
          }
        }
      } catch { /* lsblk JSON parse failed */ }
    }
  } catch (err) {
    console.warn('[portworx] device serial map failed:', err instanceof Error ? err.message : err);
  }
  return map;
}

/**
 * Runs `pxctl v l` and parses volume ID → pool ID.
 * Output columns: ID  NAME  SIZE  HA  SHARED  ENCRYPTED  IO_PRIORITY  STATUS  SNAP-ENABLED
 * Pool info appears in `pxctl v i <id>` — we use a batch approach with pool show cross-ref.
 *
 * For efficiency, parse `pxctl v l` to get IDs, then cross-reference with pool membership
 * via the replica set info in `pxctl v i`.
 *
 * Since running v i for 100+ volumes is slow, we instead use `pxctl v i` on a sample and
 * rely on pool show data already gathered — most volumes in a single-pool cluster will all
 * share the same pool, so a single mapping covers them all.
 */
async function getVolumePoolMap(
  client: OpenshiftClient,
  ns: string,
  pod: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // Try JSON output first (newer pxctl versions)
    const { stdout: listOut } = await client.execInPod(
      ns, pod,
      ['pxctl', 'v', 'l', '--json'],
      'portworx',
    );

    interface PxVolEntry { id: string; replica_sets?: Array<{ nodes?: Array<{ pool?: number | string }> }> }
    let volumes: PxVolEntry[] = [];
    try {
      const parsed = JSON.parse(listOut);
      volumes = Array.isArray(parsed) ? parsed : (parsed.volumes ?? []);
    } catch { /* fall through to text parsing */ }

    if (volumes.length > 0) {
      for (const vol of volumes) {
        const pool = vol.replica_sets?.[0]?.nodes?.[0]?.pool;
        if (vol.id && pool !== undefined) {
          map.set(String(vol.id), String(pool));
        }
      }
      return map;
    }

    // Text fallback: inspect a sample of volumes to determine pool assignment
    const { stdout: textOut } = await client.execInPod(
      ns, pod,
      ['pxctl', 'v', 'l'],
      'portworx',
    );

    const volIds: string[] = [];
    for (const line of textOut.split('\n').slice(1)) { // skip header
      const cols = line.trim().split(/\s+/);
      if (cols[0] && /^\d{10,}$/.test(cols[0])) volIds.push(cols[0]);
    }

    // Sample up to 5 volumes to find pool assignment — in practice one pool covers all
    const sample = volIds.slice(0, 5);
    for (const id of sample) {
      const { stdout: infoOut } = await client.execInPod(
        ns, pod,
        ['pxctl', 'v', 'i', id],
        'portworx',
      );
      const poolMatch = infoOut.match(/Pool\s+(\d+)/i);
      if (poolMatch) {
        // Apply this pool to all volumes (works for single-pool clusters)
        for (const vid of volIds) map.set(vid, poolMatch[1]);
        break;
      }
    }
  } catch (err) {
    console.warn('[portworx] volume list failed:', err instanceof Error ? err.message : err);
  }
  return map;
}
