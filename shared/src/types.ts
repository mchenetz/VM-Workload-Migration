// ── VM & Infrastructure ──

export interface Disk {
  id: string;
  name: string;
  capacityGB: number;
  thinProvisioned: boolean;
  datastore: string;
}

export interface VM {
  id: string;
  name: string;
  guestOS: string;
  powerState: 'poweredOn' | 'poweredOff' | 'suspended';
  vCPUs: number;
  memoryGB: number;
  disks: Disk[];
  totalDiskSizeGB: number;
  datastoreName: string;
  resourcePool: string;
  network: string;
}

export interface Datastore {
  id: string;
  name: string;
  type: 'VMFS' | 'NFS' | 'vVol' | 'vSAN';
  capacityGB: number;
  freeGB: number;
  isVAAICapable: boolean;
  isFlashArrayBacked: boolean;
}

export interface StorageClass {
  name: string;
  provisioner: string;
  isDefault: boolean;
  volumeBindingMode: string;
}

export interface ClusterInfo {
  name: string;
  nodeCount: number;
  totalCPU: number;
  totalMemoryGB: number;
  storageClasses: StorageClass[];
  mtvInstalled: boolean;
}

// ── Platform Connections ──

export type PlatformType = 'vmware' | 'openshift' | 'flasharray';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface PlatformConnection {
  type: PlatformType;
  endpoint: string;
  status: ConnectionStatus;
  lastChecked: string | null;
  errorMessage: string | null;
  version?: string;
}

export interface VMwareCredentials {
  username: string;
  password: string;
  datacenter?: string;
}

export interface OpenShiftCredentials {
  token: string;
  namespace?: string;
}

export interface FlashArrayCredentials {
  apiToken: string;
}

export type PlatformCredentials =
  | { type: 'vmware'; credentials: VMwareCredentials }
  | { type: 'openshift'; credentials: OpenShiftCredentials }
  | { type: 'flasharray'; credentials: FlashArrayCredentials };

// ── Calculation ──

export type MigrationMethod = 'network_copy' | 'xcopy' | 'flasharray_copy';

export interface TuningParams {
  concurrentTransfers: number;
  networkBandwidthGbps: number;
  bandwidthUtilization: number;
  compressionRatio: number;
  vddkOverhead: number;
  xcopySpeedMultiplier: number;
  storageIOPS: number;
  warmMigration: boolean;
  dailyChangeRate: number;
  daysSinceCutover: number;
}

export interface FormulaStep {
  label: string;
  formula: string;
  values: string;
  result: string;
}

export type BottleneckSeverity = 'info' | 'warning' | 'critical';

export interface Bottleneck {
  type: string;
  severity: BottleneckSeverity;
  message: string;
  suggestion: string;
}

export interface VMResult {
  vmId: string;
  vmName: string;
  diskSizeGB: number;
  estimatedSeconds: number;
}

export interface CalculationResult {
  method: MigrationMethod;
  methodLabel: string;
  totalTimeSeconds: number;
  totalTimeFormatted: string;
  perVMResults: VMResult[];
  formulaSteps: FormulaStep[];
  bottlenecks: Bottleneck[];
  recommendations: string[];
  compatible: boolean;
  incompatibleReason?: string;
}

export interface ManualCalculationInput {
  vmCount: number;
  totalDiskSizeGB: number;
  tuning: TuningParams;
  methods: MigrationMethod[];
}

export interface AutoCalculationInput {
  vmIds: string[];
  tuning: TuningParams;
  methods: MigrationMethod[];
}

export interface CalculationResponse {
  results: CalculationResult[];
  recommendedMethod: MigrationMethod;
  summary: {
    totalVMs: number;
    totalDiskGB: number;
    fastestMethod: MigrationMethod;
    fastestTimeFormatted: string;
  };
}

// ── Presets ──

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  tuning: TuningParams;
}

// ── Discovery ──

export interface DiscoveryStatus {
  vmware: { discovered: boolean; vmCount: number; lastDiscovery: string | null };
  openshift: { discovered: boolean; lastDiscovery: string | null };
  flasharray: { discovered: boolean; volumeCount: number; lastDiscovery: string | null };
}

export interface CompatibilityResult {
  vmId: string;
  vmName: string;
  networkCopy: boolean;
  xcopy: boolean;
  xcopyReason?: string;
  flasharrayCopy: boolean;
  flasharrayReason?: string;
}

// ── PDF Export ──

export interface ExportOptions {
  projectName: string;
  companyName?: string;
  includeVMDetails: boolean;
  includeFormulas: boolean;
  includeRecommendations: boolean;
}

// ── API Responses ──

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PlatformStatusResponse {
  platforms: PlatformConnection[];
}

// ── FlashArray ──

export interface FlashArrayVolume {
  id: string;
  name: string;
  sizeGB: number;
  dataReduction: number;
  thinProvisioning: number;
  source?: string;
}

export interface FlashArrayPerformance {
  readBandwidthMBs: number;
  writeBandwidthMBs: number;
  readIOPS: number;
  writeIOPS: number;
  latencyUs: number;
}
