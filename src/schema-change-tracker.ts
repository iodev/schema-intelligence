/**
 * Schema Change Tracker (Phase 2C)
 *
 * Records schema changes over time and provides diff views.
 * Persists snapshots and history to the filesystem.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type {
    SchemaMetadata,
    SchemaSnapshot,
    SchemaDiff,
    DiffEntry,
    ChangeHistoryEntry,
    TableSchema,
    MongoCollectionSchema,
    RedisPatternSchema,
    InfluxBucketSchema,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers – JSON‑safe date reviver
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function dateReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && DATE_RE.test(value)) {
        return new Date(value);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Deep diff engine
// ---------------------------------------------------------------------------

/**
 * Recursively compare two values and produce a list of DiffEntry items.
 * `prefix` accumulates the human-readable path such as "columns.email.type".
 */
function diffValues(
    prefix: string,
    oldVal: unknown,
    newVal: unknown,
    entries: DiffEntry[],
): void {
    // Both null / undefined → no change
    if (oldVal === newVal) return;

    // Primitives or type mismatch
    if (
        oldVal === null ||
        newVal === null ||
        oldVal === undefined ||
        newVal === undefined ||
        typeof oldVal !== typeof newVal ||
        typeof oldVal !== 'object' ||
        typeof newVal !== 'object'
    ) {
        entries.push({ path: prefix, type: 'modified', oldValue: oldVal, newValue: newVal });
        return;
    }

    // Arrays → compare element‑by‑element (simple serialization check)
    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            entries.push({ path: prefix, type: 'modified', oldValue: oldVal, newValue: newVal });
        }
        return;
    }

    // Date objects
    if (oldVal instanceof Date || newVal instanceof Date) {
        const oldTime = oldVal instanceof Date ? oldVal.getTime() : NaN;
        const newTime = newVal instanceof Date ? newVal.getTime() : NaN;
        if (oldTime !== newTime) {
            entries.push({ path: prefix, type: 'modified', oldValue: oldVal, newValue: newVal });
        }
        return;
    }

    // Both are plain objects – recurse
    const oldObj = oldVal as Record<string, unknown>;
    const newObj = newVal as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        const inOld = key in oldObj;
        const inNew = key in newObj;

        if (inOld && !inNew) {
            entries.push({ path: childPath, type: 'removed', oldValue: oldObj[key] });
        } else if (!inOld && inNew) {
            entries.push({ path: childPath, type: 'added', newValue: newObj[key] });
        } else {
            diffValues(childPath, oldObj[key], newObj[key], entries);
        }
    }
}

// ---------------------------------------------------------------------------
// Structured diff helpers per database type
// ---------------------------------------------------------------------------

/**
 * Diff two arrays of named objects (columns, indexes, constraints, fields, etc.).
 * Uses the `name` field as the identity key.
 */
function diffNamedArray<T extends { name: string }>(
    prefix: string,
    oldItems: T[],
    newItems: T[],
    entries: DiffEntry[],
): void {
    const oldMap = new Map(oldItems.map(i => [i.name, i]));
    const newMap = new Map(newItems.map(i => [i.name, i]));

    // Removed
    for (const [name, item] of oldMap) {
        if (!newMap.has(name)) {
            entries.push({ path: `${prefix}.${name}`, type: 'removed', oldValue: item });
        }
    }

    // Added
    for (const [name, item] of newMap) {
        if (!oldMap.has(name)) {
            entries.push({ path: `${prefix}.${name}`, type: 'added', newValue: item });
        }
    }

    // Modified – compare matching items field-by-field
    for (const [name, newItem] of newMap) {
        const oldItem = oldMap.get(name);
        if (!oldItem) continue;
        const itemPrefix = `${prefix}.${name}`;
        const oldRec = oldItem as Record<string, unknown>;
        const newRec = newItem as Record<string, unknown>;
        for (const key of new Set([...Object.keys(oldRec), ...Object.keys(newRec)])) {
            if (key === 'name') continue; // identity key
            const childPath = `${itemPrefix}.${key}`;
            const inOld = key in oldRec;
            const inNew = key in newRec;
            if (inOld && !inNew) {
                entries.push({ path: childPath, type: 'removed', oldValue: oldRec[key] });
            } else if (!inOld && inNew) {
                entries.push({ path: childPath, type: 'added', newValue: newRec[key] });
            } else if (JSON.stringify(oldRec[key]) !== JSON.stringify(newRec[key])) {
                entries.push({ path: childPath, type: 'modified', oldValue: oldRec[key], newValue: newRec[key] });
            }
        }
    }
}

/**
 * Diff redis key patterns by `pattern` as identity key.
 */
function diffRedisPatterns<T extends { pattern: string }>(
    prefix: string,
    oldPatterns: T[],
    newPatterns: T[],
    entries: DiffEntry[],
): void {
    const oldMap = new Map(oldPatterns.map(p => [p.pattern, p]));
    const newMap = new Map(newPatterns.map(p => [p.pattern, p]));

    for (const [pat, item] of oldMap) {
        if (!newMap.has(pat)) {
            entries.push({ path: `${prefix}.${pat}`, type: 'removed', oldValue: item });
        }
    }
    for (const [pat, item] of newMap) {
        if (!oldMap.has(pat)) {
            entries.push({ path: `${prefix}.${pat}`, type: 'added', newValue: item });
        }
    }
    for (const [pat, newItem] of newMap) {
        const oldItem = oldMap.get(pat);
        if (!oldItem) continue;
        const itemPrefix = `${prefix}.${pat}`;
        const oldRec = oldItem as Record<string, unknown>;
        const newRec = newItem as Record<string, unknown>;
        for (const key of new Set([...Object.keys(oldRec), ...Object.keys(newRec)])) {
            if (key === 'pattern') continue;
            const childPath = `${itemPrefix}.${key}`;
            const inOld = key in oldRec;
            const inNew = key in newRec;
            if (inOld && !inNew) {
                entries.push({ path: childPath, type: 'removed', oldValue: oldRec[key] });
            } else if (!inOld && inNew) {
                entries.push({ path: childPath, type: 'added', newValue: newRec[key] });
            } else if (JSON.stringify(oldRec[key]) !== JSON.stringify(newRec[key])) {
                entries.push({ path: childPath, type: 'modified', oldValue: oldRec[key], newValue: newRec[key] });
            }
        }
    }
}

// ---------------------------------------------------------------------------
// computeDiff – public deep diff engine
// ---------------------------------------------------------------------------

export function computeDiff(
    before: SchemaMetadata | null,
    after: SchemaMetadata | null,
): DiffEntry[] {
    // Both null → nothing
    if (!before && !after) return [];

    // Newly created – everything in `after` is "added"
    if (!before && after) {
        return diffForCreated(after);
    }

    // Deleted – everything in `before` is "removed"
    if (before && !after) {
        return diffForDeleted(before);
    }

    // Both present – structured diff depending on type
    // TypeScript narrows: at this point both are non-null
    const b = before!;
    const a = after!;

    const entries: DiffEntry[] = [];

    // Compare common base fields (excluding volatile ones)
    if (b.description !== a.description) {
        entries.push({ path: 'description', type: 'modified', oldValue: b.description, newValue: a.description });
    }

    // Type‑specific schema diff
    if (b.type === 'postgresql' || b.type === 'mysql') {
        if (a.type === 'postgresql' || a.type === 'mysql') {
            diffTableSchema(b.schema, a.schema, entries);
        } else {
            // type changed (unusual) – fall back to generic diff
            diffValues('schema', b.schema, a.schema, entries);
        }
    } else if (b.type === 'mongodb') {
        if (a.type === 'mongodb') {
            diffMongoSchema(b.schema, a.schema, entries);
        } else {
            diffValues('schema', b.schema, a.schema, entries);
        }
    } else if (b.type === 'redis') {
        if (a.type === 'redis') {
            diffRedisSchema(b.schema, a.schema, entries);
        } else {
            diffValues('schema', b.schema, a.schema, entries);
        }
    } else if (b.type === 'influxdb') {
        if (a.type === 'influxdb') {
            diffInfluxSchema(b.schema, a.schema, entries);
        } else {
            diffValues('schema', b.schema, a.schema, entries);
        }
    }

    return entries;
}

// ---------------------------------------------------------------------------
// Type-specific structured diff helpers
// ---------------------------------------------------------------------------

function diffTableSchema(
    oldS: TableSchema,
    newS: TableSchema,
    entries: DiffEntry[],
): void {
    diffNamedArray('columns', oldS.columns, newS.columns, entries);
    diffNamedArray('indexes', oldS.indexes, newS.indexes, entries);
    diffNamedArray('constraints', oldS.constraints, newS.constraints, entries);
}

function diffMongoSchema(
    oldS: MongoCollectionSchema,
    newS: MongoCollectionSchema,
    entries: DiffEntry[],
): void {
    diffNamedArray('fields', oldS.fields, newS.fields, entries);
    diffNamedArray('indexes', oldS.indexes, newS.indexes, entries);
}

function diffRedisSchema(
    oldS: RedisPatternSchema,
    newS: RedisPatternSchema,
    entries: DiffEntry[],
): void {
    diffRedisPatterns('patterns', oldS.patterns, newS.patterns, entries);
    if (oldS.totalKeys !== newS.totalKeys) {
        entries.push({ path: 'totalKeys', type: 'modified', oldValue: oldS.totalKeys, newValue: newS.totalKeys });
    }
}

function diffInfluxSchema(
    oldS: InfluxBucketSchema,
    newS: InfluxBucketSchema,
    entries: DiffEntry[],
): void {
    diffNamedArray('measurements', oldS.measurements, newS.measurements, entries);
}

// ---------------------------------------------------------------------------
// Helpers for created / deleted diffs
// ---------------------------------------------------------------------------

function diffForCreated(meta: SchemaMetadata): DiffEntry[] {
    const entries: DiffEntry[] = [];
    if (meta.type === 'postgresql' || meta.type === 'mysql') {
        for (const col of meta.schema.columns) {
            entries.push({ path: `columns.${col.name}`, type: 'added', newValue: col });
        }
        for (const idx of meta.schema.indexes) {
            entries.push({ path: `indexes.${idx.name}`, type: 'added', newValue: idx });
        }
        for (const con of meta.schema.constraints) {
            entries.push({ path: `constraints.${con.name}`, type: 'added', newValue: con });
        }
    } else if (meta.type === 'mongodb') {
        for (const field of meta.schema.fields) {
            entries.push({ path: `fields.${field.name}`, type: 'added', newValue: field });
        }
        for (const idx of meta.schema.indexes) {
            entries.push({ path: `indexes.${idx.name}`, type: 'added', newValue: idx });
        }
    } else if (meta.type === 'redis') {
        for (const pat of meta.schema.patterns) {
            entries.push({ path: `patterns.${pat.pattern}`, type: 'added', newValue: pat });
        }
    } else if (meta.type === 'influxdb') {
        for (const m of meta.schema.measurements) {
            entries.push({ path: `measurements.${m.name}`, type: 'added', newValue: m });
        }
    }
    return entries;
}

function diffForDeleted(meta: SchemaMetadata): DiffEntry[] {
    const entries: DiffEntry[] = [];
    if (meta.type === 'postgresql' || meta.type === 'mysql') {
        for (const col of meta.schema.columns) {
            entries.push({ path: `columns.${col.name}`, type: 'removed', oldValue: col });
        }
        for (const idx of meta.schema.indexes) {
            entries.push({ path: `indexes.${idx.name}`, type: 'removed', oldValue: idx });
        }
        for (const con of meta.schema.constraints) {
            entries.push({ path: `constraints.${con.name}`, type: 'removed', oldValue: con });
        }
    } else if (meta.type === 'mongodb') {
        for (const field of meta.schema.fields) {
            entries.push({ path: `fields.${field.name}`, type: 'removed', oldValue: field });
        }
        for (const idx of meta.schema.indexes) {
            entries.push({ path: `indexes.${idx.name}`, type: 'removed', oldValue: idx });
        }
    } else if (meta.type === 'redis') {
        for (const pat of meta.schema.patterns) {
            entries.push({ path: `patterns.${pat.pattern}`, type: 'removed', oldValue: pat });
        }
    } else if (meta.type === 'influxdb') {
        for (const m of meta.schema.measurements) {
            entries.push({ path: `measurements.${m.name}`, type: 'removed', oldValue: m });
        }
    }
    return entries;
}

// ---------------------------------------------------------------------------
// SchemaChangeTracker
// ---------------------------------------------------------------------------

export interface SchemaChangeTrackerOptions {
    storageDir?: string;
}

export class SchemaChangeTracker {
    private storageDir: string;

    constructor(options: SchemaChangeTrackerOptions = {}) {
        this.storageDir = options.storageDir ?? '.schema-intelligence/history/';
    }

    // -----------------------------------------------------------------------
    // Directory helpers
    // -----------------------------------------------------------------------

    private schemaDir(database: string, schemaId: string): string {
        return join(this.storageDir, database, schemaId);
    }

    private historyFile(database: string): string {
        return join(this.storageDir, database, 'history.jsonl');
    }

    private async ensureDir(dir: string): Promise<void> {
        await mkdir(dir, { recursive: true });
    }

    // -----------------------------------------------------------------------
    // recordSnapshot
    // -----------------------------------------------------------------------

    async recordSnapshot(metadata: SchemaMetadata): Promise<SchemaSnapshot> {
        const now = new Date();
        const snapshot: SchemaSnapshot = {
            id: randomUUID(),
            schemaId: metadata.id,
            database: metadata.database,
            objectName: metadata.objectName,
            type: metadata.type,
            checksum: metadata.checksum,
            metadata,
            capturedAt: now,
        };

        const dir = this.schemaDir(metadata.database, metadata.id);
        await this.ensureDir(dir);

        const filename = `${now.toISOString().replace(/[:.]/g, '-')}.json`;
        const filePath = join(dir, filename);

        await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

        // Atomically update latest.json via write-to-temp-then-rename
        const latestPath = join(dir, 'latest.json');
        const tmpPath = join(dir, `.latest.${Date.now()}.tmp`);
        await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
        await rename(tmpPath, latestPath);

        return snapshot;
    }

    // -----------------------------------------------------------------------
    // getLatestSnapshot (private helper)
    // -----------------------------------------------------------------------

    private async getLatestSnapshot(database: string, schemaId: string): Promise<SchemaSnapshot | null> {
        const latestPath = join(this.schemaDir(database, schemaId), 'latest.json');
        try {
            const raw = await readFile(latestPath, 'utf-8');
            return JSON.parse(raw, dateReviver) as SchemaSnapshot;
        } catch {
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // getSnapshotById (private helper)
    // -----------------------------------------------------------------------

    private async findSnapshotById(snapshotId: string): Promise<SchemaSnapshot | null> {
        // Walk all databases/schemas to find a snapshot with the given id.
        // In practice the number of files is small so this is acceptable.
        try {
            const databases = await readdir(this.storageDir);
            for (const db of databases) {
                const dbDir = join(this.storageDir, db);
                const dbStat = await stat(dbDir);
                if (!dbStat.isDirectory()) continue;

                const schemas = await readdir(dbDir);
                for (const schemaName of schemas) {
                    if (schemaName === 'history.jsonl') continue;
                    const schemaDir = join(dbDir, schemaName);
                    const schemaStat = await stat(schemaDir);
                    if (!schemaStat.isDirectory()) continue;

                    const files = await readdir(schemaDir);
                    for (const file of files) {
                        if (!file.endsWith('.json') || file === 'latest.json') continue;
                        const raw = await readFile(join(schemaDir, file), 'utf-8');
                        const snap = JSON.parse(raw, dateReviver) as SchemaSnapshot;
                        if (snap.id === snapshotId) return snap;
                    }
                }
            }
        } catch {
            // storage doesn't exist yet
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // detectChanges
    // -----------------------------------------------------------------------

    /**
     * Compare current metadata against the last stored snapshots and return diffs.
     *
     * IMPORTANT: This method does NOT persist the new metadata as snapshots.
     * The caller must call `recordSnapshot()` for each schema after `detectChanges()`
     * to ensure subsequent calls diff against the updated state.
     */
    async detectChanges(current: SchemaMetadata[]): Promise<SchemaDiff[]> {
        const diffs: SchemaDiff[] = [];
        const now = new Date();

        // Gather the set of previously known schemaIds
        const previousIds = await this.getAllKnownSchemaIds();

        const currentIds = new Set(current.map(m => m.id));

        // Check each current schema against its latest snapshot
        for (const metadata of current) {
            const latest = await this.getLatestSnapshot(metadata.database, metadata.id);

            if (!latest) {
                // Newly created
                const changes = computeDiff(null, metadata);
                diffs.push({
                    schemaId: metadata.id,
                    database: metadata.database,
                    objectName: metadata.objectName,
                    before: null,
                    after: this.metadataToInlineSnapshot(metadata, now),
                    changes,
                    detectedAt: now,
                });
            } else if (latest.checksum !== metadata.checksum) {
                // Modified
                const changes = computeDiff(latest.metadata, metadata);
                if (changes.length > 0) {
                    diffs.push({
                        schemaId: metadata.id,
                        database: metadata.database,
                        objectName: metadata.objectName,
                        before: latest,
                        after: this.metadataToInlineSnapshot(metadata, now),
                        changes,
                        detectedAt: now,
                    });
                }
            }
            // Unchanged → no diff
        }

        // Check for deleted schemas
        for (const { database, schemaId, objectName, snapshot } of previousIds) {
            if (!currentIds.has(schemaId)) {
                const changes = computeDiff(snapshot.metadata, null);
                diffs.push({
                    schemaId,
                    database,
                    objectName,
                    before: snapshot,
                    after: null,
                    changes,
                    detectedAt: now,
                });
            }
        }

        // Persist history entries for each diff
        for (const diff of diffs) {
            const changeType: ChangeHistoryEntry['changeType'] =
                diff.before === null ? 'created' : diff.after === null ? 'deleted' : 'modified';

            const entry: ChangeHistoryEntry = {
                id: randomUUID(),
                schemaId: diff.schemaId,
                database: diff.database,
                objectName: diff.objectName,
                changeType,
                diff,
                timestamp: diff.detectedAt,
            };

            await this.appendHistory(diff.database, entry);
        }

        return diffs;
    }

    // -----------------------------------------------------------------------
    // getAllKnownSchemaIds (private helper)
    // -----------------------------------------------------------------------

    private async getAllKnownSchemaIds(): Promise<Array<{
        database: string;
        schemaId: string;
        objectName: string;
        snapshot: SchemaSnapshot;
    }>> {
        const results: Array<{
            database: string;
            schemaId: string;
            objectName: string;
            snapshot: SchemaSnapshot;
        }> = [];

        try {
            const databases = await readdir(this.storageDir);
            for (const db of databases) {
                const dbDir = join(this.storageDir, db);
                const dbStat = await stat(dbDir);
                if (!dbStat.isDirectory()) continue;

                const entries = await readdir(dbDir);
                for (const entry of entries) {
                    if (entry === 'history.jsonl') continue;
                    const schemaDir = join(dbDir, entry);
                    const entryStat = await stat(schemaDir);
                    if (!entryStat.isDirectory()) continue;

                    const latestPath = join(schemaDir, 'latest.json');
                    try {
                        const raw = await readFile(latestPath, 'utf-8');
                        const snap = JSON.parse(raw, dateReviver) as SchemaSnapshot;
                        results.push({
                            database: snap.database,
                            schemaId: snap.schemaId,
                            objectName: snap.objectName,
                            snapshot: snap,
                        });
                    } catch {
                        // no latest.json – skip
                    }
                }
            }
        } catch {
            // storageDir doesn't exist yet → no previous schemas
        }

        return results;
    }

    // -----------------------------------------------------------------------
    // metadataToInlineSnapshot helper
    // -----------------------------------------------------------------------

    private metadataToInlineSnapshot(metadata: SchemaMetadata, now: Date): SchemaSnapshot {
        return {
            id: randomUUID(),
            schemaId: metadata.id,
            database: metadata.database,
            objectName: metadata.objectName,
            type: metadata.type,
            checksum: metadata.checksum,
            metadata,
            capturedAt: now,
        };
    }

    // -----------------------------------------------------------------------
    // History persistence
    // -----------------------------------------------------------------------

    private async appendHistory(database: string, entry: ChangeHistoryEntry): Promise<void> {
        const file = this.historyFile(database);
        await this.ensureDir(join(this.storageDir, database));
        await writeFile(file, JSON.stringify(entry) + '\n', { flag: 'a', encoding: 'utf-8' });
    }

    private async readHistory(database: string): Promise<ChangeHistoryEntry[]> {
        const file = this.historyFile(database);
        try {
            const raw = await readFile(file, 'utf-8');
            return raw
                .split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => JSON.parse(line, dateReviver) as ChangeHistoryEntry);
        } catch {
            return [];
        }
    }

    private async readAllHistory(): Promise<ChangeHistoryEntry[]> {
        const all: ChangeHistoryEntry[] = [];
        try {
            const databases = await readdir(this.storageDir);
            for (const db of databases) {
                const dbDir = join(this.storageDir, db);
                const dbStat = await stat(dbDir);
                if (!dbStat.isDirectory()) continue;
                const entries = await this.readHistory(db);
                all.push(...entries);
            }
        } catch {
            // storage doesn't exist
        }
        // Sort newest first
        all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return all;
    }

    // -----------------------------------------------------------------------
    // getHistory
    // -----------------------------------------------------------------------

    async getHistory(schemaId: string, limit?: number): Promise<ChangeHistoryEntry[]> {
        const all = await this.readAllHistory();
        const filtered = all.filter(e => e.schemaId === schemaId);
        return limit !== undefined ? filtered.slice(0, limit) : filtered;
    }

    // -----------------------------------------------------------------------
    // getHistoryByDatabase
    // -----------------------------------------------------------------------

    async getHistoryByDatabase(database: string, limit?: number): Promise<ChangeHistoryEntry[]> {
        const entries = await this.readHistory(database);
        // Sort newest first
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return limit !== undefined ? entries.slice(0, limit) : entries;
    }

    // -----------------------------------------------------------------------
    // getRecentChanges
    // -----------------------------------------------------------------------

    async getRecentChanges(since?: Date, limit?: number): Promise<ChangeHistoryEntry[]> {
        let all = await this.readAllHistory();
        if (since) {
            const sinceTime = since.getTime();
            all = all.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
        }
        return limit !== undefined ? all.slice(0, limit) : all;
    }

    // -----------------------------------------------------------------------
    // getDiff
    // -----------------------------------------------------------------------

    getDiff(snapshotId1: string, snapshotId2: string): Promise<SchemaDiff>;
    getDiff(snapshot1: SchemaSnapshot, snapshot2: SchemaSnapshot): SchemaDiff;
    getDiff(
        a: string | SchemaSnapshot,
        b: string | SchemaSnapshot,
    ): SchemaDiff | Promise<SchemaDiff> {
        if (typeof a === 'string' && typeof b === 'string') {
            return this.getDiffByIds(a, b);
        }
        const s1 = a as SchemaSnapshot;
        const s2 = b as SchemaSnapshot;
        return this.computeSnapshotDiff(s1, s2);
    }

    private async getDiffByIds(id1: string, id2: string): Promise<SchemaDiff> {
        const s1 = await this.findSnapshotById(id1);
        const s2 = await this.findSnapshotById(id2);
        if (!s1) throw new Error(`Snapshot ${id1} not found`);
        if (!s2) throw new Error(`Snapshot ${id2} not found`);
        return this.computeSnapshotDiff(s1, s2);
    }

    private computeSnapshotDiff(s1: SchemaSnapshot, s2: SchemaSnapshot): SchemaDiff {
        const changes = computeDiff(s1.metadata, s2.metadata);
        return {
            schemaId: s2.schemaId,
            database: s2.database,
            objectName: s2.objectName,
            before: s1,
            after: s2,
            changes,
            detectedAt: new Date(),
        };
    }

    // -----------------------------------------------------------------------
    // rollbackInfo
    // -----------------------------------------------------------------------

    async rollbackInfo(schemaId: string): Promise<{
        current: SchemaSnapshot;
        previous: SchemaSnapshot | null;
    }> {
        // Find the database for the schemaId by scanning
        const known = await this.getAllKnownSchemaIds();
        const match = known.find(k => k.schemaId === schemaId);
        if (!match) throw new Error(`No snapshots found for schema ${schemaId}`);

        const dir = this.schemaDir(match.database, schemaId);
        const files = (await readdir(dir))
            .filter(f => f.endsWith('.json') && f !== 'latest.json')
            .sort(); // lexicographic sort = chronological for ISO timestamps

        if (files.length === 0) throw new Error(`No snapshots found for schema ${schemaId}`);

        const currentRaw = await readFile(join(dir, files[files.length - 1]), 'utf-8');
        const current = JSON.parse(currentRaw, dateReviver) as SchemaSnapshot;

        let previous: SchemaSnapshot | null = null;
        if (files.length >= 2) {
            const prevRaw = await readFile(join(dir, files[files.length - 2]), 'utf-8');
            previous = JSON.parse(prevRaw, dateReviver) as SchemaSnapshot;
        }

        return { current, previous };
    }

    // -----------------------------------------------------------------------
    // compact – remove snapshots older than retention period
    // -----------------------------------------------------------------------

    async compact(retentionDays: number = 90): Promise<{ removedSnapshots: number }> {
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        let removedSnapshots = 0;

        try {
            const databases = await readdir(this.storageDir);
            for (const db of databases) {
                const dbDir = join(this.storageDir, db);
                const dbStat = await stat(dbDir);
                if (!dbStat.isDirectory()) continue;

                const schemas = await readdir(dbDir);
                for (const schemaName of schemas) {
                    if (schemaName === 'history.jsonl') continue;
                    const schemaDir = join(dbDir, schemaName);
                    const schemaStat = await stat(schemaDir);
                    if (!schemaStat.isDirectory()) continue;

                    const files = (await readdir(schemaDir))
                        .filter(f => f.endsWith('.json') && f !== 'latest.json')
                        .sort();

                    // Never remove the latest snapshot (keep at least the most recent one)
                    const removable = files.slice(0, -1);

                    for (const file of removable) {
                        const filePath = join(schemaDir, file);
                        try {
                            const raw = await readFile(filePath, 'utf-8');
                            const snap = JSON.parse(raw, dateReviver) as SchemaSnapshot;
                            if (new Date(snap.capturedAt).getTime() < cutoff) {
                                await rm(filePath);
                                removedSnapshots++;
                            }
                        } catch {
                            // skip unreadable files
                        }
                    }
                }

                // Compact history.jsonl – remove entries older than cutoff
                await this.compactHistory(db, cutoff);
            }
        } catch {
            // storageDir doesn't exist – nothing to compact
        }

        return { removedSnapshots };
    }

    private async compactHistory(database: string, cutoffMs: number): Promise<void> {
        const entries = await this.readHistory(database);
        const kept = entries.filter(e => new Date(e.timestamp).getTime() >= cutoffMs);
        if (kept.length === entries.length) return; // nothing to remove

        const file = this.historyFile(database);
        const content = kept.map(e => JSON.stringify(e)).join('\n') + (kept.length > 0 ? '\n' : '');
        // Atomic write: write to temp file then rename
        const tmpFile = file + `.${Date.now()}.tmp`;
        await writeFile(tmpFile, content, 'utf-8');
        await rename(tmpFile, file);
    }
}
