import { api } from './client';
import type { ScheduleParams, MigrationSchedule, CalculationResult } from '../types/calculation';

export async function generateSchedule(
  params: ScheduleParams,
  results?: CalculationResult[],
): Promise<MigrationSchedule> {
  const { data } = await api.post('/schedule/generate', { params, results });
  return data.data as MigrationSchedule;
}

export async function exportSchedulePDF(
  schedule: MigrationSchedule,
  projectName: string,
  companyName?: string,
): Promise<Blob> {
  const { data } = await api.post(
    '/schedule/pdf',
    { schedule, projectName, companyName },
    { responseType: 'blob' },
  );
  return data as Blob;
}
