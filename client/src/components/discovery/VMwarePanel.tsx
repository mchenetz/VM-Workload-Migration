import { useState, useMemo, useRef } from 'react';
import { useAppStore } from '../../store';
import { discoverVMwareVMs, importVMsToServer } from '../../api/discovery';
import { formatBytes } from '../../utils/formatters';
import { Card } from '../shared/Card';
import { StatusDot } from '../shared/StatusDot';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { parseVCenterCSV } from '../../utils/csvImport';
import { scoreVM, TIER_STYLE } from '../../utils/vmDifficulty';
import type { VM } from '../../types/vm';

const CSV_EXPORT_STEPS = [
  {
    step: 1,
    title: 'Open the vSphere Client',
    detail: 'Log in to your vCenter Server via the vSphere Client (Web UI).',
  },
  {
    step: 2,
    title: 'Navigate to VMs & Templates',
    detail: 'In the left inventory panel, click the vCenter root or a Datacenter, then select the "VMs and Templates" tab at the top.',
  },
  {
    step: 3,
    title: 'Select all VMs',
    detail: 'In the list view, click the column header checkbox to select all VMs, or hold Shift/Ctrl to select a subset.',
  },
  {
    step: 4,
    title: 'Export to CSV',
    detail: 'Right-click the selection (or use the Actions menu) and choose Export → Export as CSV. Alternatively, use the toolbar: Actions → Export List.',
  },
  {
    step: 5,
    title: 'Import here',
    detail: 'Click "Import CSV" above and select the downloaded file. The tool will parse VM name, OS, CPU, memory, disk, and network from the export.',
  },
];

const CSV_REQUIRED_COLUMNS = [
  'Name', 'DNS Name', 'Power State', 'Guest OS',
  'CPUs', 'Memory', 'Provisioned Storage', 'In Use Storage',
  'Network', 'Disks',
];

function CSVExportGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-medium text-amber-300">
            How to export a VM list CSV from vCenter
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-amber-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <ol className="space-y-3">
            {CSV_EXPORT_STEPS.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="flex-none flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold mt-0.5">
                  {s.step}
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-300">{s.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-amber-900/40 pt-3">
            <p className="text-xs font-semibold text-slate-400 mb-1.5">Columns used by this tool</p>
            <div className="flex flex-wrap gap-1.5">
              {CSV_REQUIRED_COLUMNS.map((col) => (
                <span key={col} className="px-2 py-0.5 rounded bg-slate-700/60 text-xs font-mono text-slate-300">{col}</span>
              ))}
            </div>
            <p className="text-xs text-slate-500 italic mt-2">Extra columns are ignored — export the default vCenter VM list without customisation.</p>
          </div>
        </div>
      )}
    </div>
  );
}

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

const SCORING_FACTORS = [
  { label: 'Windows Server',           points: '+2', note: 'agent/quiesce complexity' },
  { label: 'Windows Desktop',          points: '+1', note: '' },
  { label: 'Appliance / BSD / Other',  points: '+3', note: 'may not support agents' },
  { label: 'Unknown OS',               points: '+2', note: 'manual validation needed' },
  { label: 'Linux',                    points:  '0', note: 'baseline' },
  { label: 'Powered on (live)',        points: '+1', note: '' },
  { label: 'Disk > 1 TB',             points: '+2', note: '' },
  { label: 'Disk 500 GB – 1 TB',      points: '+1', note: '' },
  { label: 'More than 4 disks',       points: '+1', note: '' },
  { label: 'vCPUs > 16',              points: '+1', note: '' },
  { label: 'Memory > 64 GB',          points: '+1', note: '' },
  { label: 'Multiple NICs',           points: '+1', note: '' },
];

const TIER_THRESHOLDS = [
  { tier: 'Easy',    range: '0 – 1', color: 'text-green-400' },
  { tier: 'Medium',  range: '2 – 3', color: 'text-yellow-400' },
  { tier: 'Hard',    range: '4 – 5', color: 'text-orange-400' },
  { tier: 'Complex', range: '6 +',   color: 'text-red-400' },
];

function DifficultyInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 w-4 h-4 rounded-full bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white text-[10px] font-bold leading-none flex items-center justify-center transition-colors"
        title="Scoring factors"
        aria-label="Show difficulty scoring factors"
      >
        i
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          {/* Popover */}
          <div className="absolute z-30 right-6 top-0 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 text-xs text-slate-300">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-100 text-sm">Difficulty Scoring</span>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-base leading-none">✕</button>
            </div>

            <p className="text-slate-400 mb-3">
              Each VM is scored on the factors below. The total determines its migration tier.
            </p>

            <table className="w-full mb-3">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left pb-1 font-medium">Factor</th>
                  <th className="text-right pb-1 font-medium pr-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {SCORING_FACTORS.map((f) => (
                  <tr key={f.label} className="border-b border-slate-800/60">
                    <td className="py-1">
                      {f.label}
                      {f.note && <span className="text-slate-500 ml-1">({f.note})</span>}
                    </td>
                    <td className={`py-1 text-right pr-2 font-mono font-semibold ${f.points === '0' ? 'text-slate-500' : 'text-blue-400'}`}>
                      {f.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-1">
              {TIER_THRESHOLDS.map((t) => (
                <div key={t.tier} className="flex items-center gap-2 bg-slate-800 rounded px-2 py-1">
                  <span className={`font-semibold ${t.color}`}>{t.tier}</span>
                  <span className="text-slate-500">{t.range}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

function DifficultyBadge({ vm }: { vm: VM }) {
  const { tier, score, reasons } = scoreVM(vm);
  return (
    <div className="group relative inline-block">
      <span className={`px-2 py-0.5 rounded text-xs font-medium cursor-default ${TIER_STYLE[tier]}`}>
        {tier}
      </span>
      {/* Tooltip */}
      <div className="absolute z-10 left-0 top-full mt-1 hidden group-hover:block w-56 bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-xl text-xs text-slate-300">
        <p className="font-semibold mb-1 text-slate-200">Score: {score}</p>
        {reasons.length === 0
          ? <p className="text-slate-500">No complexity factors</p>
          : <ul className="space-y-0.5">
              {reasons.map((r) => <li key={r} className="text-slate-400">• {r}</li>)}
            </ul>
        }
      </div>
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
  const isImported = discoveredVMs.length > 0 && discoveredVMs[0]?.datastoreName === 'imported';

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
        <CSVExportGuide />
        <EmptyState
          icon="🔌"
          title="VMware Not Connected"
          description="Connect to vCenter in Configuration to discover VMs, or import a vCenter CSV export."
          action={
            <div className="flex flex-col items-center gap-3">
              {csvButton}
              {importError && <p className="text-xs text-red-400">{importError}</p>}
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
        <CSVExportGuide />
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
      <CSVExportGuide />
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
                <th className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-0.5">
                    Difficulty
                    <DifficultyInfoButton />
                  </span>
                </th>
                {!isImported && <th className="px-4 py-3 font-medium">Compatibility</th>}
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
                    <DifficultyBadge vm={vm} />
                  </td>
                  {!isImported && (
                    <td className="px-4 py-3">
                      <CompatibilityBadges vm={vm} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
