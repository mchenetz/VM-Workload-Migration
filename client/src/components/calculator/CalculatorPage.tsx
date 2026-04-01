import { useState } from 'react';
import type { TuningParams } from '../../types/calculation';
import { useAppStore } from '../../store';
import { calculateManual } from '../../api/calculator';
import { DEFAULT_TUNING } from '../../utils/constants';
import { AppShell } from '../layout/AppShell';
import { InputForm } from './InputForm';
import { PresetSelector } from './PresetSelector';
import { ResultsBreakdown } from './ResultsBreakdown';

export function CalculatorPage() {
  const { calculationResults, setCalculationResults, setTuning } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async (input: {
    vmCount: number;
    totalDiskSizeGB: number;
    tuning: TuningParams;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const results = await calculateManual({
        vmCount: input.vmCount,
        totalDiskSizeGB: input.totalDiskSizeGB,
        tuning: input.tuning as unknown as Record<string, unknown>,
      });
      setCalculationResults(results);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Calculation failed. Please try again.';
      setError(message);
      setCalculationResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (tuning: TuningParams) => {
    setTuning(tuning);
    const presetId = detectPresetId(tuning);
    setActivePreset(presetId);
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">
        Migration Calculator
      </h1>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <PresetSelector
            onSelect={handlePresetSelect}
            activePreset={activePreset}
          />
          <InputForm onCalculate={handleCalculate} loading={loading} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-1">
          <ResultsBreakdown results={calculationResults} loading={loading} />
        </div>
      </div>
    </AppShell>
  );
}

function detectPresetId(tuning: TuningParams): string {
  if (
    tuning.concurrentTransfers === 2 &&
    tuning.bandwidthUtilization === 0.5 &&
    tuning.compressionRatio === 0.2 &&
    tuning.vddkOverhead === 0.15
  ) {
    return 'conservative';
  }
  if (
    tuning.concurrentTransfers === 8 &&
    tuning.bandwidthUtilization === 0.85 &&
    tuning.compressionRatio === 0.5 &&
    tuning.vddkOverhead === 0.1
  ) {
    return 'aggressive';
  }
  if (
    tuning.concurrentTransfers === DEFAULT_TUNING.concurrentTransfers &&
    tuning.bandwidthUtilization === DEFAULT_TUNING.bandwidthUtilization &&
    tuning.compressionRatio === DEFAULT_TUNING.compressionRatio &&
    tuning.vddkOverhead === DEFAULT_TUNING.vddkOverhead
  ) {
    return 'balanced';
  }
  return '';
}
