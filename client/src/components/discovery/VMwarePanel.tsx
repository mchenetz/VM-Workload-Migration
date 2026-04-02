import { useState, useMemo, useRef } from 'react';
import { useAppStore } from '../../store';
import { discoverVMwareVMs, importVMsToServer } from '../../api/discovery';
import { formatBytes } from '../../utils/formatters';
import { Card } from '../shared/Card';
import { StatusDot } from '../shared/StatusDot';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { parseVCenterCSV } from '../../utils/csvImport';
import type { VM } from '../../types/vm';

const POWER_STATE_STATUS = {
  poweredOn: 'connected',
  poweredOff: 'disconnected',
  suspended: 'connecting',
} as const;

const POWER_STATE_LABEL: Record<VM['powerState'], string> = {
  poweredOn: 'On',
  poweredOff: 'Off',
  suspended: 'Suspended',
};

function CompatibilityBadges({ vm }: { vm: VM }) {
  const badges: { label: string; color: string }[] = [];

  // VDDK is always compatible for VMware VMs
  badges.push({ label: 'VDDK', color: 'bg-blue-500/20 text-blue-400' });

  // XCopy compatible if datastore supports VAAI
  const datastores = useAppStore.getState().datastores;
  const ds = datastores.find((d) => d.name === vm.datastoreName);
  if (ds?.isVAAICapable) {
    badges.push({ label: 'XCopy', color: 'bg-purple-500/20 text-purple-400' });
  }
  if (ds?.isFlashArrayBacked) {
    badges.push({ label: 'FlashArray', color: 'bg-green-500/20 text-green-400' });
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`px-2 py-0.5 rounded text-xs font-medium ${b.color}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function VMwarePanel() {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const discoveredVMs = useAppStore((s) => s.discoveredVMs);
  const setDiscoveredVMs = useAppStore((s) => s.setDiscoveredVMs);
  const setDatastores = useAppStore((s) => s.setDatastores);
  const vmwarePlatform = useAppStore((s) =>
    s.platforms.find((p) => p.type === 'vmware'),
  );

  const isConnected = vmwarePlatform?.status === 'connected';

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const vms = parseVCenterCSV(text);
      if (vms.length === 0) {
        setImportError('No VMs found in CSV. Ensure it has Name and State columns.');
        return;
      }
      await importVMsToServer(vms);
      setDiscoveredVMs(vms);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      // Reset so the same file can be re-imported
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredVMs = useMemo(() => {
    const sorted = [...discoveredVMs].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!search.trim()) return sorted;
    const term = search.toLowerCase();
    return sorted.filter((vm) => vm.name.toLowerCase().includes(term));
  }, [discoveredVMs, search]);

  const totalDisk = useMemo(
    () => discoveredVMs.reduce((sum, vm) => sum + vm.totalDiskSizeGB, 0),
    [discoveredVMs],
  );

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await discoverVMwareVMs();
      if (data.vms) setDiscoveredVMs(data.vms);
      if (data.datastores) setDatastores(data.datastores);
    } catch {
      // Error handling delegated to API layer
    } finally {
      setLoading(false);
    }
  };

  const csvButton = (
    <button
      onClick={() => fileInputRef.current?.click()}
      disabled={importing}
      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm transition"
    >
      {importing ? 'Importing…' : 'Import CSV'}
    </button>
  );

  if (loading) return <LoadingSpinner />;

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".csv"
      className="hidden"
      onChange={handleCSVImport}
    />
  );

  if (discoveredVMs.length === 0 && !isConnected) {
    return (
      <div className="space-y-4">
        {hiddenInput}
        <EmptyState
          icon="🔌"
          title="VMware Not Connected"
          description="Connect to vCenter in Configuration to discover VMs, or import a vCenter CSV export."
          action={
            <div className="flex flex-col items-center gap-3">
              {csvButton}
              {importError && <p className="text-xs text-red-400">{importError}</p>}
              <p className="text-xs text-slate-500">
                Export from vCenter: VMs &amp; Templates view → Export CSV
              </p>
            </div>
          }
        />
      </div>
    );
  }

  if (discoveredVMs.length === 0) {
    return (
      <div className="space-y-4">
        {hiddenInput}
        <EmptyState
          icon="🔍"
          title="No VMs Discovered"
          description="No VMs discovered. Click Refresh to scan or import a CSV."
          action={
            <div className="flex gap-3 items-center">
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
              >
                Refresh
              </button>
              {csvButton}
            </div>
          }
        />
        {importError && <p className="text-xs text-red-400 text-center">{importError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hiddenInput}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-400">
          {discoveredVMs.length} VMs {discoveredVMs[0]?.datastoreName === 'imported' ? '(imported)' : 'discovered'} | {formatBytes(totalDisk)} total storage
        </p>
        <div className="flex gap-2 items-center">
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {csvButton}
          {isConnected && (
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="Filter by VM name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Guest OS</th>
                <th className="px-4 py-3 font-medium">Power State</th>
                <th className="px-4 py-3 font-medium text-right">vCPUs</th>
                <th className="px-4 py-3 font-medium text-right">Memory</th>
                <th className="px-4 py-3 font-medium text-right">Total Disk</th>
                <th className="px-4 py-3 font-medium">Datastore</th>
                <th className="px-4 py-3 font-medium">Compatibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredVMs.map((vm) => (
                <tr
                  key={vm.id}
                  className="hover:bg-slate-700/50 transition"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">
                    {vm.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    {vm.guestOS}
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot
                      status={POWER_STATE_STATUS[vm.powerState]}
                      label={POWER_STATE_LABEL[vm.powerState]}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-right">
                    {vm.vCPUs}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-right">
                    {vm.memoryGB} GB
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-right">
                    {formatBytes(vm.totalDiskSizeGB)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    {vm.datastoreName}
                  </td>
                  <td className="px-4 py-3">
                    <CompatibilityBadges vm={vm} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
