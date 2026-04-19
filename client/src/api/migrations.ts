import { api } from './client';
import type {
  MigrationItem,
  MigrationReport,
  MigrationStatus,
  ReconcileResult,
} from '../types/migration';

export interface MigrationFilters {
  status?: MigrationStatus[];
  namespace?: string;
  search?: string;
}

function queryString(filters: MigrationFilters): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status.length) params.set('status', filters.status.join(','));
  if (filters.namespace) params.set('namespace', filters.namespace);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function listMigrations(filters: MigrationFilters = {}): Promise<MigrationItem[]> {
  const { data } = await api.get(`/migrations${queryString(filters)}`);
  return data.data;
}

export async function getReport(): Promise<MigrationReport> {
  const { data } = await api.get('/migrations/report');
  return data.data;
}

export async function reconcileNow(): Promise<ReconcileResult> {
  const { data } = await api.post('/migrations/reconcile');
  return data.data;
}

export async function updateMigration(
  id: number,
  body: { status: MigrationStatus; reason: string; notes?: string },
): Promise<MigrationItem> {
  const { data } = await api.patch(`/migrations/${id}`, body);
  return data.data;
}

export function csvExportUrl(filters: MigrationFilters = {}): string {
  return `/api/migrations/export.csv${queryString(filters)}`;
}
