import type {
  FlashArrayVolume,
  FlashArrayPerformance,
} from '@vm-migration/shared';
import { FlashArrayClient } from './FlashArrayClient.js';

export async function discoverFlashArray(
  client: FlashArrayClient,
): Promise<{
  volumes: FlashArrayVolume[];
  performance: FlashArrayPerformance;
}> {
  // Ensure the session is alive before fetching data.
  // connect() is idempotent — the 401 interceptor will also handle mid-session expiry.
  await client.connect();

  const [volumeResponse, performanceResponse] = await Promise.all([
    client.getVolumes(),
    client.getPerformance(),
  ]);

  const volumes: FlashArrayVolume[] = volumeResponse.items.map((v) => ({
    id: v.id,
    name: v.name,
    sizeGB: Math.round((v.provisioned / (1024 * 1024 * 1024)) * 100) / 100,
    dataReduction: v.space?.data_reduction ?? 1,
    thinProvisioning: v.space?.thin_provisioning ?? 0,
    source: v.source?.name,
  }));

  const perfItem = performanceResponse.items[0];

  const performance: FlashArrayPerformance = {
    readBandwidthMBs: bytesToMB(perfItem?.output_per_sec ?? 0),
    writeBandwidthMBs: bytesToMB(perfItem?.input_per_sec ?? 0),
    readIOPS: perfItem?.reads_per_sec ?? 0,
    writeIOPS: perfItem?.writes_per_sec ?? 0,
    latencyUs: perfItem?.usec_per_read_op ?? 0,
  };

  return { volumes, performance };
}

function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}
