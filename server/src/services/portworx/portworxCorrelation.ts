import type { Datastore } from '@vm-migration/shared';
import type { PortworxInfo } from '@vm-migration/shared';

/**
 * Correlates VMware datastores with Portworx volumes discovered via OpenShift.
 *
 * Matching strategy (in priority order):
 *  1. Datastore URL contains a Portworx node IP (most reliable for NFS datastores)
 *  2. Datastore name matches or is contained in a Portworx PV name
 *  3. Portworx PV name contains the datastore name
 *
 * Sets isPortworxBacked=true and portworxVolumeId on matched datastores.
 * When the Portworx backend is FlashArray, also sets isFlashArrayBacked=true.
 */
export function correlatePortworxToDatastores(
  datastores: Datastore[],
  portworxInfo: PortworxInfo,
): Datastore[] {
  const nodeIPs = new Set(portworxInfo.nodes.map((n) => n.ip).filter(Boolean));

  return datastores.map((ds) => {
    // Strategy 1: NFS datastore URL contains a Portworx node IP
    if (ds.url && nodeIPs.size > 0) {
      for (const ip of nodeIPs) {
        if (ds.url.includes(ip)) {
          // Find the specific volume from the NFS path (best-effort name match)
          const matchedVol = portworxInfo.volumes.find((v) =>
            ds.url!.includes(v.name) || ds.name.toLowerCase().includes(v.name.toLowerCase()),
          );
          return {
            ...ds,
            isPortworxBacked: true,
            isFlashArrayBacked: ds.isFlashArrayBacked || portworxInfo.backendType === 'flasharray',
            portworxVolumeId: matchedVol?.id,
          };
        }
      }
    }

    // Strategy 2 & 3: Name-based matching
    const dsNameLower = ds.name.toLowerCase();
    const matchedVol = portworxInfo.volumes.find((v) => {
      const pvNameLower = v.name.toLowerCase();
      return (
        pvNameLower === dsNameLower ||
        pvNameLower.includes(dsNameLower) ||
        dsNameLower.includes(pvNameLower)
      );
    });

    if (matchedVol) {
      return {
        ...ds,
        isPortworxBacked: true,
        isFlashArrayBacked: ds.isFlashArrayBacked || matchedVol.backendType === 'flasharray',
        portworxVolumeId: matchedVol.id,
      };
    }

    return ds;
  });
}
