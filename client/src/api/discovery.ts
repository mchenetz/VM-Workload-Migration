import { api } from './client';

export async function discoverVMwareVMs() {
  const { data } = await api.get('/discovery/vmware/vms');
  return data.data;
}

export async function discoverOpenShift() {
  const { data } = await api.get('/discovery/openshift/cluster');
  return data.data;
}

export async function discoverFlashArray() {
  const { data } = await api.get('/discovery/flasharray/volumes');
  return data.data;
}

export async function getCompatibility() {
  const { data } = await api.get('/discovery/compatibility');
  return data.data;
}

export async function importVMsToServer(vms: unknown[]): Promise<{ imported: number }> {
  const { data } = await api.post('/discovery/vmware/import', { vms });
  return data.data;
}

export interface VMSourceInfo {
  source: 'imported' | 'discovered' | 'none';
  availableMethods: Array<{ method: string; label: string; compatible: boolean; reason?: string }>;
  recommendedMethod: string;
}

export async function getVMSource(): Promise<VMSourceInfo> {
  const { data } = await api.get('/discovery/vmware/source');
  return data.data;
}
