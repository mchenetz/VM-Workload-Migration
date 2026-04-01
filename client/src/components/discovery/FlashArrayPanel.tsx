import { useState } from 'react';
import { useAppStore } from '../../store';
import { discoverFlashArray } from '../../api/discovery';
import { Card } from '../shared/Card';
import { EmptyState } from '../shared/EmptyState';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatBytes, formatNumber } from '../../utils/formatters';

interface Volume {
  id: string;
  name: string;
  sizeGB: number;
  dataReduction: number;
}

interface Performance {
  readBandwidthMBs: number;
  writeBandwidthMBs: number;
  readIOPS: number;
  writeIOPS: number;
  latencyUs: number;
}

interface FlashArrayData {
  volumes: Volume[];
  performance: Performance;
}

function StatBlock({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 uppercase mt-1">{unit}</p>
      <p className="text-sm text-slate-400 mt-1">{label}</p>
    </div>
  );
}

export function FlashArrayPanel() {
  const [loading, setLoading] = useState(false);

  const flashArrayData = useAppStore((s) => s.flashArrayData) as FlashArrayData | null;
  const setFlashArrayData = useAppStore((s) => s.setFlashArrayData);
  const flashPlatform = useAppStore((s) =>
    s.platforms.find((p) => p.type === 'flasharray'),
  );

  const isConnected = flashPlatform?.status === 'connected';

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await discoverFlashArray();
      setFlashArrayData(data);
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
        title="FlashArray Not Connected"
        description="Connect to FlashArray in Configuration"
      />
    );
  }

  if (!flashArrayData) {
    return (
      <EmptyState
        icon="🔍"
        title="No FlashArray Data"
        description="Click Refresh to fetch array information."
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

  const { performance, volumes } = flashArrayData;

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

      <Card title="Performance">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 py-2">
          <StatBlock
            label="Read Bandwidth"
            value={formatNumber(performance.readBandwidthMBs)}
            unit="MB/s"
          />
          <StatBlock
            label="Write Bandwidth"
            value={formatNumber(performance.writeBandwidthMBs)}
            unit="MB/s"
          />
          <StatBlock
            label="Read IOPS"
            value={formatNumber(performance.readIOPS)}
            unit="IOPS"
          />
          <StatBlock
            label="Write IOPS"
            value={formatNumber(performance.writeIOPS)}
            unit="IOPS"
          />
          <StatBlock
            label="Latency"
            value={formatNumber(performance.latencyUs)}
            unit={'\u00B5s'}
          />
        </div>
      </Card>

      <Card title="Volumes">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium text-right">Size</th>
                <th className="px-4 py-3 font-medium text-right">
                  Data Reduction
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {volumes.map((vol) => (
                <tr
                  key={vol.id}
                  className="hover:bg-slate-700/50 transition"
                >
                  <td className="px-4 py-3 text-slate-200 font-medium">
                    {vol.name}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-right">
                    {formatBytes(vol.sizeGB)}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-right">
                    {vol.dataReduction.toFixed(1)}:1
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
