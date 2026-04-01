import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { calculateManual, calculateAuto } from '../api/calculator';
import type { TuningParams } from '../types/calculation';

export function useCalculation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCalculationResults = useAppStore((s) => s.setCalculationResults);

  const runManual = useCallback(async (vmCount: number, totalDiskSizeGB: number, tuning: TuningParams) => {
    setLoading(true);
    setError(null);
    try {
      const results = await calculateManual({ vmCount, totalDiskSizeGB, tuning });
      setCalculationResults(results);
      return results;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Calculation failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setCalculationResults]);

  const runAuto = useCallback(async (vmIds: string[], tuning?: TuningParams) => {
    setLoading(true);
    setError(null);
    try {
      const results = await calculateAuto(vmIds, tuning);
      setCalculationResults(results);
      return results;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Calculation failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setCalculationResults]);

  return { loading, error, runManual, runAuto };
}
