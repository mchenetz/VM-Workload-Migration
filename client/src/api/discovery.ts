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
