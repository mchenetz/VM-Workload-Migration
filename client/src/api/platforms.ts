import { api } from './client';
import type { PlatformConnection, PlatformType } from '../types/platform';

export async function getPlatformStatus(): Promise<PlatformConnection[]> {
  const { data } = await api.get('/platforms/status');
  return data.data.platforms;
}

export async function connectPlatform(
  type: PlatformType,
  endpoint: string,
  credentials: Record<string, string>
): Promise<PlatformConnection> {
  const { data } = await api.post('/platforms/connect', { type, endpoint, credentials });
  return data.data;
}

export async function disconnectPlatform(type: PlatformType): Promise<void> {
  await api.post('/platforms/disconnect', { type });
}

export async function testPlatformConnection(
  type: PlatformType,
  endpoint: string,
  credentials: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post('/platforms/test', { type, endpoint, credentials });
  return data.data;
}
