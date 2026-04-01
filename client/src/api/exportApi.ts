import { api } from './client';

export async function exportPDF(results: unknown, options: Record<string, unknown>): Promise<Blob> {
  const { data } = await api.post('/export/pdf', { results, options }, {
    responseType: 'blob',
  });
  return data;
}
