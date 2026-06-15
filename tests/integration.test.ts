/**
 * Integration tests for Schema Intelligence
 *
 * These tests require running Docker services. They are skipped unless
 * the environment variable RUN_INTEGRATION_TESTS=1 is set.
 *
 * To run:
 *   docker compose -f docker-compose.test.yml up -d
 *   RUN_INTEGRATION_TESTS=1 node --test tests/integration.test.js
 *   docker compose -f docker-compose.test.yml down
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const SKIP = process.env.RUN_INTEGRATION_TESTS !== '1';

// Conditional imports – only needed when integration tests actually run.
// We import them at the top level so TypeScript can check them, but we gate
// all test bodies on the SKIP flag.
import { PostgreschemaCrawler } from '../src/postgres-schema-crawler.js';
import { MongoDBSchemaCrawler } from '../src/mongodb-schema-crawler.js';
import { RedisPatternCrawler } from '../src/redis-pattern-crawler.js';
import { SchemaVectorizer } from '../src/schema-vectorizer.js';

// ---------------------------------------------------------------------------
// Connection details – matching docker-compose.test.yml
// ---------------------------------------------------------------------------
const PG_CONN = 'postgresql://test:test@localhost:5433/testdb';
const MONGO_CONN = 'mongodb://localhost:27018/testdb';
const REDIS_CONN = 'redis://localhost:6380';
const QDRANT_URL = 'http://localhost:6334';

// ---------------------------------------------------------------------------
// PostgreSQL integration
// ---------------------------------------------------------------------------

describe('Integration – PostgreSQL crawler', { skip: SKIP ? 'RUN_INTEGRATION_TESTS not set' : false }, () => {
    let crawler: PostgreschemaCrawler;

    before(async () => {
        crawler = new PostgreschemaCrawler();
        await crawler.connect(PG_CONN, 'testdb');

        // Create test table
        const pool = (crawler as any).pools.get('testdb');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS integration_users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                name TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await pool.query(`
            INSERT INTO integration_users (email, name)
            VALUES ('alice@test.com', 'Alice'), ('bob@test.com', 'Bob')
            ON CONFLICT (email) DO NOTHING
        `);
    });

    after(async () => {
        if (crawler) {
            const pool = (crawler as any).pools.get('testdb');
            await pool.query('DROP TABLE IF EXISTS integration_users');
            await crawler.close();
        }
    });

    it('should crawl and find the test table', async () => {
        const results = await crawler.crawlDatabase('testdb');
        const userTable = results.find(r => r.objectName === 'integration_users');
        assert.ok(userTable, 'Should find integration_users table');
        assert.equal(userTable!.type, 'postgresql');
        assert.ok(userTable!.description.includes('integration_users'));
    });

    it('should extract correct columns', async () => {
        const schema = await crawler.extractTableSchema('testdb', 'public', 'integration_users');
        const colNames = schema.columns.map(c => c.name);
        assert.ok(colNames.includes('id'));
        assert.ok(colNames.includes('email'));
        assert.ok(colNames.includes('name'));
        assert.ok(colNames.includes('created_at'));

        const idCol = schema.columns.find(c => c.name === 'id');
        assert.ok(idCol?.isPrimaryKey);
    });
});

// ---------------------------------------------------------------------------
// MongoDB integration
// ---------------------------------------------------------------------------

describe('Integration – MongoDB crawler', { skip: SKIP ? 'RUN_INTEGRATION_TESTS not set' : false }, () => {
    let crawler: MongoDBSchemaCrawler;

    before(async () => {
        crawler = new MongoDBSchemaCrawler();
        await crawler.connect(MONGO_CONN, 'testdb');

        // Insert test data
        const db = (crawler as any).databases.get('testdb');
        const collection = db.collection('integration_events');
        await collection.deleteMany({});
        await collection.insertMany([
            { type: 'click', userId: 1, timestamp: new Date(), data: { x: 10, y: 20 } },
            { type: 'view', userId: 2, timestamp: new Date(), data: { page: '/home' } },
            { type: 'click', userId: 1, timestamp: new Date(), data: { x: 30, y: 40 } },
        ]);
        await collection.createIndex({ type: 1, timestamp: -1 });
    });

    after(async () => {
        if (crawler) {
            const db = (crawler as any).databases.get('testdb');
            await db.collection('integration_events').drop().catch(() => {});
            await crawler.close();
        }
    });

    it('should crawl and find the test collection', async () => {
        const results = await crawler.crawlDatabase('testdb');
        const events = results.find(r => r.objectName === 'integration_events');
        assert.ok(events, 'Should find integration_events collection');
        assert.equal(events!.type, 'mongodb');
    });

    it('should extract correct fields from sampled documents', async () => {
        const schema = await crawler.extractCollectionSchema('testdb', 'integration_events');
        const fieldNames = schema.fields.map(f => f.name);
        assert.ok(fieldNames.includes('type'));
        assert.ok(fieldNames.includes('userId'));
        assert.ok(fieldNames.includes('timestamp'));
    });
});

// ---------------------------------------------------------------------------
// Redis integration
// ---------------------------------------------------------------------------

describe('Integration – Redis crawler', { skip: SKIP ? 'RUN_INTEGRATION_TESTS not set' : false }, () => {
    let crawler: RedisPatternCrawler;
    let redisClient: any;

    before(async () => {
        // Set up test data using the redis module directly
        const { createClient } = await import('redis');
        redisClient = createClient({ url: REDIS_CONN });
        await redisClient.connect();

        // Seed test keys
        await redisClient.set('cache:user:1', JSON.stringify({ name: 'Alice' }));
        await redisClient.set('cache:user:2', JSON.stringify({ name: 'Bob' }));
        await redisClient.set('session:abc123def456', 'session-data');
        await redisClient.set('config:app:name', 'test-app');
        await redisClient.expire('cache:user:1', 3600);
        await redisClient.expire('cache:user:2', 3600);

        crawler = new RedisPatternCrawler();
        await crawler.connect(REDIS_CONN, 'test-redis');
    });

    after(async () => {
        if (redisClient) {
            await redisClient.flushDb();
            await redisClient.quit();
        }
        if (crawler) {
            await crawler.close();
        }
    });

    it('should discover key patterns', async () => {
        const results = await crawler.crawlRedis('test-redis');
        assert.equal(results.length, 1);

        const meta = results[0];
        assert.equal(meta.type, 'redis');

        // The schema should have patterns
        const schema = meta.schema as any;
        assert.ok(schema.totalKeys >= 4, `Expected at least 4 keys, got ${schema.totalKeys}`);
        assert.ok(schema.patterns.length > 0, 'Should have discovered at least one pattern');
    });

    it('should group similar keys into patterns', async () => {
        const schema = await (crawler as any).extractPatterns('test-redis');
        const patternNames = schema.patterns.map((p: any) => p.pattern);

        // cache:user:1 and cache:user:2 should collapse to cache:user:*
        assert.ok(
            patternNames.includes('cache:user:*'),
            `Expected cache:user:* pattern, got: ${patternNames.join(', ')}`
        );
    });
});

// ---------------------------------------------------------------------------
// Qdrant / Vectorizer integration
// ---------------------------------------------------------------------------

describe('Integration – SchemaVectorizer with Qdrant', { skip: SKIP ? 'RUN_INTEGRATION_TESTS not set' : false }, () => {
    let vectorizer: SchemaVectorizer;
    const collectionName = 'integration_test_schemas';

    before(async () => {
        vectorizer = new SchemaVectorizer({
            qdrantUrl: QDRANT_URL,
            qdrantCollection: collectionName,
        });
        await vectorizer.initializeCollection();
    });

    after(async () => {
        if (vectorizer) {
            // Clean up: delete the test collection
            try {
                const { QdrantClient } = await import('@qdrant/js-client-rest');
                const client = new QdrantClient({ url: QDRANT_URL });
                await client.deleteCollection(collectionName);
            } catch {
                // Ignore cleanup errors
            }
        }
    });

    it('should store and retrieve a schema vector', async () => {
        const metadata = {
            id: 'integration.public.users',
            type: 'postgresql' as const,
            database: 'integration',
            objectName: 'users',
            fullName: 'public.users',
            description: 'Users table with id, email, name columns',
            lastScanned: new Date(),
            checksum: 'abc123',
            schema: {
                database: 'integration',
                schema: 'public',
                tableName: 'users',
                columns: [],
                indexes: [],
                constraints: [],
            },
        };

        await vectorizer.vectorizeSchema(metadata);

        const retrieved = await vectorizer.getSchemaById('integration.public.users');
        assert.ok(retrieved, 'Should retrieve stored schema');
        assert.equal(retrieved.schemaId, 'integration.public.users');
        assert.equal(retrieved.database, 'integration');
    });

    it('should search schemas by semantic query', async () => {
        // Store another schema
        const metadata = {
            id: 'integration.public.orders',
            type: 'postgresql' as const,
            database: 'integration',
            objectName: 'orders',
            fullName: 'public.orders',
            description: 'Orders table tracking customer purchases with total amount',
            lastScanned: new Date(),
            checksum: 'def456',
            schema: {
                database: 'integration',
                schema: 'public',
                tableName: 'orders',
                columns: [],
                indexes: [],
                constraints: [],
            },
        };

        await vectorizer.vectorizeSchema(metadata);

        const results = await vectorizer.searchSchemas('customer orders', 5);
        assert.ok(results.length > 0, 'Should return search results');
        // Each result should have id, score, and metadata
        assert.ok('id' in results[0]);
        assert.ok('score' in results[0]);
        assert.ok('metadata' in results[0]);
    });

    it('should delete a schema from the vector store', async () => {
        await vectorizer.deleteSchema('integration.public.users');
        const retrieved = await vectorizer.getSchemaById('integration.public.users');
        assert.equal(retrieved, null, 'Schema should be deleted');
    });
});

// ---------------------------------------------------------------------------
// End-to-end: crawl → vectorize → search
// ---------------------------------------------------------------------------

describe('Integration – end-to-end crawl → vectorize → search', { skip: SKIP ? 'RUN_INTEGRATION_TESTS not set' : false }, () => {
    let pgCrawler: PostgreschemaCrawler;
    let vectorizer: SchemaVectorizer;
    const collectionName = 'e2e_test_schemas';

    before(async () => {
        // Set up PostgreSQL test data
        pgCrawler = new PostgreschemaCrawler();
        await pgCrawler.connect(PG_CONN, 'testdb');

        const pool = (pgCrawler as any).pools.get('testdb');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS e2e_products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price NUMERIC(10,2),
                category VARCHAR(100)
            )
        `);

        // Set up vectorizer
        vectorizer = new SchemaVectorizer({
            qdrantUrl: QDRANT_URL,
            qdrantCollection: collectionName,
        });
        await vectorizer.initializeCollection();
    });

    after(async () => {
        if (pgCrawler) {
            const pool = (pgCrawler as any).pools.get('testdb');
            await pool.query('DROP TABLE IF EXISTS e2e_products');
            await pgCrawler.close();
        }
        try {
            const { QdrantClient } = await import('@qdrant/js-client-rest');
            const client = new QdrantClient({ url: QDRANT_URL });
            await client.deleteCollection(collectionName);
        } catch {
            // Ignore
        }
    });

    it('should crawl PostgreSQL, vectorize, and search', async () => {
        // Crawl
        const schemas = await pgCrawler.crawlDatabase('testdb');
        assert.ok(schemas.length > 0, 'Should crawl at least one table');

        // Vectorize all crawled schemas
        await vectorizer.vectorizeBatch(schemas);

        // Search for product-related schemas
        const results = await vectorizer.searchSchemas('product catalog with prices', 5);
        assert.ok(results.length > 0, 'Should find schemas matching product query');
    });
});
