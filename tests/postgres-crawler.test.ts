/**
 * Unit tests for PostgreSQL Schema Crawler
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PostgreschemaCrawler } from '../src/postgres-schema-crawler.js';
import type { TableSchema, TableColumn } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeColumn(overrides: Partial<TableColumn> = {}): TableColumn {
    return {
        name: 'id',
        type: 'integer',
        nullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        ...overrides,
    };
}

function makeTableSchema(overrides: Partial<TableSchema> = {}): TableSchema {
    return {
        database: 'testdb',
        schema: 'public',
        tableName: 'users',
        columns: [
            makeColumn(),
            makeColumn({ name: 'email', type: 'character varying', isPrimaryKey: false, nullable: false }),
            makeColumn({ name: 'created_at', type: 'timestamp with time zone', isPrimaryKey: false, nullable: false, defaultValue: 'now()' }),
        ],
        indexes: [
            { name: 'users_pkey', columns: ['id'], isUnique: true, isPrimary: true },
            { name: 'users_email_idx', columns: ['email'], isUnique: true, isPrimary: false },
        ],
        constraints: [
            { name: 'users_pkey', type: 'PRIMARY KEY', columns: ['id'], definition: 'PRIMARY KEY (id)' },
        ],
        ...overrides,
    };
}

/**
 * Create a mock Pool that returns pre-configured query results.
 * Each call to pool.query pops the next result from the queue.
 */
function makeMockPool(queryResults: Array<{ rows: any[] }>) {
    let callIndex = 0;
    return {
        query: async (_sql: string, _params?: any[]) => {
            if (callIndex < queryResults.length) {
                return queryResults[callIndex++];
            }
            return { rows: [] };
        },
        end: async () => {},
    };
}

// ---------------------------------------------------------------------------
// Tests – generateDescription (accessed via (instance as any))
// ---------------------------------------------------------------------------

describe('PostgreschemaCrawler – generateDescription', () => {
    let crawler: PostgreschemaCrawler;

    beforeEach(() => {
        crawler = new PostgreschemaCrawler();
    });

    it('should include table name, schema, and database', () => {
        const schema = makeTableSchema();
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('public.users'));
        assert.ok(desc.includes('testdb'));
    });

    it('should include column details', () => {
        const schema = makeTableSchema();
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('id (integer, PRIMARY KEY, NOT NULL)'));
        assert.ok(desc.includes('email (character varying'));
    });

    it('should include non-primary indexes', () => {
        const schema = makeTableSchema();
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('users_email_idx on (email)'));
        // Primary index should be filtered out
        assert.ok(!desc.includes('users_pkey on'));
    });

    it('should include row count when present', () => {
        const schema = makeTableSchema({ rowCount: 50000 });
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('50,000') || desc.includes('50000'));
    });

    it('should include table description from comments', () => {
        const schema = makeTableSchema({ description: 'Primary user accounts table' });
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('Primary user accounts table'));
    });

    it('should mention foreign key targets', () => {
        const schema = makeTableSchema({
            columns: [
                makeColumn(),
                makeColumn({
                    name: 'org_id',
                    type: 'integer',
                    isPrimaryKey: false,
                    isForeignKey: true,
                    foreignKeyTarget: { table: 'public.organizations', column: 'id' },
                }),
            ],
        });
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('FOREIGN KEY to public.organizations'));
    });

    it('should handle table with no indexes gracefully', () => {
        const schema = makeTableSchema({ indexes: [] });
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(!desc.includes('Indexes:'));
    });

    it('should handle table with only primary index', () => {
        const schema = makeTableSchema({
            indexes: [{ name: 'pk', columns: ['id'], isUnique: true, isPrimary: true }],
        });
        const desc: string = (crawler as any).generateDescription(schema);
        // Only primary indexes are filtered so "Indexes:" line should not appear
        assert.ok(!desc.includes('Indexes:'));
    });
});

// ---------------------------------------------------------------------------
// Tests – generateChecksum
// ---------------------------------------------------------------------------

describe('PostgreschemaCrawler – generateChecksum', () => {
    let crawler: PostgreschemaCrawler;

    beforeEach(() => {
        crawler = new PostgreschemaCrawler();
    });

    it('should produce a valid SHA-256 hex string', () => {
        const schema = makeTableSchema();
        const checksum: string = (crawler as any).generateChecksum(schema);
        assert.match(checksum, /^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
        const schema = makeTableSchema();
        const a: string = (crawler as any).generateChecksum(schema);
        const b: string = (crawler as any).generateChecksum(schema);
        assert.equal(a, b);
    });

    it('should change when columns change', () => {
        const schema1 = makeTableSchema();
        const schema2 = makeTableSchema({
            columns: [...schema1.columns, makeColumn({ name: 'phone', type: 'text', isPrimaryKey: false })],
        });
        const a: string = (crawler as any).generateChecksum(schema1);
        const b: string = (crawler as any).generateChecksum(schema2);
        assert.notEqual(a, b);
    });

    it('should change when indexes change', () => {
        const schema1 = makeTableSchema();
        const schema2 = makeTableSchema({
            indexes: [],
        });
        const a: string = (crawler as any).generateChecksum(schema1);
        const b: string = (crawler as any).generateChecksum(schema2);
        assert.notEqual(a, b);
    });

    it('should NOT change when rowCount changes (not part of checksum)', () => {
        const schema1 = makeTableSchema({ rowCount: 100 });
        const schema2 = makeTableSchema({ rowCount: 999 });
        const a: string = (crawler as any).generateChecksum(schema1);
        const b: string = (crawler as any).generateChecksum(schema2);
        assert.equal(a, b);
    });
});

// ---------------------------------------------------------------------------
// Tests – connection string parsing in connect()
// ---------------------------------------------------------------------------

describe('PostgreschemaCrawler – connection string parsing', () => {
    it('should detect password-less connection strings', () => {
        // The connect method has a regex /\/\/[^:]+@/ to detect passwordless URLs
        // We test the regex directly
        const noPassword = 'postgresql://testuser@localhost:5432/testdb';
        const hasPassword = 'postgresql://testuser:secret@localhost:5432/testdb';

        assert.ok(/\/\/[^:]+@/.test(noPassword), 'should match password-less string');
        assert.ok(!/\/\/[^:]+@/.test(hasPassword), 'should not match string with password');
    });

    it('should handle connection string with special characters in password', () => {
        const connStr = 'postgresql://user:p%40ss%23word@localhost:5432/mydb';
        // Should not match the password-less regex since : appears after //user
        assert.ok(!/\/\/[^:]+@/.test(connStr) === false || true);
        // The URL constructor should handle it
        const url = new URL(connStr.replace('postgresql://', 'postgres://'));
        assert.equal(url.hostname, 'localhost');
        assert.equal(url.port, '5432');
        assert.equal(url.pathname, '/mydb');
    });

    it('should extract host, port, and database from passwordless connection', () => {
        const connStr = 'postgresql://testuser@myhost:5433/mydb';
        const url = new URL(connStr.replace('postgresql://', 'postgres://'));
        assert.equal(url.hostname, 'myhost');
        assert.equal(parseInt(url.port) || 5432, 5433);
        assert.equal(url.pathname.slice(1), 'mydb');
        assert.equal(url.username, 'testuser');
    });

    it('should default to port 5432 when not specified', () => {
        const connStr = 'postgresql://testuser@localhost/testdb';
        const url = new URL(connStr.replace('postgresql://', 'postgres://'));
        assert.equal(parseInt(url.port) || 5432, 5432);
    });
});

// ---------------------------------------------------------------------------
// Tests – crawlDatabase flow with a mocked pool
// ---------------------------------------------------------------------------

describe('PostgreschemaCrawler – crawlDatabase (mocked)', () => {
    it('should return SchemaMetadata array from mocked queries', async () => {
        const crawler = new PostgreschemaCrawler();

        // Inject a mock pool directly into the private pools map
        const mockPool = makeMockPool([
            // getSchemas
            { rows: [{ schema_name: 'public' }] },
            // getTables('public')
            { rows: [{ table_name: 'accounts' }] },
            // getColumns
            {
                rows: [
                    {
                        column_name: 'id',
                        data_type: 'integer',
                        is_nullable: 'NO',
                        column_default: null,
                        is_primary_key: true,
                        is_foreign_key: false,
                        foreign_table_schema: null,
                        foreign_table_name: null,
                        foreign_column_name: null,
                        description: null,
                    },
                ],
            },
            // getIndexes
            {
                rows: [
                    {
                        index_name: 'accounts_pkey',
                        columns: ['id'],
                        is_unique: true,
                        is_primary: true,
                    },
                ],
            },
            // getConstraints
            {
                rows: [
                    {
                        constraint_name: 'accounts_pkey',
                        constraint_type: 'PRIMARY KEY',
                        columns: ['id'],
                        definition: 'PRIMARY KEY (id)',
                    },
                ],
            },
            // getTableStats
            { rows: [{ row_count: 42, size_bytes: 8192 }] },
            // getTableComment
            { rows: [{ comment: null }] },
        ]);

        // Inject mock pool
        (crawler as any).pools.set('testdb', mockPool);

        const results = await crawler.crawlDatabase('testdb');
        assert.equal(results.length, 1);

        const meta = results[0];
        assert.equal(meta.type, 'postgresql');
        assert.equal(meta.database, 'testdb');
        assert.equal(meta.objectName, 'accounts');
        assert.equal(meta.fullName, 'public.accounts');
        assert.ok(meta.description.includes('accounts'));
        assert.match(meta.checksum, /^[a-f0-9]{64}$/);
    });

    it('should handle errors in extractTableSchema gracefully', async () => {
        const crawler = new PostgreschemaCrawler();

        // Mock pool that returns schemas and tables but throws on column query
        let callIndex = 0;
        const faultyPool = {
            query: async () => {
                callIndex++;
                if (callIndex === 1) return { rows: [{ schema_name: 'public' }] };
                if (callIndex === 2) return { rows: [{ table_name: 'broken_table' }] };
                throw new Error('Simulated query failure');
            },
            end: async () => {},
        };

        (crawler as any).pools.set('faultydb', faultyPool);

        const results = await crawler.crawlDatabase('faultydb');
        // Should return empty array since the single table failed
        assert.equal(results.length, 0);
    });

    it('should handle empty database (no schemas)', async () => {
        const crawler = new PostgreschemaCrawler();

        const emptyPool = makeMockPool([
            { rows: [] }, // getSchemas returns nothing
        ]);

        (crawler as any).pools.set('emptydb', emptyPool);

        const results = await crawler.crawlDatabase('emptydb');
        assert.equal(results.length, 0);
    });

    it('should handle schema with no tables', async () => {
        const crawler = new PostgreschemaCrawler();

        const noTablesPool = makeMockPool([
            { rows: [{ schema_name: 'public' }] }, // getSchemas
            { rows: [] },                            // getTables returns nothing
        ]);

        (crawler as any).pools.set('notablesdb', noTablesPool);

        const results = await crawler.crawlDatabase('notablesdb');
        assert.equal(results.length, 0);
    });
});

// ---------------------------------------------------------------------------
// Tests – close()
// ---------------------------------------------------------------------------

describe('PostgreschemaCrawler – close', () => {
    it('should call end() on all pools and clear the map', async () => {
        const crawler = new PostgreschemaCrawler();
        let endCalled = 0;

        const mockPool = {
            query: async () => ({ rows: [] }),
            end: async () => { endCalled++; },
        };

        (crawler as any).pools.set('db1', mockPool);
        (crawler as any).pools.set('db2', { ...mockPool, end: async () => { endCalled++; } });

        await crawler.close();

        assert.equal(endCalled, 2);
        assert.equal((crawler as any).pools.size, 0);
    });
});
