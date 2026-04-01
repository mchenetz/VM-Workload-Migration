import { api } from './client';

export interface ManualCalcPayload {
  vmCount: number;
  totalDiskSizeGB: number;
  tuning?: unknown;
  methods?: string[];
}

export async function calculateManual(input: ManualCalcPayload) {
  const { data } = await api.post('/calculate/manual', input);
  return data.data;
}

export async function calculateAuto(vmIds: string[], tuning?: unknown) {
  const { data } = await api.post('/calculate/auto', { vmIds, tuning });
  return data.data;
}
