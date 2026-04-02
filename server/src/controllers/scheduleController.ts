import type { ScheduleParams, CalculationResult } from '@vm-migration/shared';
import { ALL_METHODS } from '@vm-migration/shared';
import { getCachedVMs } from './discoveryController.js';
import { runCalculation } from '../services/calculation/engine.js';
import { buildSchedule } from '../services/schedule/scheduleEngine.js';
import { DEFAULT_TUNING_PARAMS } from '../config/defaults.js';

export function generateSchedule(params: ScheduleParams, results?: CalculationResult[]) {
  const vms = getCachedVMs();
  if (vms.length === 0) {
    throw new Error('No discovered VMs available. Run VMware discovery first.');
  }

  let calcResults = results;
  if (!calcResults || calcResults.length === 0) {
    const { results: autoResults } = runCalculation(vms, DEFAULT_TUNING_PARAMS, [...ALL_METHODS]);
    calcResults = autoResults;
  }

  return buildSchedule(vms, calcResults, params);
}
