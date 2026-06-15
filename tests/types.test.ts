/**
 * Unit tests for type definitions and type validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import type {
    TableColumn,
    TableIndex,
    TableConstraint,
    TableSchema,
    MongoFieldSchema,
    MongoCollectionSchema,
    RedisKeyPattern,
    RedisPatternSchema,
    InfluxMeasurement,
    InfluxBucketSchema,
    SchemaMetadata,
    SchemaChangeEvent,
    SchemaCrawlerConfig,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers – mirror the checksum logic used in the crawlers
// ---------------------------------------------------------------------------
function generateTableChecksum(schema: TableSchema): string {
    const data = JSON.stringify({
        columns: schema.columns,
        indexes: schema.indexes,
        constraints: schema.constraints,
    });
    return createHash('sha256').update(data).digest('hex');
}

function generateMongoChecksum(schema: MongoCollectionSchema): string {
    const data = JSON.stringify({
        fields: schema.fields,
        indexes: schema.indexes,
    });
    return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function makeTableColumn(overrides: Partial<TableColumn> = {}): TableColumn {
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
        columns: [makeTableColumn()],
        indexes: [],
        constraints: [],
        ...overrides,
    };
}

function makeMongoCollectionSchema(
    overrides: Partial<MongoCollectionSchema> = {}
): MongoCollectionSchema {
    return {
        database: 'testdb',
        collectionName: 'users',
        fields: [
            { name: '_id', types: ['objectId'], nullable: false },
            { name: 'email', types: ['string'], nullable: false },
        ],
        indexes: [{ name: '_id_', keys: { _id: 1 }, unique: true }],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('types – TableColumn', () => {
    it('should represent a basic column', () => {
        const col = makeTableColumn();
        assert.equal(col.name, 'id');
        assert.equal(col.type, 'integer');
        assert.equal(col.nullable, false);
        assert.equal(col.isPrimaryKey, true);
        assert.equal(col.isForeignKey, false);
        assert.equal(col.foreignKeyTarget, undefined);
    });

    it('should represent a foreign key column', () => {
        const col = makeTableColumn({
            name: 'user_id',
            type: 'integer',
            isForeignKey: true,
            isPrimaryKey: false,
            foreignKeyTarget: { table: 'public.users', column: 'id' },
        });
        assert.equal(col.isForeignKey, true);
        assert.deepEqual(col.foreignKeyTarget, {
            table: 'public.users',
            column: 'id',
        });
    });

    it('should support optional description and defaultValue', () => {
        const col = makeTableColumn({
            defaultValue: 'now()',
            description: 'creation timestamp',
        });
        assert.equal(col.defaultValue, 'now()');
        assert.equal(col.description, 'creation timestamp');
    });
});

describe('types – TableIndex', () => {
    it('should represent a unique index', () => {
        const idx: TableIndex = {
            name: 'users_email_unique',
            columns: ['email'],
            isUnique: true,
            isPrimary: false,
        };
        assert.equal(idx.isUnique, true);
        assert.deepEqual(idx.columns, ['email']);
    });

    it('should represent a composite index', () => {
        const idx: TableIndex = {
            name: 'idx_first_last',
            columns: ['first_name', 'last_name'],
            isUnique: false,
            isPrimary: false,
        };
        assert.equal(idx.columns.length, 2);
    });
});

describe('types – TableConstraint', () => {
    it('should accept each valid constraint type', () => {
        const types: TableConstraint['type'][] = [
            'PRIMARY KEY',
            'FOREIGN KEY',
            'UNIQUE',
            'CHECK',
        ];
        for (const t of types) {
            const c: TableConstraint = {
                name: `constraint_${t}`,
                type: t,
                columns: ['col1'],
                definition: `${t} (col1)`,
            };
            assert.equal(c.type, t);
        }
    });
});

describe('types – TableSchema', () => {
    it('should hold complete table information', () => {
        const schema = makeTableSchema({
            rowCount: 1000,
            sizeBytes: 65536,
            description: 'Primary users table',
        });
        assert.equal(schema.tableName, 'users');
        assert.equal(schema.rowCount, 1000);
        assert.equal(schema.sizeBytes, 65536);
        assert.equal(schema.columns.length, 1);
    });

    it('should allow optional fields to be undefined', () => {
        const schema = makeTableSchema();
        assert.equal(schema.rowCount, undefined);
        assert.equal(schema.sizeBytes, undefined);
        assert.equal(schema.description, undefined);
        assert.equal(schema.createdAt, undefined);
        assert.equal(schema.lastModified, undefined);
    });
});

describe('types – MongoFieldSchema', () => {
    it('should support multiple types for a field', () => {
        const field: MongoFieldSchema = {
            name: 'value',
            types: ['string', 'int'],
            nullable: true,
            commonValue: 'hello',
        };
        assert.deepEqual(field.types, ['string', 'int']);
        assert.equal(field.nullable, true);
    });
});

describe('types – MongoCollectionSchema', () => {
    it('should represent a collection with indexes', () => {
        const schema = makeMongoCollectionSchema({
            documentCount: 500,
            avgDocSize: 128,
        });
        assert.equal(schema.collectionName, 'users');
        assert.equal(schema.documentCount, 500);
        assert.equal(schema.indexes.length, 1);
    });
});

describe('types – RedisKeyPattern & RedisPatternSchema', () => {
    it('should represent a key pattern', () => {
        const pattern: RedisKeyPattern = {
            pattern: 'cache:user:*',
            type: 'string',
            exampleKeys: ['cache:user:1', 'cache:user:2'],
            count: 100,
            ttl: 3600,
            sampleValue: '{"name":"test"}',
        };
        assert.equal(pattern.pattern, 'cache:user:*');
        assert.equal(pattern.count, 100);
    });

    it('should represent a full scan result', () => {
        const schema: RedisPatternSchema = {
            database: 'redis-main',
            patterns: [],
            totalKeys: 0,
            lastScanned: new Date(),
        };
        assert.equal(schema.totalKeys, 0);
    });
});

describe('types – InfluxMeasurement & InfluxBucketSchema', () => {
    it('should represent a measurement', () => {
        const m: InfluxMeasurement = {
            name: 'cpu_usage',
            tags: ['host', 'region'],
            fields: ['value', 'count'],
            count: 1_000_000,
        };
        assert.equal(m.tags.length, 2);
        assert.equal(m.fields.length, 2);
    });

    it('should represent a bucket schema', () => {
        const b: InfluxBucketSchema = {
            database: 'metrics',
            bucketName: 'telemetry',
            orgName: 'caelum',
            retentionPeriod: 604800,
            measurements: [],
            lastScanned: new Date(),
        };
        assert.equal(b.retentionPeriod, 604800);
    });
});

describe('types – SchemaMetadata discriminated union', () => {
    it('should narrow to PostgresSchemaMetadata', () => {
        const meta: SchemaMetadata = {
            id: 'testdb.public.users',
            type: 'postgresql',
            database: 'testdb',
            objectName: 'users',
            fullName: 'public.users',
            description: 'Users table',
            lastScanned: new Date(),
            checksum: 'abc123',
            schema: makeTableSchema(),
        };
        assert.equal(meta.type, 'postgresql');
        // Discriminated union narrows: we can access schema as TableSchema
        if (meta.type === 'postgresql') {
            assert.equal(meta.schema.tableName, 'users');
        }
    });

    it('should narrow to MongoSchemaMetadata', () => {
        const meta: SchemaMetadata = {
            id: 'testdb.users',
            type: 'mongodb',
            database: 'testdb',
            objectName: 'users',
            fullName: 'users',
            description: 'Users collection',
            lastScanned: new Date(),
            checksum: 'def456',
            schema: makeMongoCollectionSchema(),
        };
        if (meta.type === 'mongodb') {
            assert.equal(meta.schema.collectionName, 'users');
        }
    });

    it('should narrow to RedisSchemaMetadata', () => {
        const redisSchema: RedisPatternSchema = {
            database: 'redis',
            patterns: [],
            totalKeys: 42,
            lastScanned: new Date(),
        };
        const meta: SchemaMetadata = {
            id: 'redis.patterns',
            type: 'redis',
            database: 'redis',
            objectName: 'redis_patterns',
            fullName: 'redis_patterns',
            description: 'Redis patterns',
            lastScanned: new Date(),
            checksum: 'ghi789',
            schema: redisSchema,
        };
        if (meta.type === 'redis') {
            assert.equal(meta.schema.totalKeys, 42);
        }
    });

    it('should narrow to InfluxDBSchemaMetadata', () => {
        const influxSchema: InfluxBucketSchema = {
            database: 'influx',
            bucketName: 'telemetry',
            orgName: 'caelum',
            measurements: [],
            lastScanned: new Date(),
        };
        const meta: SchemaMetadata = {
            id: 'influx.telemetry',
            type: 'influxdb',
            database: 'influx',
            objectName: 'telemetry',
            fullName: 'telemetry',
            description: 'Telemetry bucket',
            lastScanned: new Date(),
            checksum: 'jkl012',
            schema: influxSchema,
        };
        if (meta.type === 'influxdb') {
            assert.equal(meta.schema.bucketName, 'telemetry');
        }
    });

    it('should support MySQL type', () => {
        const meta: SchemaMetadata = {
            id: 'mysqldb.public.orders',
            type: 'mysql',
            database: 'mysqldb',
            objectName: 'orders',
            fullName: 'public.orders',
            description: 'Orders table',
            lastScanned: new Date(),
            checksum: 'mno345',
            schema: makeTableSchema({ tableName: 'orders', database: 'mysqldb' }),
        };
        assert.equal(meta.type, 'mysql');
    });
});

describe('types – SchemaChangeEvent', () => {
    it('should represent a CREATE event', () => {
        const event: SchemaChangeEvent = {
            type: 'CREATE',
            database: 'testdb',
            objectType: 'TABLE',
            objectName: 'users',
            timestamp: new Date(),
            details: { reason: 'initial crawl' },
        };
        assert.equal(event.type, 'CREATE');
        assert.equal(event.objectType, 'TABLE');
    });

    it('should accept all valid objectType values', () => {
        const types: SchemaChangeEvent['objectType'][] = [
            'TABLE',
            'COLUMN',
            'INDEX',
            'CONSTRAINT',
            'COLLECTION',
        ];
        for (const t of types) {
            const event: SchemaChangeEvent = {
                type: 'ALTER',
                database: 'db',
                objectType: t,
                objectName: 'obj',
                timestamp: new Date(),
                details: {},
            };
            assert.equal(event.objectType, t);
        }
    });
});

describe('types – SchemaCrawlerConfig', () => {
    it('should represent a valid configuration', () => {
        const config: SchemaCrawlerConfig = {
            databases: [
                {
                    type: 'postgresql',
                    connectionString: 'postgresql://user:pass@localhost:5432/db',
                },
                {
                    type: 'mongodb',
                    connectionString: 'mongodb://localhost:27017/testdb',
                    databases: ['testdb'],
                    excludeDatabases: ['admin'],
                },
                {
                    type: 'redis',
                    connectionString: 'redis://localhost:6379',
                },
                {
                    type: 'influxdb',
                    connectionString: 'http://localhost:8086?token=abc&org=caelum',
                },
            ],
            qdrantUrl: 'http://localhost:6333',
            qdrantCollection: 'schemas',
            embeddingModel: 'voyage',
            scanInterval: 60,
            enableChangeDetection: true,
        };
        assert.equal(config.databases.length, 4);
        assert.equal(config.scanInterval, 60);
        assert.equal(config.enableChangeDetection, true);
    });
});

describe('types – checksum generation helpers', () => {
    it('should produce a consistent SHA-256 hex string for a table', () => {
        const schema = makeTableSchema();
        const checksum = generateTableChecksum(schema);
        assert.match(checksum, /^[a-f0-9]{64}$/);
        // Same input should produce same checksum
        assert.equal(checksum, generateTableChecksum(schema));
    });

    it('should change when columns change', () => {
        const schema1 = makeTableSchema();
        const schema2 = makeTableSchema({
            columns: [
                makeTableColumn(),
                makeTableColumn({ name: 'email', type: 'varchar', isPrimaryKey: false }),
            ],
        });
        assert.notEqual(generateTableChecksum(schema1), generateTableChecksum(schema2));
    });

    it('should produce consistent checksum for mongo collections', () => {
        const schema = makeMongoCollectionSchema();
        const checksum = generateMongoChecksum(schema);
        assert.match(checksum, /^[a-f0-9]{64}$/);
        assert.equal(checksum, generateMongoChecksum(schema));
    });

    it('should change when mongo fields change', () => {
        const schema1 = makeMongoCollectionSchema();
        const schema2 = makeMongoCollectionSchema({
            fields: [
                { name: '_id', types: ['objectId'], nullable: false },
                { name: 'email', types: ['string'], nullable: false },
                { name: 'age', types: ['int'], nullable: true },
            ],
        });
        assert.notEqual(generateMongoChecksum(schema1), generateMongoChecksum(schema2));
    });
});
