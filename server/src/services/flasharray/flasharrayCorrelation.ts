import type { Datastore, FlashArrayVolume, PortworxInfo, PortworxVolume } from '@vm-migration/shared';

/**
 * Correlates VMware datastores directly to FlashArray volumes.
 *
 * Covers the case where datastores are backed by FlashArray without Portworx
 * in the path (e.g. VMFS over iSCSI/FC, NFS direct from FlashArray).
 *
 * Matching strategy (in priority order):
 *  1. Exact name match (case-insensitive)
 *  2. FA volume name contains datastore name, or vice-versa
 *  3. Size match (within 2%) as tiebreaker when names partially overlap
 *
 * Sets isFlashArrayBacked=true and flashArrayVolumeId on matched datastores.
 */
export function correlateFlashArrayToDatastores(
  datastores: Datastore[],
  faVolumes: FlashArrayVolume[],
): Datastore[] {
  if (faVolumes.length === 0) return datastores;

  return datastores.map((ds) => {
    // Already matched by Portworx correlation — preserve and skip
    if (ds.isFlashArrayBacked) return ds;

    const dsName = ds.name.toLowerCase();
    const matched = findBestFAMatch(dsName, ds.capacityGB, faVolumes);

    if (matched) {
      return {
        ...ds,
        isFlashArrayBacked: true,
        flashArrayVolumeId: matched.id,
      };
    }

    return ds;
  });
}

/**
 * Correlates Portworx volumes to specific FlashArray volumes.
 *
 * When Portworx uses FlashArray as a backend, each Portworx PV maps to a
 * FlashArray volume. Matching strategy:
 *  1. Serial-based (definitive): pxctlSerialMap from pxctl+lsblk device walk
 *  2. UUID fragment matching — FA volume name contains a segment of the PV UUID
 *  3. Size match (within 2%) + name overlap as fallback
 *
 * Returns a new PortworxInfo with flashArrayVolumeId/Name populated on
 * matched volumes.
 */
export function correlateFlashArrayToPortworxVolumes(
  portworxInfo: PortworxInfo,
  faVolumes: FlashArrayVolume[],
  pxctlSerialMap?: Map<string, string>,  // portworxVolumeId → FA serial
): PortworxInfo {
  if (faVolumes.length === 0 || portworxInfo.backendType !== 'flasharray') {
    return portworxInfo;
  }

  // Build serial → FA volume lookup for fast serial-based matching
  const serialToFAVolume = new Map<string, FlashArrayVolume>();
  for (const v of faVolumes) {
    if (v.serial) serialToFAVolume.set(v.serial.toUpperCase(), v);
  }

  const updatedVolumes: PortworxVolume[] = portworxInfo.volumes.map((pv) => {
    if (pv.backendType !== 'flasharray') return pv;

    // Strategy 1: serial from pxctl device walk (most accurate)
    if (pxctlSerialMap) {
      const serial = pxctlSerialMap.get(pv.id)?.toUpperCase();
      if (serial) {
        const faVol = serialToFAVolume.get(serial);
        if (faVol) return { ...pv, flashArrayVolumeId: faVol.id, flashArrayVolumeName: faVol.name };
      }
    }

    // Strategy 2 & 3: name/size heuristics
    const matched = findFAVolumeForPortworxPV(pv, faVolumes);
    if (matched) {
      return { ...pv, flashArrayVolumeId: matched.id, flashArrayVolumeName: matched.name };
    }
    return pv;
  });

  return { ...portworxInfo, volumes: updatedVolumes };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function findBestFAMatch(
  dsNameLower: string,
  dsCapacityGB: number,
  faVolumes: FlashArrayVolume[],
): FlashArrayVolume | undefined {
  // 1. Exact name match
  const exact = faVolumes.find((v) => v.name.toLowerCase() === dsNameLower);
  if (exact) return exact;

  // 2. Name containment — collect candidates
  const nameCandidates = faVolumes.filter((v) => {
    const vName = v.name.toLowerCase();
    return vName.includes(dsNameLower) || dsNameLower.includes(vName);
  });

  if (nameCandidates.length === 1) return nameCandidates[0];

  // 3. Among name candidates, prefer size match within 2%
  if (nameCandidates.length > 1 && dsCapacityGB > 0) {
    const sizeMatch = nameCandidates.find((v) => withinPercent(v.sizeGB, dsCapacityGB, 2));
    if (sizeMatch) return sizeMatch;
    return nameCandidates[0]; // take closest name match
  }

  // 4. Size-only match — only use if unique (avoids false positives)
  if (dsCapacityGB > 0) {
    const sizeOnly = faVolumes.filter((v) => withinPercent(v.sizeGB, dsCapacityGB, 2));
    if (sizeOnly.length === 1) return sizeOnly[0];
  }

  return undefined;
}

function findFAVolumeForPortworxPV(
  pv: PortworxVolume,
  faVolumes: FlashArrayVolume[],
): FlashArrayVolume | undefined {
  // Extract meaningful UUID segments (≥8 chars) from PV name like "pvc-01f6930b-7320-4410-..."
  // Short segments (4-7 chars) cause false positives against unrelated volumes (vVols, etc.)
  const uuidSegments = pv.name.replace(/^pvc-/, '').split('-').filter((s) => s.length >= 8);

  if (uuidSegments.length > 0) {
    // 1. FA volume name contains one or more UUID segments (look for Pure CSI format px_*-pvc-*)
    const uuidMatches = faVolumes.filter((v) => {
      const vName = v.name.toLowerCase();
      return uuidSegments.some((seg) => vName.includes(seg.toLowerCase()));
    });

    if (uuidMatches.length === 1) return uuidMatches[0];

    // 2. Among UUID matches, narrow by size
    if (uuidMatches.length > 1 && pv.sizeGB > 0) {
      const sizeMatch = uuidMatches.find((v) => withinPercent(v.sizeGB, pv.sizeGB, 2));
      if (sizeMatch) return sizeMatch;
      return uuidMatches[0]; // prefer first UUID match over no match
    }
  }

  // 3. Full PV name appears in FA volume name (exact containment, not size guessing)
  const pvNameLower = pv.name.toLowerCase();
  const nameMatch = faVolumes.find((v) => v.name.toLowerCase().includes(pvNameLower));
  if (nameMatch) return nameMatch;

  return undefined;
}

function withinPercent(a: number, b: number, pct: number): boolean {
  if (b === 0) return false;
  return Math.abs(a - b) / b <= pct / 100;
}
