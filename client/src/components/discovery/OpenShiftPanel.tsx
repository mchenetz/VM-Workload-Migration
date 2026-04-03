import { useState } from 'react';
import { useAppStore } from '../../store';
import { discoverOpenShift } from '../../api/discovery';
import { Card } from '../shared/Card';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatNumber } from '../../utils/formatters';

interface StorageClass {
  name: string;
  provisioner: string;
  isDefault: boolean;
  bindingMode: string;
}

interface PortworxVolume {
  id: string;
  name: string;
  sizeGB: number;
  replicationFactor: number;
  backendType: string;
  ioProfile: string;
  state: string;
}

interface PortworxNode {
  id: string;
  hostname: string;
  ip: string;
  poolCount: number;
  totalCapacityGB: number;
  usedCapacityGB: number;
}

interface PortworxInfo {
  installed: boolean;
  version: string;
  clusterName: string;
  backendType: string;
  nodeCount: number;
  totalCapacityGB: number;
  usedCapacityGB: number;
  volumes: PortworxVolume[];
  nodes: PortworxNode[];
}

interface ClusterData {
  nodeCount: number;
  totalCPU: number;
  totalMemoryGB: number;
  storageClasses: StorageClass[];
  mtvInstalled: boolean;
  portworxInfo?: PortworxInfo;
}

function PortworxSection({ info }: { info: PortworxInfo }) {
  const [showVolumes, setShowVolumes] = useState(false);
  const [showNodes, setShowNodes] = useState(false);

  const backendColor =
    info.backendType === 'flasharray'
      ? 'text-green-400 bg-green-500/20'
      : info.backendType === 'cloud'
        ? 'text-blue-400 bg-blue-500/20'
        : 'text-slate-400 bg-slate-500/20';

  const backendLabel =
    info.backendType === 'flasharray'
      ? 'FlashArray'
      : info.backendType === 'cloud'
        ? 'Cloud'
        : 'Generic';

  return (
    <Card title="Portworx Enterprise">
      <div className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase mb-1">Version</p>
            <p className="text-sm font-semibold text-slate-200">{info.version}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase mb-1">Cluster</p>
            <p className="text-sm font-semibold text-slate-200 truncate">{info.clusterName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase mb-1">Backend</p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${backendColor}`}>
              {backendLabel}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase mb-1">Storage</p>
            <p className="text-sm font-semibold text-slate-200">
              {info.totalCapacityGB > 0
                ? `${formatNumber(info.usedCapacityGB)} / ${formatNumber(info.totalCapacityGB)} GB`
                : info.usedCapacityGB > 0
                  ? `${formatNumber(info.usedCapacityGB)} GB provisioned`
                  : '—'}
            </p>
          </div>
        </div>

        {/* Nodes */}
        <div>
          <button
            onClick={() => setShowNodes((v) => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <svg className={`w-3 h-3 transition-transform ${showNodes ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {info.nodeCount} storage node{info.nodeCount !== 1 ? 's' : ''}
          </button>
          {showNodes && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-3 py-2 font-medium">Hostname</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                    <th className="px-3 py-2 font-medium text-right">Pools</th>
                    <th className="px-3 py-2 font-medium text-right">Used / Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {info.nodes.map((node) => (
                    <tr key={node.id} className="hover:bg-slate-700/50 transition">
                      <td className="px-3 py-2 text-slate-200 text-sm font-medium">{node.hostname}</td>
                      <td className="px-3 py-2 text-slate-400 text-sm font-mono">{node.ip || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-sm text-right">{node.poolCount}</td>
                      <td className="px-3 py-2 text-slate-400 text-sm text-right">
                        {formatNumber(node.usedCapacityGB)} / {formatNumber(node.totalCapacityGB)} GB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Volumes */}
        <div>
          <button
            onClick={() => setShowVolumes((v) => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <svg className={`w-3 h-3 transition-transform ${showVolumes ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {info.volumes.length} volume{info.volumes.length !== 1 ? 's' : ''}
          </button>
          {showVolumes && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                    <th className="px-3 py-2 font-medium text-right">Repl</th>
                    <th className="px-3 py-2 font-medium">Backend</th>
                    <th className="px-3 py-2 font-medium">I/O Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {info.volumes.map((vol) => (
                    <tr key={vol.id} className="hover:bg-slate-700/50 transition">
                      <td className="px-3 py-2 text-slate-200 text-sm font-medium">{vol.name}</td>
                      <td className="px-3 py-2 text-slate-400 text-sm text-right">{vol.sizeGB} GB</td>
                      <td className="px-3 py-2 text-slate-400 text-sm text-right">{vol.replicationFactor}×</td>
                      <td className="px-3 py-2 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          vol.backendType === 'flasharray'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-600/50 text-slate-400'
                        }`}>
                          {vol.backendType === 'flasharray' ? 'FlashArray' : vol.backendType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-sm font-mono">{vol.ioProfile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function OpenShiftPanel() {
  const [loading, setLoading] = useState(false);

  const clusterInfo = useAppStore((s) => s.clusterInfo) as ClusterData | null;
  const setClusterInfo = useAppStore((s) => s.setClusterInfo);
  const datastores = useAppStore((s) => s.datastores);
  const openshiftPlatform = useAppStore((s) =>
    s.platforms.find((p) => p.type === 'openshift'),
  );

  const isConnected = openshiftPlatform?.status === 'connected';

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await discoverOpenShift();
      setClusterInfo(data);
    } catch {
      // Error handling delegated to API layer
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!isConnected) {
    return (
      <EmptyState
        icon="🔌"
        title="OpenShift Not Connected"
        description="Connect to OpenShift in Configuration"
      />
    );
  }

  if (!clusterInfo) {
    return (
      <EmptyState
        icon="🔍"
        title="No Cluster Data"
        description="Click Refresh to fetch cluster information."
        action={
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
          >
            Refresh
          </button>
        }
      />
    );
  }

  // Portworx correlation summary (only shown if VMware data is also available)
  const portworxBackedCount = datastores.filter((ds) => (ds as unknown as { isPortworxBacked?: boolean }).isPortworxBacked).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Cluster Overview">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-slate-400 text-sm">Nodes</dt>
              <dd className="text-slate-100 font-semibold">
                {formatNumber(clusterInfo.nodeCount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400 text-sm">Total CPU</dt>
              <dd className="text-slate-100 font-semibold">
                {formatNumber(clusterInfo.totalCPU)} cores
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400 text-sm">Total Memory</dt>
              <dd className="text-slate-100 font-semibold">
                {formatNumber(clusterInfo.totalMemoryGB)} GB
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="MTV Status" className="md:col-span-1">
          <div className="flex items-center gap-3 py-4">
            {clusterInfo.mtvInstalled ? (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-slate-200">Migration Toolkit for Virtualization installed</span>
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <span className="text-slate-200">Migration Toolkit for Virtualization not installed</span>
              </>
            )}
          </div>
        </Card>

        <Card title="Portworx" className="md:col-span-1">
          <div className="flex items-center gap-3 py-4">
            {clusterInfo.portworxInfo?.installed ? (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <p className="text-slate-200">Portworx Enterprise detected</p>
                  {portworxBackedCount > 0 && (
                    <p className="text-xs text-purple-400 mt-0.5">
                      {portworxBackedCount} VMware datastore{portworxBackedCount !== 1 ? 's' : ''} correlated
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-500/20 text-slate-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                </span>
                <span className="text-slate-400">Portworx not detected</span>
              </>
            )}
          </div>
        </Card>
      </div>

      {clusterInfo.portworxInfo?.installed && (
        <PortworxSection info={clusterInfo.portworxInfo} />
      )}

      <Card title="Storage Classes">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Provisioner</th>
                <th className="px-4 py-3 font-medium">Default</th>
                <th className="px-4 py-3 font-medium">Binding Mode</th>
                <th className="px-4 py-3 font-medium">Compatibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {clusterInfo.storageClasses.map((sc) => {
                const isPure = sc.provisioner.toLowerCase().includes('pure');
                const isPortworx =
                  sc.provisioner.toLowerCase().includes('portworx') ||
                  sc.provisioner === 'pxd.portworx.com';
                return (
                  <tr key={sc.name} className="hover:bg-slate-700/50 transition">
                    <td className="px-4 py-3 text-slate-200 font-medium">{sc.name}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm font-mono">{sc.provisioner}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{sc.isDefault ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{sc.bindingMode}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {isPure && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                            FlashArray
                          </span>
                        )}
                        {isPortworx && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                            Portworx
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
