import { useState } from 'react';
import { useAppStore } from '../../store';
import { calculateAuto } from '../../api/calculator';
import { AppShell } from '../layout/AppShell';
import { VMwarePanel } from './VMwarePanel';
import { OpenShiftPanel } from './OpenShiftPanel';
import { FlashArrayPanel } from './FlashArrayPanel';

type Tab = 'vmware' | 'openshift' | 'flasharray';

const TABS: { key: Tab; label: string }[] = [
  { key: 'vmware', label: 'VMware' },
  { key: 'openshift', label: 'OpenShift' },
  { key: 'flasharray', label: 'FlashArray' },
];

export function DiscoveryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('vmware');
  const [calculating, setCalculating] = useState(false);

  const discoveredVMs = useAppStore((s) => s.discoveredVMs);
  const setCalculationResults = useAppStore((s) => s.setCalculationResults);

  const handleCalculate = async () => {
    if (discoveredVMs.length === 0) return;
    setCalculating(true);
    try {
      const vmIds = discoveredVMs.map((vm) => vm.id);
      const results = await calculateAuto(vmIds);
      setCalculationResults(results);
    } catch {
      // Error handling delegated to API layer
    } finally {
      setCalculating(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-100">Auto-Discovery</h1>

        <div className="flex border-b border-slate-700">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'vmware' && <VMwarePanel />}
          {activeTab === 'openshift' && <OpenShiftPanel />}
          {activeTab === 'flasharray' && <FlashArrayPanel />}
        </div>

        <div className="flex justify-end border-t border-slate-700 pt-4">
          <button
            onClick={handleCalculate}
            disabled={discoveredVMs.length === 0 || calculating}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition"
          >
            {calculating ? 'Calculating...' : 'Calculate from Discovery'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
