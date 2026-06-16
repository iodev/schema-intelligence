/**
 * Schema Change Tracker (Phase 2C)
 *
 * Records schema changes over time and provides diff views.
 * Persists snapshots and history to the filesystem.
 */
import type { SchemaMetadata, SchemaSnapshot, SchemaDiff, DiffEntry, ChangeHistoryEntry } from './types.js';
export declare function computeDiff(before: SchemaMetadata | null, after: SchemaMetadata | null): DiffEntry[];
export interface SchemaChangeTrackerOptions {
    storageDir?: string;
}
export declare class SchemaChangeTracker {
    private storageDir;
    constructor(options?: SchemaChangeTrackerOptions);
    private schemaDir;
    private historyFile;
    private ensureDir;
    recordSnapshot(metadata: SchemaMetadata): Promise<SchemaSnapshot>;
    private getLatestSnapshot;
    private findSnapshotById;
    /**
     * Compare current metadata against the last stored snapshots and return diffs.
     *
     * IMPORTANT: This method does NOT persist the new metadata as snapshots.
     * The caller must call `recordSnapshot()` for each schema after `detectChanges()`
     * to ensure subsequent calls diff against the updated state.
     */
    detectChanges(current: SchemaMetadata[]): Promise<SchemaDiff[]>;
    private getAllKnownSchemaIds;
    private metadataToInlineSnapshot;
    private appendHistory;
    private readHistory;
    private readAllHistory;
    getHistory(schemaId: string, limit?: number): Promise<ChangeHistoryEntry[]>;
    getHistoryByDatabase(database: string, limit?: number): Promise<ChangeHistoryEntry[]>;
    getRecentChanges(since?: Date, limit?: number): Promise<ChangeHistoryEntry[]>;
    getDiff(snapshotId1: string, snapshotId2: string): Promise<SchemaDiff>;
    getDiff(snapshot1: SchemaSnapshot, snapshot2: SchemaSnapshot): SchemaDiff;
    private getDiffByIds;
    private computeSnapshotDiff;
    rollbackInfo(schemaId: string): Promise<{
        current: SchemaSnapshot;
        previous: SchemaSnapshot | null;
    }>;
    compact(retentionDays?: number): Promise<{
        removedSnapshots: number;
    }>;
    private compactHistory;
}
//# sourceMappingURL=schema-change-tracker.d.ts.map