import { create } from 'zustand';
import type { PlatformConnection, PlatformType } from '../types/platform';
import type { VM, Datastore } from '../types/vm';
import type { CalculationResponse, TuningParams, MigrationMethod } from '../types/calculation';
import { DEFAULT_TUNING, ALL_METHODS } from '../utils/constants';

interface AppState {
  // Platform connections
  platforms: PlatformConnection[];
  setPlatforms: (platforms: PlatformConnection[]) => void;
  updatePlatform: (type: PlatformType, update: Partial<PlatformConnection>) => void;

  // Discovery
  discoveredVMs: VM[];
  datastores: Datastore[];
  clusterInfo: Record<string, unknown> | null;
  flashArrayData: Record<string, unknown> | null;
  setDiscoveredVMs: (vms: VM[]) => void;
  setDatastores: (ds: Datastore[]) => void;
  setClusterInfo: (info: Record<string, unknown>) => void;
  setFlashArrayData: (data: Record<string, unknown>) => void;

  // Calculator
  tuning: TuningParams;
  setTuning: (tuning: Partial<TuningParams>) => void;
  resetTuning: () => void;
  selectedMethods: MigrationMethod[];
  setSelectedMethods: (methods: MigrationMethod[]) => void;
  calculationResults: CalculationResponse | null;
  setCalculationResults: (results: CalculationResponse | null) => void;

  // UI
  autoRefreshInterval: number;
  setAutoRefreshInterval: (ms: number) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Platform connections
  platforms: [
    { type: 'vmware', endpoint: '', status: 'disconnected', lastChecked: null, errorMessage: null },
    { type: 'openshift', endpoint: '', status: 'disconnected', lastChecked: null, errorMessage: null },
    { type: 'flasharray', endpoint: '', status: 'disconnected', lastChecked: null, errorMessage: null },
  ],
  setPlatforms: (platforms) => set({ platforms }),
  updatePlatform: (type, update) =>
    set((state) => ({
      platforms: state.platforms.map((p) => (p.type === type ? { ...p, ...update } : p)),
    })),

  // Discovery
  discoveredVMs: [],
  datastores: [],
  clusterInfo: null,
  flashArrayData: null,
  setDiscoveredVMs: (vms) => set({ discoveredVMs: vms }),
  setDatastores: (datastores) => set({ datastores }),
  setClusterInfo: (clusterInfo) => set({ clusterInfo }),
  setFlashArrayData: (flashArrayData) => set({ flashArrayData }),

  // Calculator
  tuning: { ...DEFAULT_TUNING },
  setTuning: (partial) => set((state) => ({ tuning: { ...state.tuning, ...partial } })),
  resetTuning: () => set({ tuning: { ...DEFAULT_TUNING } }),
  selectedMethods: [...ALL_METHODS],
  setSelectedMethods: (methods) => set({ selectedMethods: methods }),
  calculationResults: null,
  setCalculationResults: (calculationResults) => set({ calculationResults }),

  // UI
  autoRefreshInterval: 30000,
  setAutoRefreshInterval: (ms) => set({ autoRefreshInterval: ms }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
