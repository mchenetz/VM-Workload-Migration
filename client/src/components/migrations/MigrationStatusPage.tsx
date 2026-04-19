import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../shared/Card';
import {
  csvExportUrl,
  getReport,
  listMigrations,
  reconcileNow,
  updateMigration,
} from '../../api/migrations';
import type {
  MigrationItem,
  MigrationReport,
  MigrationStatus,
  ReconcileResult,
} from '../../types/migration';

const STATUS_ORDER: MigrationStatus[] = [
  'pending',
  'in_progress',
  'migrated',
  'failed',
  'decommissioned',
];

const STATUS_STYLE: Record<MigrationStatus, string> = {
  pending: 'bg-slate-700 text-slate-200',
  in_progress: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  migrated: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  failed: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
  decommissioned: 'bg-slate-500/20 text-slate-300 border border-slate-500/40',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
}

export function MigrationStatusPage() {
  const [items, setItems] = useState<MigrationItem[]>([]);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<MigrationStatus[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileSummary, setReconcileSummary] = useState<ReconcileResult | null>(null);

  const filters = useMemo(
    () => ({
      status: statusFilter.length ? statusFilter : undefined,
      search: search.trim() || undefined,
    }),
    [statusFilter, search],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, rep] = await Promise.all([listMigrations(filters), getReport()]);
      setItems(list);
      setReport(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load migrations');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleReconcile = async () => {
    setReconciling(true);
    setError(null);
    try {
      const result = await reconcileNow();
      setReconcileSummary(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleStatusChange = async (item: MigrationItem, status: MigrationStatus) => {
    if (status === item.status) return;
    const reason = window.prompt(
      `Reason for marking "${item.sourceName}" as ${status}?`,
      'Manual override',
    );
    if (!reason) return;
    try {
      await updateMigration(item.id, { status, reason });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const toggleStatusFilter = (s: MigrationStatus) => {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const totals = report?.totals;

  return (
    <AppShell title="Migration Status">
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {STATUS_ORDER.map((s) => (
            <Card key={s} className="!p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {s.replace('_', ' ')}
              </div>
              <div className="text-3xl font-semibold text-slate-100 mt-1">
                {totals ? totals[s] : '—'}
              </div>
            </Card>
          ))}
        </div>

        {/* Action bar */}
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {reconciling ? 'Reconciling…' : 'Reconcile now'}
            </button>
            <a
              href={csvExportUrl(filters)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
            >
              Export CSV
            </a>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search VM name…"
              className="flex-1 min-w-[200px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => {
                const active = statusFilter.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      active ? STATUS_STYLE[s] : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {reconcileSummary && (
            <div className="mt-4 text-sm text-slate-300">
              Scanned {reconcileSummary.scannedSource} source VMs,{' '}
              {reconcileSummary.scannedTarget} OpenShift VMs —{' '}
              <span className="text-blue-300">
                {reconcileSummary.transitions.length} transition
                {reconcileSummary.transitions.length === 1 ? '' : 's'}
              </span>
              .
            </div>
          )}
          {error && <div className="mt-3 text-sm text-rose-400">{error}</div>}
        </Card>

        {/* Report strip */}
        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Disk volume">
              <div className="space-y-1 text-sm text-slate-300">
                <div>
                  Migrated:{' '}
                  <span className="text-slate-100 font-semibold">
                    {report.totals.migratedDiskGB.toLocaleString()} GB
                  </span>
                </div>
                <div>
                  Pending:{' '}
                  <span className="text-slate-100 font-semibold">
                    {report.totals.pendingDiskGB.toLocaleString()} GB
                  </span>
                </div>
              </div>
            </Card>
            <Card title="Throughput (last 12 wks)">
              {report.throughput.length === 0 ? (
                <div className="text-sm text-slate-400">No migration events yet.</div>
              ) : (
                <ul className="text-sm text-slate-300 space-y-1">
                  {report.throughput.slice(0, 6).map((t) => (
                    <li key={t.weekStart} className="flex justify-between">
                      <span className="text-slate-400">Week of {t.weekStart}</span>
                      <span className="text-slate-100 font-semibold">{t.migratedCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Stuck > 3 days in-progress">
              {report.stuckInProgress.length === 0 ? (
                <div className="text-sm text-slate-400">No stuck migrations.</div>
              ) : (
                <ul className="text-sm text-slate-300 space-y-1">
                  {report.stuckInProgress.slice(0, 6).map((s) => (
                    <li key={s.sourceName} className="flex justify-between">
                      <span>{s.sourceName}</span>
                      <span className="text-amber-300">{s.daysInProgress}d</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* Items table */}
        <Card title={`Migrations (${items.length})`}>
          {loading ? (
            <div className="text-slate-400 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-slate-400 text-sm">
              No migration items tracked yet. Run <em>Reconcile now</em> after discovering VMware
              and OpenShift to populate this list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Disk (GB)</th>
                    <th className="py-2 pr-3 font-medium">Last seen</th>
                    <th className="py-2 pr-3 font-medium">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-800">
                      <td className="py-2 pr-3">
                        <div className="text-slate-100">{it.sourceName}</div>
                        <div className="text-xs text-slate-500 font-mono">{it.sourceId}</div>
                      </td>
                      <td className="py-2 pr-3 text-slate-300">
                        {it.targetName ? (
                          <>
                            <div>{it.targetName}</div>
                            <div className="text-xs text-slate-500">{it.targetNamespace}</div>
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_STYLE[it.status]}`}
                        >
                          {it.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-300">
                        {it.sourceDiskGB?.toLocaleString() ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">
                        <div>src: {formatDate(it.lastSeenSourceAt)}</div>
                        <div>tgt: {formatDate(it.lastSeenTargetAt)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={it.status}
                          onChange={(e) =>
                            handleStatusChange(it, e.target.value as MigrationStatus)
                          }
                          className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100"
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {s.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
