import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  MigrationItem,
  MigrationEvent,
  MigrationStatus,
  MigrationListFilters,
} from '@vm-migration/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MIGRATION_DB_DIR ?? path.resolve(__dirname, '../../../data');
const DB_PATH = process.env.MIGRATION_DB_PATH ?? path.join(DATA_DIR, 'migrations.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id           TEXT NOT NULL UNIQUE,
      source_name         TEXT NOT NULL,
      source_guest_os     TEXT,
      source_vcpus        INTEGER,
      source_memory_gb    REAL,
      source_disk_gb      REAL,
      target_namespace    TEXT,
      target_name         TEXT,
      mtv_plan            TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      started_at          TEXT,
      completed_at        TEXT,
      last_seen_source_at TEXT,
      last_seen_target_at TEXT,
      notes               TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_migration_items_status ON migration_items(status);
    CREATE INDEX IF NOT EXISTS idx_migration_items_namespace ON migration_items(target_namespace);

    CREATE TABLE IF NOT EXISTS migration_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_item_id INTEGER NOT NULL REFERENCES migration_items(id) ON DELETE CASCADE,
      from_status       TEXT,
      to_status         TEXT NOT NULL,
      reason            TEXT NOT NULL,
      occurred_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_migration_events_item ON migration_events(migration_item_id);
    CREATE INDEX IF NOT EXISTS idx_migration_events_occurred ON migration_events(occurred_at);
  `);
  return db;
}

type ItemRow = {
  id: number;
  source_id: string;
  source_name: string;
  source_guest_os: string | null;
  source_vcpus: number | null;
  source_memory_gb: number | null;
  source_disk_gb: number | null;
  target_namespace: string | null;
  target_name: string | null;
  mtv_plan: string | null;
  status: MigrationStatus;
  started_at: string | null;
  completed_at: string | null;
  last_seen_source_at: string | null;
  last_seen_target_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: number;
  migration_item_id: number;
  from_status: MigrationStatus | null;
  to_status: MigrationStatus;
  reason: string;
  occurred_at: string;
};

function rowToItem(r: ItemRow): MigrationItem {
  return {
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    sourceGuestOS: r.source_guest_os ?? undefined,
    sourceVCPUs: r.source_vcpus ?? undefined,
    sourceMemoryGB: r.source_memory_gb ?? undefined,
    sourceDiskGB: r.source_disk_gb ?? undefined,
    targetNamespace: r.target_namespace ?? undefined,
    targetName: r.target_name ?? undefined,
    mtvPlan: r.mtv_plan ?? undefined,
    status: r.status,
    startedAt: r.started_at ?? undefined,
    completedAt: r.completed_at ?? undefined,
    lastSeenSourceAt: r.last_seen_source_at ?? undefined,
    lastSeenTargetAt: r.last_seen_target_at ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToEvent(r: EventRow): MigrationEvent {
  return {
    id: r.id,
    migrationItemId: r.migration_item_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    reason: r.reason,
    occurredAt: r.occurred_at,
  };
}

export function getItemBySourceId(sourceId: string): MigrationItem | null {
  const row = getDb()
    .prepare<[string], ItemRow>('SELECT * FROM migration_items WHERE source_id = ?')
    .get(sourceId);
  return row ? rowToItem(row) : null;
}

export function getItemById(id: number): MigrationItem | null {
  const row = getDb()
    .prepare<[number], ItemRow>('SELECT * FROM migration_items WHERE id = ?')
    .get(id);
  return row ? rowToItem(row) : null;
}

export interface UpsertInput {
  sourceId: string;
  sourceName: string;
  sourceGuestOS?: string;
  sourceVCPUs?: number;
  sourceMemoryGB?: number;
  sourceDiskGB?: number;
  targetNamespace?: string;
  targetName?: string;
  mtvPlan?: string;
  status?: MigrationStatus;
  lastSeenSourceAt?: string;
  lastSeenTargetAt?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

/** Creates or updates by source_id and records a status-transition event if status changed. */
export function upsertItem(
  input: UpsertInput,
  transitionReason: string,
): { item: MigrationItem; transitioned: boolean; from: MigrationStatus | null } {
  const existing = getItemBySourceId(input.sourceId);
  const now = new Date().toISOString();
  const nextStatus: MigrationStatus = input.status ?? existing?.status ?? 'pending';
  const from = existing?.status ?? null;
  const transitioned = nextStatus !== (existing?.status ?? null);

  const tx = getDb().transaction(() => {
    if (existing) {
      getDb()
        .prepare(
          `UPDATE migration_items SET
              source_name = COALESCE(?, source_name),
              source_guest_os = COALESCE(?, source_guest_os),
              source_vcpus = COALESCE(?, source_vcpus),
              source_memory_gb = COALESCE(?, source_memory_gb),
              source_disk_gb = COALESCE(?, source_disk_gb),
              target_namespace = COALESCE(?, target_namespace),
              target_name = COALESCE(?, target_name),
              mtv_plan = COALESCE(?, mtv_plan),
              status = ?,
              started_at = COALESCE(?, started_at),
              completed_at = COALESCE(?, completed_at),
              last_seen_source_at = COALESCE(?, last_seen_source_at),
              last_seen_target_at = COALESCE(?, last_seen_target_at),
              notes = COALESCE(?, notes),
              updated_at = ?
            WHERE id = ?`,
        )
        .run(
          input.sourceName ?? null,
          input.sourceGuestOS ?? null,
          input.sourceVCPUs ?? null,
          input.sourceMemoryGB ?? null,
          input.sourceDiskGB ?? null,
          input.targetNamespace ?? null,
          input.targetName ?? null,
          input.mtvPlan ?? null,
          nextStatus,
          input.startedAt ?? null,
          input.completedAt ?? null,
          input.lastSeenSourceAt ?? null,
          input.lastSeenTargetAt ?? null,
          input.notes ?? null,
          now,
          existing.id,
        );
    } else {
      getDb()
        .prepare(
          `INSERT INTO migration_items
            (source_id, source_name, source_guest_os, source_vcpus, source_memory_gb,
             source_disk_gb, target_namespace, target_name, mtv_plan, status,
             started_at, completed_at, last_seen_source_at, last_seen_target_at, notes,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.sourceId,
          input.sourceName,
          input.sourceGuestOS ?? null,
          input.sourceVCPUs ?? null,
          input.sourceMemoryGB ?? null,
          input.sourceDiskGB ?? null,
          input.targetNamespace ?? null,
          input.targetName ?? null,
          input.mtvPlan ?? null,
          nextStatus,
          input.startedAt ?? null,
          input.completedAt ?? null,
          input.lastSeenSourceAt ?? null,
          input.lastSeenTargetAt ?? null,
          input.notes ?? null,
          now,
          now,
        );
    }

    if (transitioned) {
      const item = getItemBySourceId(input.sourceId)!;
      getDb()
        .prepare(
          `INSERT INTO migration_events (migration_item_id, from_status, to_status, reason)
           VALUES (?, ?, ?, ?)`,
        )
        .run(item.id, from, nextStatus, transitionReason);
    }
  });
  tx();

  return { item: getItemBySourceId(input.sourceId)!, transitioned, from };
}

export function setStatus(
  id: number,
  status: MigrationStatus,
  reason: string,
  extras: { notes?: string; startedAt?: string; completedAt?: string } = {},
): MigrationItem | null {
  const existing = getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const tx = getDb().transaction(() => {
    getDb()
      .prepare(
        `UPDATE migration_items
           SET status = ?,
               notes = COALESCE(?, notes),
               started_at = COALESCE(?, started_at),
               completed_at = COALESCE(?, completed_at),
               updated_at = ?
         WHERE id = ?`,
      )
      .run(
        status,
        extras.notes ?? null,
        extras.startedAt ?? null,
        extras.completedAt ?? null,
        now,
        id,
      );
    if (existing.status !== status) {
      getDb()
        .prepare(
          `INSERT INTO migration_events (migration_item_id, from_status, to_status, reason)
           VALUES (?, ?, ?, ?)`,
        )
        .run(id, existing.status, status, reason);
    }
  });
  tx();
  return getItemById(id);
}

export function listItems(filters: MigrationListFilters = {}): MigrationItem[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (statuses.length > 0) {
      conditions.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (filters.namespace) {
    conditions.push('target_namespace = ?');
    params.push(filters.namespace);
  }
  if (filters.search) {
    conditions.push('(source_name LIKE ? OR target_name LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.from) {
    conditions.push('updated_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('updated_at <= ?');
    params.push(filters.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = getDb()
    .prepare<typeof params, ItemRow>(
      `SELECT * FROM migration_items ${where} ORDER BY updated_at DESC`,
    )
    .all(...params);
  return rows.map(rowToItem);
}

export function listEventsForItem(itemId: number): MigrationEvent[] {
  const rows = getDb()
    .prepare<[number], EventRow>(
      'SELECT * FROM migration_events WHERE migration_item_id = ? ORDER BY occurred_at DESC',
    )
    .all(itemId);
  return rows.map(rowToEvent);
}

export function listRecentEvents(limit = 25): MigrationEvent[] {
  const rows = getDb()
    .prepare<[number], EventRow>(
      'SELECT * FROM migration_events ORDER BY occurred_at DESC LIMIT ?',
    )
    .all(limit);
  return rows.map(rowToEvent);
}

export function countsByStatus(): Record<MigrationStatus, number> {
  const rows = getDb()
    .prepare<[], { status: MigrationStatus; n: number }>(
      'SELECT status, COUNT(*) AS n FROM migration_items GROUP BY status',
    )
    .all();
  const base: Record<MigrationStatus, number> = {
    pending: 0,
    in_progress: 0,
    migrated: 0,
    failed: 0,
    decommissioned: 0,
  };
  for (const r of rows) base[r.status] = r.n;
  return base;
}

export function diskGBByStatus(): { migrated: number; pending: number } {
  const row = getDb()
    .prepare<[], { migrated: number | null; pending: number | null }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'migrated' THEN source_disk_gb END), 0) AS migrated,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN source_disk_gb END), 0) AS pending
       FROM migration_items`,
    )
    .get();
  return {
    migrated: Math.round((row?.migrated ?? 0) * 10) / 10,
    pending: Math.round((row?.pending ?? 0) * 10) / 10,
  };
}

export function weeklyThroughput(): Array<{ weekStart: string; migratedCount: number }> {
  // SQLite: compute ISO week start (Monday) via strftime with modifier.
  const rows = getDb()
    .prepare<[], { week_start: string; n: number }>(
      `SELECT date(occurred_at, 'weekday 0', '-6 days') AS week_start, COUNT(*) AS n
         FROM migration_events
        WHERE to_status = 'migrated'
        GROUP BY week_start
        ORDER BY week_start DESC
        LIMIT 12`,
    )
    .all();
  return rows.map((r) => ({ weekStart: r.week_start, migratedCount: r.n }));
}

export function stuckInProgress(
  maxDays: number,
): Array<{
  sourceName: string;
  targetName?: string;
  startedAt?: string;
  daysInProgress: number;
}> {
  const rows = getDb()
    .prepare<[number], {
      source_name: string;
      target_name: string | null;
      started_at: string | null;
      days: number;
    }>(
      `SELECT source_name, target_name, started_at,
              CAST((julianday('now') - julianday(COALESCE(started_at, updated_at))) AS REAL) AS days
         FROM migration_items
        WHERE status = 'in_progress'
          AND julianday('now') - julianday(COALESCE(started_at, updated_at)) > ?
        ORDER BY days DESC`,
    )
    .all(maxDays);
  return rows.map((r) => ({
    sourceName: r.source_name,
    targetName: r.target_name ?? undefined,
    startedAt: r.started_at ?? undefined,
    daysInProgress: Math.round(r.days * 10) / 10,
  }));
}

export function countByNamespace(): Array<{ namespace: string; count: number }> {
  const rows = getDb()
    .prepare<[], { namespace: string | null; n: number }>(
      `SELECT target_namespace AS namespace, COUNT(*) AS n
         FROM migration_items
        WHERE target_namespace IS NOT NULL
        GROUP BY target_namespace
        ORDER BY n DESC`,
    )
    .all();
  return rows.map((r) => ({ namespace: r.namespace ?? '(none)', count: r.n }));
}
