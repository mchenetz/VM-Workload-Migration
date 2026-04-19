export type MigrationStatus =
  | 'pending'
  | 'in_progress'
  | 'migrated'
  | 'failed'
  | 'decommissioned';

export interface MigrationItem {
  id: number;
  sourceId: string;
  sourceName: string;
  sourceGuestOS?: string;
  sourceVCPUs?: number;
  sourceMemoryGB?: number;
  sourceDiskGB?: number;
  targetNamespace?: string;
  targetName?: string;
  mtvPlan?: string;
  status: MigrationStatus;
  startedAt?: string;
  completedAt?: string;
  lastSeenSourceAt?: string;
  lastSeenTargetAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationEvent {
  id: number;
  migrationItemId: number;
  fromStatus: MigrationStatus | null;
  toStatus: MigrationStatus;
  reason: string;
  occurredAt: string;
}

export interface MigrationReport {
  generatedAt: string;
  totals: {
    total: number;
    pending: number;
    in_progress: number;
    migrated: number;
    failed: number;
    decommissioned: number;
    migratedDiskGB: number;
    pendingDiskGB: number;
  };
  throughput: Array<{ weekStart: string; migratedCount: number }>;
  stuckInProgress: Array<{
    sourceName: string;
    targetName?: string;
    startedAt?: string;
    daysInProgress: number;
  }>;
  byNamespace: Array<{ namespace: string; count: number }>;
  recentEvents: MigrationEvent[];
}

export interface ReconcileResult {
  scannedSource: number;
  scannedTarget: number;
  transitions: Array<{
    sourceName: string;
    from: MigrationStatus | null;
    to: MigrationStatus;
    reason: string;
  }>;
}
