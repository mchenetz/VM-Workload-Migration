import { AppShell } from '../layout/AppShell';
import { useAppStore } from '../../store';
import { OverviewCards } from './OverviewCards';
import { MethodComparisonChart } from './MethodComparisonChart';
import { MigrationTimeline } from './MigrationTimeline';
import { PlatformStatusPanel } from './PlatformStatusPanel';
import type { CalculationResponse } from '../../types/calculation';

const DEMO_DATA: CalculationResponse = {
  results: [
    { method: 'network_copy', methodLabel: 'Network Copy (VDDK)', totalTimeSeconds: 14400, totalTimeFormatted: '4h 0m', perVMResults: [], formulaSteps: [], bottlenecks: [], recommendations: [], compatible: true },
    { method: 'xcopy', methodLabel: 'XCopy (VAAI)', totalTimeSeconds: 2880, totalTimeFormatted: '48m 0s', perVMResults: [], formulaSteps: [], bottlenecks: [], recommendations: [], compatible: true },
  ],
  recommendedMethod: 'xcopy',
  summary: { totalVMs: 24, totalDiskGB: 4800, fastestMethod: 'xcopy', fastestTimeFormatted: '48m 0s' },
};

export function DashboardPage() {
  const calculationResults = useAppStore((s) => s.calculationResults);
  const platforms = useAppStore((s) => s.platforms);

  const data = calculationResults ?? DEMO_DATA;
  const isDemo = !calculationResults;

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
            Showing sample data. Connect platforms or use the Calculator for real estimates.
          </div>
        )}

        <OverviewCards data={data} />

        <MethodComparisonChart results={data.results} />

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <MigrationTimeline results={data.results} />
          </div>
          <div>
            <PlatformStatusPanel platforms={platforms} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
