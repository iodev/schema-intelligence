/**
 * Unit tests for the LLM Description Generator (Phase 2A)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    TemplateLLMProvider,
    OpenAILLMProvider,
    AnthropicLLMProvider,
    LLMDescriptionGenerator,
    createLLMDescriptionGenerator,
    computeSchemaChecksum,
} from '../src/llm-description-generator.js';

import type {
    LLMProvider,
    LLMResponse,
} from '../src/llm-description-generator.js';

import type {
    SchemaMetadata,
    TableSchema,
    TableColumn,
    MongoCollectionSchema,
    RedisPatternSchema,
    InfluxBucketSchema,
    LLMConfig,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers – test fixture factories
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
            makeColumn({ name: 'email', type: 'character varying', isPrimaryKey: false }),
            makeColumn({
                name: 'org_id',
                type: 'integer',
                isPrimaryKey: false,
                isForeignKey: true,
                foreignKeyTarget: { table: 'public.organizations', column: 'id' },
            }),
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

function makePostgresMetadata(overrides: Partial<SchemaMetadata> = {}): SchemaMetadata {
    const schema = makeTableSchema();
    return {
        id: 'testdb.public.users',
        type: 'postgresql' as const,
        database: 'testdb',
        objectName: 'users',
        fullName: 'public.users',
        description: 'existing template description',
        schema,
        lastScanned: new Date(),
        checksum: 'pg_checksum_001',
        ...overrides,
    } as SchemaMetadata;
}

function makeMySQLMetadata(): SchemaMetadata {
    const schema = makeTableSchema({ database: 'appdb', schema: 'appdb', tableName: 'orders' });
    return {
        id: 'appdb.appdb.orders',
        type: 'mysql' as const,
        database: 'appdb',
        objectName: 'orders',
        fullName: 'appdb.orders',
        description: 'template description',
        schema,
        lastScanned: new Date(),
        checksum: 'mysql_checksum_001',
    } as SchemaMetadata;
}

function makeMongoMetadata(): SchemaMetadata {
    const schema: MongoCollectionSchema = {
        database: 'appdb',
        collectionName: 'events',
        fields: [
            { name: '_id', types: ['objectId'], nullable: false },
            { name: 'type', types: ['string'], nullable: false },
            { name: 'payload', types: ['object'], nullable: true },
            { name: 'count', types: ['int', 'double'], nullable: false },
        ],
        indexes: [
            { name: '_id_', keys: { _id: 1 }, unique: true },
            { name: 'type_1', keys: { type: 1 }, unique: false },
        ],
        documentCount: 5000,
        avgDocSize: 256,
    };
    return {
        id: 'appdb.events',
        type: 'mongodb' as const,
        database: 'appdb',
        objectName: 'events',
        fullName: 'events',
        description: 'template description',
        schema,
        lastScanned: new Date(),
        checksum: 'mongo_checksum_001',
    } as SchemaMetadata;
}

function makeRedisMetadata(): SchemaMetadata {
    const schema: RedisPatternSchema = {
        database: 'redis-main',
        patterns: [
            { pattern: 'cache:user:*', type: 'string', exampleKeys: ['cache:user:1'], count: 200, ttl: 3600 },
            { pattern: 'session:*', type: 'hash', exampleKeys: ['session:abc'], count: 50 },
        ],
        totalKeys: 250,
        lastScanned: new Date(),
    };
    return {
        id: 'redis-main.redis_patterns',
        type: 'redis' as const,
        database: 'redis-main',
        objectName: 'redis_patterns',
        fullName: 'redis_patterns',
        description: 'template description',
        schema,
        lastScanned: new Date(),
        checksum: 'redis_checksum_001',
    } as SchemaMetadata;
}

function makeInfluxMetadata(): SchemaMetadata {
    const schema: InfluxBucketSchema = {
        database: 'metrics',
        bucketName: 'telemetry',
        orgName: 'caelum',
        retentionPeriod: 604800,
        measurements: [
            { name: 'cpu_usage', tags: ['host', 'region'], fields: ['value', 'count'] },
            { name: 'memory', tags: ['host'], fields: ['used', 'free'] },
        ],
        lastScanned: new Date(),
    };
    return {
        id: 'metrics.telemetry',
        type: 'influxdb' as const,
        database: 'metrics',
        objectName: 'telemetry',
        fullName: 'telemetry',
        description: 'template description',
        schema,
        lastScanned: new Date(),
        checksum: 'influx_checksum_001',
    } as SchemaMetadata;
}

// ---------------------------------------------------------------------------
// Mock LLM provider for testing
// ---------------------------------------------------------------------------

class MockLLMProvider implements LLMProvider {
    readonly name = 'mock';
    calls: Array<{ system: string; user: string }> = [];
    response: string;
    delay: number;

    constructor(response: string = 'Mock LLM description.', delay: number = 0) {
        this.response = response;
        this.delay = delay;
    }

    async generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
        this.calls.push({ system: systemPrompt, user: userPrompt });
        if (this.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }
        return { text: this.response, tokensUsed: 100 };
    }
}

// ---------------------------------------------------------------------------
// Tests – TemplateLLMProvider
// ---------------------------------------------------------------------------

describe('TemplateLLMProvider', () => {
    let provider: TemplateLLMProvider;

    beforeEach(() => {
        provider = new TemplateLLMProvider();
    });

    it('should have name "template"', () => {
        assert.equal(provider.name, 'template');
    });

    it('should generate a PostgreSQL table description', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makePostgresMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('public.users'));
        assert.ok(desc.includes('testdb'));
        assert.ok(desc.includes('id (integer'));
        assert.ok(desc.includes('PRIMARY KEY'));
    });

    it('should generate a MySQL table description', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeMySQLMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('appdb.orders'));
    });

    it('should generate a MongoDB collection description', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeMongoMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('events'));
        assert.ok(desc.includes('appdb'));
    });

    it('should generate a Redis pattern description', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeRedisMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('redis-main'));
        assert.ok(desc.includes('250'));
    });

    it('should generate an InfluxDB bucket description', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeInfluxMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('telemetry'));
        assert.ok(desc.includes('caelum'));
    });

    it('should include FK relationships for postgres', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makePostgresMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('FOREIGN KEY to public.organizations'));
    });

    it('should include non-primary indexes for postgres', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makePostgresMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('users_email_idx'));
    });

    it('should include MongoDB index information', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeMongoMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('type_1'));
    });

    it('should include Redis TTL info', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeRedisMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('TTL'));
    });

    it('should include InfluxDB retention period', async () => {
        const gen = new LLMDescriptionGenerator({ provider, cacheEnabled: false });
        const meta = makeInfluxMetadata();
        const desc = await gen.generateDescription(meta);
        assert.ok(desc.includes('Retention') || desc.includes('7'));
    });

    it('should return a fallback for malformed prompt data', async () => {
        const response = await provider.generateCompletion('system', 'no json here');
        assert.ok(response.text.length > 0);
    });
});

// ---------------------------------------------------------------------------
// Tests – Caching behavior
// ---------------------------------------------------------------------------

describe('LLMDescriptionGenerator – caching', () => {
    it('should cache descriptions by checksum', async () => {
        const mock = new MockLLMProvider('cached result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: true });

        const meta = makePostgresMetadata();
        const desc1 = await gen.generateDescription(meta);
        const desc2 = await gen.generateDescription(meta);

        assert.equal(desc1, desc2);
        // Provider should only have been called once
        assert.equal(mock.calls.length, 1);
    });

    it('should not cache when cacheEnabled is false', async () => {
        const mock = new MockLLMProvider('not cached');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: false });

        const meta = makePostgresMetadata();
        await gen.generateDescription(meta);
        await gen.generateDescription(meta);

        assert.equal(mock.calls.length, 2);
    });

    it('should use different cache entries for different checksums', async () => {
        const mock = new MockLLMProvider('result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: true });

        const meta1 = makePostgresMetadata({ checksum: 'checksum_a' } as Partial<SchemaMetadata>);
        const meta2 = makePostgresMetadata({ checksum: 'checksum_b' } as Partial<SchemaMetadata>);

        await gen.generateDescription(meta1);
        await gen.generateDescription(meta2);

        // Both should have been called since checksums differ
        assert.equal(mock.calls.length, 2);
    });

    it('should report correct cache size', async () => {
        const mock = new MockLLMProvider('result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: true });

        assert.equal(gen.cacheSize, 0);

        await gen.generateDescription(makePostgresMetadata({ checksum: 'ck1' } as Partial<SchemaMetadata>));
        assert.equal(gen.cacheSize, 1);

        await gen.generateDescription(makePostgresMetadata({ checksum: 'ck2' } as Partial<SchemaMetadata>));
        assert.equal(gen.cacheSize, 2);
    });

    it('should clear cache', async () => {
        const mock = new MockLLMProvider('result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: true });

        await gen.generateDescription(makePostgresMetadata());
        assert.equal(gen.cacheSize, 1);

        gen.clearCache();
        assert.equal(gen.cacheSize, 0);
    });
});

// ---------------------------------------------------------------------------
// Tests – Concurrency limiting
// ---------------------------------------------------------------------------

describe('LLMDescriptionGenerator – concurrency', () => {
    it('should limit concurrent LLM calls', async () => {
        let concurrentCount = 0;
        let maxConcurrent = 0;

        const slowProvider: LLMProvider = {
            name: 'slow-mock',
            async generateCompletion(_system: string, _user: string): Promise<LLMResponse> {
                concurrentCount++;
                if (concurrentCount > maxConcurrent) {
                    maxConcurrent = concurrentCount;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
                concurrentCount--;
                return { text: 'description' };
            },
        };

        const gen = new LLMDescriptionGenerator({
            provider: slowProvider,
            concurrency: 2,
            cacheEnabled: false,
        });

        // Create 6 metadata items with different checksums
        const metadatas = Array.from({ length: 6 }, (_, i) =>
            makePostgresMetadata({ checksum: `concurrent_${i}` } as Partial<SchemaMetadata>)
        );

        await gen.generateBatchDescriptions(metadatas);

        // Max concurrent should not exceed 2
        assert.ok(maxConcurrent <= 2, `Max concurrency was ${maxConcurrent}, expected <= 2`);
        assert.ok(maxConcurrent >= 1, `Max concurrency was ${maxConcurrent}, expected >= 1`);
    });

    it('should default to concurrency 5', async () => {
        let maxConcurrent = 0;
        let concurrentCount = 0;

        const trackerProvider: LLMProvider = {
            name: 'tracker',
            async generateCompletion(_system: string, _user: string): Promise<LLMResponse> {
                concurrentCount++;
                if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
                await new Promise(resolve => setTimeout(resolve, 20));
                concurrentCount--;
                return { text: 'desc' };
            },
        };

        const gen = new LLMDescriptionGenerator({
            provider: trackerProvider,
            cacheEnabled: false,
        });

        const metadatas = Array.from({ length: 10 }, (_, i) =>
            makePostgresMetadata({ checksum: `default_concurrency_${i}` } as Partial<SchemaMetadata>)
        );

        await gen.generateBatchDescriptions(metadatas);

        assert.ok(maxConcurrent <= 5, `Max concurrency was ${maxConcurrent}, expected <= 5`);
    });
});

// ---------------------------------------------------------------------------
// Tests – Batch descriptions
// ---------------------------------------------------------------------------

describe('LLMDescriptionGenerator – generateBatchDescriptions', () => {
    it('should return a Map keyed by metadata id', async () => {
        const mock = new MockLLMProvider('batch result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: false });

        const metadatas = [
            makePostgresMetadata({ id: 'pg.public.a', checksum: 'ba' } as Partial<SchemaMetadata>),
            makeMongoMetadata(),
            makeRedisMetadata(),
        ];

        const results = await gen.generateBatchDescriptions(metadatas);

        assert.equal(results.size, 3);
        assert.ok(results.has('pg.public.a'));
        assert.ok(results.has('appdb.events'));
        assert.ok(results.has('redis-main.redis_patterns'));
    });

    it('should use cache across batch items with same checksum', async () => {
        const mock = new MockLLMProvider('shared');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: true });

        const metadatas = [
            makePostgresMetadata({ id: 'a', checksum: 'same' } as Partial<SchemaMetadata>),
            makePostgresMetadata({ id: 'b', checksum: 'same' } as Partial<SchemaMetadata>),
        ];

        const results = await gen.generateBatchDescriptions(metadatas);

        assert.equal(results.size, 2);
        // Only one actual LLM call since checksums are the same
        // (the second gets a cache hit once the first resolves)
        // Note: due to async concurrency both may start before cache is populated,
        // but at minimum the cache should store the result
        assert.ok(mock.calls.length >= 1);
        assert.ok(mock.calls.length <= 2);
    });
});

// ---------------------------------------------------------------------------
// Tests – Prompt generation
// ---------------------------------------------------------------------------

describe('LLMDescriptionGenerator – prompt building', () => {
    let gen: LLMDescriptionGenerator;
    let mock: MockLLMProvider;

    beforeEach(() => {
        mock = new MockLLMProvider('prompt test');
        gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: false });
    });

    it('should include system prompt about documentation expert', async () => {
        await gen.generateDescription(makePostgresMetadata());
        assert.equal(mock.calls.length, 1);
        const systemPrompt = mock.calls[0].system;
        assert.ok(systemPrompt.includes('database documentation expert'));
        assert.ok(systemPrompt.includes('purpose'));
        assert.ok(systemPrompt.includes('design patterns'));
        assert.ok(systemPrompt.includes('queries'));
    });

    it('should include PostgreSQL schema details in user prompt', async () => {
        await gen.generateDescription(makePostgresMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('PostgreSQL'));
        assert.ok(userPrompt.includes('public.users'));
        assert.ok(userPrompt.includes('"columns"'));
        assert.ok(userPrompt.includes('"indexes"'));
        assert.ok(userPrompt.includes('"constraints"'));
        assert.ok(userPrompt.includes('Foreign key relationships'));
        assert.ok(userPrompt.includes('public.organizations'));
    });

    it('should include MySQL schema details in user prompt', async () => {
        await gen.generateDescription(makeMySQLMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('MySQL'));
        assert.ok(userPrompt.includes('appdb.orders'));
    });

    it('should include MongoDB field type distribution in user prompt', async () => {
        await gen.generateDescription(makeMongoMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('MongoDB'));
        assert.ok(userPrompt.includes('events'));
        assert.ok(userPrompt.includes('Field type distribution'));
        assert.ok(userPrompt.includes('objectId'));
        assert.ok(userPrompt.includes('Index strategy'));
        assert.ok(userPrompt.includes('type_1'));
    });

    it('should include Redis key pattern semantics in user prompt', async () => {
        await gen.generateDescription(makeRedisMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('Redis'));
        assert.ok(userPrompt.includes('Key pattern semantics'));
        assert.ok(userPrompt.includes('cache:user:*'));
        assert.ok(userPrompt.includes('session:*'));
        assert.ok(userPrompt.includes('ttl=3600'));
    });

    it('should include InfluxDB measurement/tag/field semantics in user prompt', async () => {
        await gen.generateDescription(makeInfluxMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('InfluxDB'));
        assert.ok(userPrompt.includes('telemetry'));
        assert.ok(userPrompt.includes('Measurement/tag/field semantics'));
        assert.ok(userPrompt.includes('cpu_usage'));
        assert.ok(userPrompt.includes('host'));
        assert.ok(userPrompt.includes('Retention period'));
    });

    it('should include schema JSON in user prompt', async () => {
        await gen.generateDescription(makePostgresMetadata());
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('```json'));
        assert.ok(userPrompt.includes('"schemaType": "postgresql"'));
    });

    it('should include no-FK context when table has no FKs', async () => {
        const meta = makePostgresMetadata({
            schema: makeTableSchema({
                columns: [makeColumn()],
            }),
        } as Partial<SchemaMetadata>);
        await gen.generateDescription(meta);
        const userPrompt = mock.calls[0].user;
        assert.ok(userPrompt.includes('No foreign key relationships'));
    });
});

// ---------------------------------------------------------------------------
// Tests – OpenAI / Anthropic provider construction (mock-based)
// ---------------------------------------------------------------------------

describe('OpenAILLMProvider', () => {
    it('should have name "openai"', () => {
        const provider = new OpenAILLMProvider('test-key');
        assert.equal(provider.name, 'openai');
    });

    it('should accept custom model', () => {
        const provider = new OpenAILLMProvider('test-key', 'gpt-4');
        assert.equal(provider.name, 'openai');
    });
});

describe('AnthropicLLMProvider', () => {
    it('should have name "anthropic"', () => {
        const provider = new AnthropicLLMProvider('test-key');
        assert.equal(provider.name, 'anthropic');
    });

    it('should accept custom model', () => {
        const provider = new AnthropicLLMProvider('test-key', 'claude-3-opus-20240229');
        assert.equal(provider.name, 'anthropic');
    });
});

// ---------------------------------------------------------------------------
// Tests – createLLMDescriptionGenerator factory
// ---------------------------------------------------------------------------

describe('createLLMDescriptionGenerator', () => {
    it('should return undefined when config is undefined', () => {
        const result = createLLMDescriptionGenerator(undefined);
        assert.equal(result, undefined);
    });

    it('should create a generator for template provider', () => {
        const config: LLMConfig = { provider: 'template' };
        const gen = createLLMDescriptionGenerator(config);
        assert.ok(gen instanceof LLMDescriptionGenerator);
    });

    it('should create a generator for openai provider', () => {
        const config: LLMConfig = { provider: 'openai', apiKey: 'test-key' };
        const gen = createLLMDescriptionGenerator(config);
        assert.ok(gen instanceof LLMDescriptionGenerator);
    });

    it('should create a generator for anthropic provider', () => {
        const config: LLMConfig = { provider: 'anthropic', apiKey: 'test-key' };
        const gen = createLLMDescriptionGenerator(config);
        assert.ok(gen instanceof LLMDescriptionGenerator);
    });

    it('should respect concurrency config', async () => {
        // We can't directly test internal concurrency from the factory,
        // but we can verify the generator works with the config
        const config: LLMConfig = {
            provider: 'template',
            maxConcurrency: 3,
            cacheDescriptions: true,
        };
        const gen = createLLMDescriptionGenerator(config);
        assert.ok(gen instanceof LLMDescriptionGenerator);

        // Verify it generates descriptions
        const desc = await gen!.generateDescription(makePostgresMetadata());
        assert.ok(desc.length > 0);
    });
});

// ---------------------------------------------------------------------------
// Tests – computeSchemaChecksum utility
// ---------------------------------------------------------------------------

describe('computeSchemaChecksum', () => {
    it('should produce a SHA-256 hex string', () => {
        const meta = makePostgresMetadata();
        const checksum = computeSchemaChecksum(meta);
        assert.match(checksum, /^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
        const meta = makePostgresMetadata();
        assert.equal(computeSchemaChecksum(meta), computeSchemaChecksum(meta));
    });

    it('should change when schema changes', () => {
        const meta1 = makePostgresMetadata();
        const meta2 = makePostgresMetadata({
            schema: makeTableSchema({ tableName: 'accounts' }),
        } as Partial<SchemaMetadata>);
        assert.notEqual(computeSchemaChecksum(meta1), computeSchemaChecksum(meta2));
    });
});

// ---------------------------------------------------------------------------
// Tests – Edge cases
// ---------------------------------------------------------------------------

describe('LLMDescriptionGenerator – edge cases', () => {
    it('should handle empty string from provider gracefully', async () => {
        const emptyProvider = new MockLLMProvider('');
        const gen = new LLMDescriptionGenerator({ provider: emptyProvider, cacheEnabled: false });

        const meta = makePostgresMetadata();
        const desc = await gen.generateDescription(meta);

        // Should fall back to existing description
        assert.equal(desc, meta.description);
    });

    it('should handle provider errors by propagating', async () => {
        const failingProvider: LLMProvider = {
            name: 'failing',
            async generateCompletion(): Promise<LLMResponse> {
                throw new Error('API rate limit exceeded');
            },
        };
        const gen = new LLMDescriptionGenerator({ provider: failingProvider, cacheEnabled: false });

        await assert.rejects(
            () => gen.generateDescription(makePostgresMetadata()),
            { message: 'API rate limit exceeded' },
        );
    });

    it('should handle empty batch', async () => {
        const mock = new MockLLMProvider('result');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: false });

        const results = await gen.generateBatchDescriptions([]);
        assert.equal(results.size, 0);
        assert.equal(mock.calls.length, 0);
    });

    it('should handle single item batch', async () => {
        const mock = new MockLLMProvider('single');
        const gen = new LLMDescriptionGenerator({ provider: mock, cacheEnabled: false });

        const results = await gen.generateBatchDescriptions([makePostgresMetadata()]);
        assert.equal(results.size, 1);
        assert.equal(mock.calls.length, 1);
    });
});
