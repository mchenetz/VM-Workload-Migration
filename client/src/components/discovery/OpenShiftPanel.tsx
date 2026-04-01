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

interface ClusterData {
  nodeCount: number;
  totalCPU: number;
  totalMemoryGB: number;
  storageClasses: StorageClass[];
  mtvInstalled: boolean;
}

export function OpenShiftPanel() {
  const [loading, setLoading] = useState(false);

  const clusterInfo = useAppStore((s) => s.clusterInfo) as ClusterData | null;
  const setClusterInfo = useAppStore((s) => s.setClusterInfo);
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
      </div>

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
                return (
                  <tr key={sc.name} className="hover:bg-slate-700/50 transition">
                    <td className="px-4 py-3 text-slate-200 font-medium">
                      {sc.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {sc.provisioner}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {sc.isDefault ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {sc.bindingMode}
                    </td>
                    <td className="px-4 py-3">
                      {isPure && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                          FlashArray Compatible
                        </span>
                      )}
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
