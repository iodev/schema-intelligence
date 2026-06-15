/**
 * Tests for SchemaChangeTracker (Phase 2C)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { SchemaChangeTracker, computeDiff } from '../src/schema-change-tracker.js';
import type {
    PostgresSchemaMetadata,
    MongoSchemaMetadata,
    TableSchema,
    MongoCollectionSchema,
    DiffEntry,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTableSchema(overrides: Partial<TableSchema> = {}): TableSchema {
    return {
        database: 'testdb',
        schema: 'public',
        tableName: 'users',
        columns: [
            {
                name: 'id',
                type: 'integer',
                nullable: false,
                isPrimaryKey: true,
                isForeignKey: false,
            },
            {
                name: 'email',
                type: 'varchar',
                nullable: false,
                isPrimaryKey: false,
                isForeignKey: false,
            },
        ],
        indexes: [
            { name: 'users_pkey', columns: ['id'], isUnique: true, isPrimary: true },
            { name: 'idx_email', columns: ['email'], isUnique: true, isPrimary: false },
        ],
        constraints: [
            { name: 'users_pkey', type: 'PRIMARY KEY', columns: ['id'], definition: 'PRIMARY KEY (id)' },
        ],
        ...overrides,
    };
}

function checksumFor(schema: TableSchema): string {
    const data = JSON.stringify({
        columns: schema.columns,
        indexes: schema.indexes,
        constraints: schema.constraints,
    });
    return createHash('sha256').update(data).digest('hex');
}

function makePostgresMeta(overrides: Partial<PostgresSchemaMetadata> = {}): PostgresSchemaMetadata {
    const schema = overrides.schema ?? makeTableSchema();
    return {
        id: 'testdb.public.users',
        type: 'postgresql',
        database: 'testdb',
        objectName: 'users',
        fullName: 'public.users',
        description: 'Users table',
        lastScanned: new Date(),
        checksum: checksumFor(schema),
        schema,
        ...overrides,
    };
}

function makeMongoCollectionSchema(overrides: Partial<MongoCollectionSchema> = {}): MongoCollectionSchema {
    return {
        database: 'testdb',
        collectionName: 'profiles',
        fields: [
            { name: '_id', types: ['objectId'], nullable: false },
            { name: 'email', types: ['string'], nullable: false },
        ],
        indexes: [
            { name: '_id_', keys: { _id: 1 }, unique: true },
        ],
        ...overrides,
    };
}

function mongoChecksumFor(schema: MongoCollectionSchema): string {
    const data = JSON.stringify({
        fields: schema.fields,
        indexes: schema.indexes,
    });
    return createHash('sha256').update(data).digest('hex');
}

function makeMongoMeta(overrides: Partial<MongoSchemaMetadata> = {}): MongoSchemaMetadata {
    const schema = overrides.schema ?? makeMongoCollectionSchema();
    return {
        id: 'testdb.profiles',
        type: 'mongodb',
        database: 'testdb',
        objectName: 'profiles',
        fullName: 'profiles',
        description: 'Profiles collection',
        lastScanned: new Date(),
        checksum: mongoChecksumFor(schema),
        schema,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function makeTmpDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'schema-tracker-test-'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDiff – deep diff engine', () => {
    it('should return empty array when both are null', () => {
        const result = computeDiff(null, null);
        assert.deepEqual(result, []);
    });

    it('should return added entries for a newly created postgres table', () => {
        const meta = makePostgresMeta();
        const result = computeDiff(null, meta);
        assert.ok(result.length > 0);
        for (const entry of result) {
            assert.equal(entry.type, 'added');
        }
        // Should have entries for columns, indexes, constraints
        const paths = result.map(e => e.path);
        assert.ok(paths.some(p => p.startsWith('columns.')));
        assert.ok(paths.some(p => p.startsWith('indexes.')));
        assert.ok(paths.some(p => p.startsWith('constraints.')));
    });

    it('should return removed entries for a deleted postgres table', () => {
        const meta = makePostgresMeta();
        const result = computeDiff(meta, null);
        assert.ok(result.length > 0);
        for (const entry of result) {
            assert.equal(entry.type, 'removed');
        }
    });

    it('should detect column addition in a postgres table', () => {
        const before = makePostgresMeta();
        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'age', type: 'integer', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const after = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        const result = computeDiff(before, after);
        const added = result.filter(e => e.type === 'added');
        assert.ok(added.some(e => e.path === 'columns.age'));
    });

    it('should detect column removal in a postgres table', () => {
        const before = makePostgresMeta();
        const newSchema = makeTableSchema({
            columns: [makeTableSchema().columns[0]], // only 'id', remove 'email'
        });
        const after = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        const result = computeDiff(before, after);
        const removed = result.filter(e => e.type === 'removed');
        assert.ok(removed.some(e => e.path === 'columns.email'));
    });

    it('should detect column type change in a postgres table', () => {
        const before = makePostgresMeta();
        const newSchema = makeTableSchema({
            columns: [
                makeTableSchema().columns[0],
                { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const after = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        const result = computeDiff(before, after);
        const modified = result.filter(e => e.type === 'modified');
        assert.ok(modified.some(e => e.path === 'columns.email.type'));
        const typeChange = modified.find(e => e.path === 'columns.email.type');
        assert.equal(typeChange?.oldValue, 'varchar');
        assert.equal(typeChange?.newValue, 'text');
    });

    it('should detect index addition', () => {
        const before = makePostgresMeta();
        const newSchema = makeTableSchema({
            indexes: [
                ...makeTableSchema().indexes,
                { name: 'idx_new', columns: ['email', 'id'], isUnique: false, isPrimary: false },
            ],
        });
        const after = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        const result = computeDiff(before, after);
        assert.ok(result.some(e => e.path === 'indexes.idx_new' && e.type === 'added'));
    });

    it('should produce no diffs for identical schemas', () => {
        const meta = makePostgresMeta();
        const result = computeDiff(meta, meta);
        assert.deepEqual(result, []);
    });
});

describe('computeDiff – MongoDB collection changes', () => {
    it('should return added entries for a new mongo collection', () => {
        const meta = makeMongoMeta();
        const result = computeDiff(null, meta);
        assert.ok(result.length > 0);
        for (const entry of result) {
            assert.equal(entry.type, 'added');
        }
        const paths = result.map(e => e.path);
        assert.ok(paths.some(p => p.startsWith('fields.')));
        assert.ok(paths.some(p => p.startsWith('indexes.')));
    });

    it('should detect field addition in a mongo collection', () => {
        const before = makeMongoMeta();
        const newSchema = makeMongoCollectionSchema({
            fields: [
                ...makeMongoCollectionSchema().fields,
                { name: 'age', types: ['int'], nullable: true },
            ],
        });
        const after = makeMongoMeta({ schema: newSchema, checksum: mongoChecksumFor(newSchema) });
        const result = computeDiff(before, after);
        assert.ok(result.some(e => e.path === 'fields.age' && e.type === 'added'));
    });

    it('should detect field removal in a mongo collection', () => {
        const before = makeMongoMeta();
        const newSchema = makeMongoCollectionSchema({
            fields: [makeMongoCollectionSchema().fields[0]], // only _id
        });
        const after = makeMongoMeta({ schema: newSchema, checksum: mongoChecksumFor(newSchema) });
        const result = computeDiff(before, after);
        assert.ok(result.some(e => e.path === 'fields.email' && e.type === 'removed'));
    });

    it('should detect field type change in a mongo collection', () => {
        const before = makeMongoMeta();
        const newSchema = makeMongoCollectionSchema({
            fields: [
                { name: '_id', types: ['objectId'], nullable: false },
                { name: 'email', types: ['string', 'null'], nullable: true },
            ],
        });
        const after = makeMongoMeta({ schema: newSchema, checksum: mongoChecksumFor(newSchema) });
        const result = computeDiff(before, after);
        const modified = result.filter(e => e.type === 'modified');
        assert.ok(modified.some(e => e.path === 'fields.email.types'));
        assert.ok(modified.some(e => e.path === 'fields.email.nullable'));
    });
});

describe('SchemaChangeTracker – snapshot recording', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should record a snapshot and return it', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        const snapshot = await tracker.recordSnapshot(meta);

        assert.ok(snapshot.id);
        assert.equal(snapshot.schemaId, meta.id);
        assert.equal(snapshot.database, 'testdb');
        assert.equal(snapshot.objectName, 'users');
        assert.equal(snapshot.checksum, meta.checksum);
        assert.ok(snapshot.capturedAt instanceof Date);
    });

    it('should persist snapshot to disk', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        await tracker.recordSnapshot(meta);

        // Check files exist
        const schemaDir = join(tmpDir, 'testdb', 'testdb.public.users');
        const files = await readdir(schemaDir);
        assert.ok(files.includes('latest.json'));
        assert.ok(files.length >= 2); // timestamp file + latest.json
    });

    it('should record multiple snapshots for the same schema', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        const snap1 = await tracker.recordSnapshot(meta);
        // Small delay to get different timestamp filenames
        await new Promise(resolve => setTimeout(resolve, 10));
        const snap2 = await tracker.recordSnapshot(meta);

        assert.notEqual(snap1.id, snap2.id);

        const schemaDir = join(tmpDir, 'testdb', 'testdb.public.users');
        const files = (await readdir(schemaDir)).filter(f => f !== 'latest.json');
        assert.equal(files.length, 2);
    });
});

describe('SchemaChangeTracker – change detection', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should detect new schemas on first scan (everything is "created")', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        const diffs = await tracker.detectChanges([meta]);

        assert.equal(diffs.length, 1);
        assert.equal(diffs[0].schemaId, meta.id);
        assert.equal(diffs[0].before, null);
        assert.ok(diffs[0].after !== null);
        assert.ok(diffs[0].changes.length > 0);
        // All changes should be 'added'
        for (const change of diffs[0].changes) {
            assert.equal(change.type, 'added');
        }
    });

    it('should produce no diffs when schemas are unchanged', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        // First scan – detect + record
        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        // Second scan – same metadata
        const diffs = await tracker.detectChanges([meta]);
        assert.equal(diffs.length, 0);
    });

    it('should detect modified schemas', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const metaV1 = makePostgresMeta();

        await tracker.detectChanges([metaV1]);
        await tracker.recordSnapshot(metaV1);

        // Modify the schema
        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'age', type: 'integer', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const metaV2 = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });

        const diffs = await tracker.detectChanges([metaV2]);
        assert.equal(diffs.length, 1);
        assert.ok(diffs[0].before !== null);
        assert.ok(diffs[0].after !== null);
        assert.ok(diffs[0].changes.some((e: DiffEntry) => e.path === 'columns.age' && e.type === 'added'));
    });

    it('should detect deleted schemas', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        // Second scan – schema is gone
        const diffs = await tracker.detectChanges([]);
        assert.equal(diffs.length, 1);
        assert.equal(diffs[0].schemaId, meta.id);
        assert.ok(diffs[0].before !== null);
        assert.equal(diffs[0].after, null);
        for (const change of diffs[0].changes) {
            assert.equal(change.type, 'removed');
        }
    });
});

describe('SchemaChangeTracker – history queries', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should store and retrieve history for a schema', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        // First scan
        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        const history = await tracker.getHistory(meta.id);
        assert.equal(history.length, 1);
        assert.equal(history[0].schemaId, meta.id);
        assert.equal(history[0].changeType, 'created');
    });

    it('should limit history results', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        // Scan 1 – create
        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        // Scan 2 – modify
        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'age', type: 'integer', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const metaV2 = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        await tracker.detectChanges([metaV2]);
        await tracker.recordSnapshot(metaV2);

        const all = await tracker.getHistory(meta.id);
        assert.equal(all.length, 2);

        const limited = await tracker.getHistory(meta.id, 1);
        assert.equal(limited.length, 1);
    });

    it('should retrieve history by database', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        const history = await tracker.getHistoryByDatabase('testdb');
        assert.equal(history.length, 1);
        assert.equal(history[0].database, 'testdb');
    });

    it('should retrieve recent changes', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        const before = new Date(Date.now() - 1000);

        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        const recent = await tracker.getRecentChanges(before);
        assert.equal(recent.length, 1);

        // Future date should return nothing
        const future = new Date(Date.now() + 60000);
        const none = await tracker.getRecentChanges(future);
        assert.equal(none.length, 0);
    });

    it('should limit recent changes', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const pg = makePostgresMeta();
        const mongo = makeMongoMeta();

        await tracker.detectChanges([pg, mongo]);
        await tracker.recordSnapshot(pg);
        await tracker.recordSnapshot(mongo);

        const all = await tracker.getRecentChanges();
        assert.equal(all.length, 2);

        const limited = await tracker.getRecentChanges(undefined, 1);
        assert.equal(limited.length, 1);
    });
});

describe('SchemaChangeTracker – getDiff between snapshots', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should compute diff between two snapshots by id', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const metaV1 = makePostgresMeta();
        const snap1 = await tracker.recordSnapshot(metaV1);

        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'phone', type: 'varchar', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const metaV2 = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        const snap2 = await tracker.recordSnapshot(metaV2);

        const diff = await tracker.getDiff(snap1.id, snap2.id);
        assert.ok(diff.changes.some(e => e.path === 'columns.phone' && e.type === 'added'));
        assert.ok(diff.before !== null);
        assert.ok(diff.after !== null);
    });

    it('should throw for non-existent snapshot ids', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        await assert.rejects(
            () => tracker.getDiff('nonexistent-1', 'nonexistent-2'),
            /not found/
        );
    });
});

describe('SchemaChangeTracker – rollbackInfo', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should return current and previous snapshots', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const metaV1 = makePostgresMeta();
        await tracker.recordSnapshot(metaV1);
        await new Promise(resolve => setTimeout(resolve, 10));

        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'age', type: 'integer', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const metaV2 = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        await tracker.recordSnapshot(metaV2);

        const info = await tracker.rollbackInfo(metaV1.id);
        assert.ok(info.current);
        assert.ok(info.previous);
        assert.equal(info.current.checksum, metaV2.checksum);
        assert.equal(info.previous.checksum, metaV1.checksum);
    });

    it('should return null previous when only one snapshot exists', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        await tracker.recordSnapshot(meta);

        const info = await tracker.rollbackInfo(meta.id);
        assert.ok(info.current);
        assert.equal(info.previous, null);
    });

    it('should throw for unknown schemaId', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        await assert.rejects(
            () => tracker.rollbackInfo('nonexistent'),
            /No snapshots found/
        );
    });
});

describe('SchemaChangeTracker – compact', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should remove old snapshots but keep the latest', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        // Record two snapshots
        await tracker.recordSnapshot(meta);
        await new Promise(resolve => setTimeout(resolve, 10));
        await tracker.recordSnapshot(meta);

        const schemaDir = join(tmpDir, 'testdb', 'testdb.public.users');
        const filesBefore = (await readdir(schemaDir)).filter(f => f !== 'latest.json');
        assert.equal(filesBefore.length, 2);

        // Compact with 0 retention days (remove everything older than now)
        const result = await tracker.compact(0);
        assert.ok(result.removedSnapshots >= 1);

        const filesAfter = (await readdir(schemaDir)).filter(f => f !== 'latest.json');
        // Should keep at least the most recent snapshot
        assert.ok(filesAfter.length >= 1);
    });

    it('should not remove anything when within retention period', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        await tracker.recordSnapshot(meta);

        const result = await tracker.compact(365);
        assert.equal(result.removedSnapshots, 0);
    });

    it('should compact history.jsonl', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        // Create history entries
        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        const historyFile = join(tmpDir, 'testdb', 'history.jsonl');
        const contentBefore = await readFile(historyFile, 'utf-8');
        assert.ok(contentBefore.trim().length > 0);

        // Compact with 0 retention – should remove all history entries
        await tracker.compact(0);

        const contentAfter = await readFile(historyFile, 'utf-8');
        // History should be empty (all entries older than "now")
        assert.equal(contentAfter.trim(), '');
    });
});

describe('SchemaChangeTracker – file persistence', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should persist data that survives new tracker instances', async () => {
        const tracker1 = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        await tracker1.detectChanges([meta]);
        await tracker1.recordSnapshot(meta);

        // Create a new tracker instance pointing to the same dir
        const tracker2 = new SchemaChangeTracker({ storageDir: tmpDir });

        // Second scan should detect no changes (snapshots persisted)
        const diffs = await tracker2.detectChanges([meta]);
        assert.equal(diffs.length, 0);

        // History should be readable
        const history = await tracker2.getHistory(meta.id);
        assert.equal(history.length, 1);
    });

    it('should store snapshots in expected directory structure', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();
        await tracker.recordSnapshot(meta);

        // Expected: {tmpDir}/testdb/testdb.public.users/*.json
        const dbDir = join(tmpDir, 'testdb');
        const dbEntries = await readdir(dbDir);
        assert.ok(dbEntries.includes('testdb.public.users'));

        const schemaDir = join(dbDir, 'testdb.public.users');
        const schemaEntries = await readdir(schemaDir);
        assert.ok(schemaEntries.includes('latest.json'));
    });

    it('should store history as append-only JSONL', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const meta = makePostgresMeta();

        await tracker.detectChanges([meta]);
        await tracker.recordSnapshot(meta);

        // Modify and detect again
        const newSchema = makeTableSchema({
            columns: [
                ...makeTableSchema().columns,
                { name: 'age', type: 'integer', nullable: true, isPrimaryKey: false, isForeignKey: false },
            ],
        });
        const metaV2 = makePostgresMeta({ schema: newSchema, checksum: checksumFor(newSchema) });
        await tracker.detectChanges([metaV2]);

        const historyFile = join(tmpDir, 'testdb', 'history.jsonl');
        const content = await readFile(historyFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        assert.equal(lines.length, 2); // 'created' + 'modified'

        // Each line should be valid JSON
        for (const line of lines) {
            const parsed = JSON.parse(line);
            assert.ok(parsed.id);
            assert.ok(parsed.schemaId);
            assert.ok(parsed.changeType);
        }
    });
});

describe('SchemaChangeTracker – edge cases', () => {
    beforeEach(async () => {
        tmpDir = await makeTmpDir();
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it('should handle first scan with multiple schemas', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const pg = makePostgresMeta();
        const mongo = makeMongoMeta();

        const diffs = await tracker.detectChanges([pg, mongo]);
        assert.equal(diffs.length, 2);
        // Both should be "created"
        for (const diff of diffs) {
            assert.equal(diff.before, null);
            assert.ok(diff.after !== null);
        }
    });

    it('should handle empty scan gracefully', async () => {
        const tracker = new SchemaChangeTracker({ storageDir: tmpDir });
        const diffs = await tracker.detectChanges([]);
        assert.deepEqual(diffs, []);
    });

    it('should handle description changes', async () => {
        const before = makePostgresMeta({ description: 'Old description' });
        const after = makePostgresMeta({ description: 'New description' });
        const result = computeDiff(before, after);
        assert.ok(result.some(e => e.path === 'description' && e.type === 'modified'));
    });

    it('should use default storage dir when none provided', () => {
        const tracker = new SchemaChangeTracker();
        // Should not throw
        assert.ok(tracker);
    });
});
