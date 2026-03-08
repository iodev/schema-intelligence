# Bug Fixes and Comprehensive Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all identified bugs through strategy pattern refactor and create comprehensive documentation.

**Architecture:** Refactor SchemaIntelligenceService to use DatabaseCrawlerStrategy pattern instead of five separate crawler maps. Add security (sanitization, validation), performance (parallelization, memory limits), and error handling improvements. Then create comprehensive docs structure.

**Tech Stack:** TypeScript, Node.js, Pino (logging), PostgreSQL/MySQL/MongoDB/Redis/InfluxDB clients, Qdrant

---

## Phase 1: Bug Fixes via Strategy Pattern

### Task 1: Add DatabaseCrawlerStrategy Interface

**Files:**
- Modify: `src/types.ts`

**Step 1: Add the DatabaseCrawlerStrategy interface to types.ts**

Add after the existing type definitions:

```typescript
/**
 * Unified interface for all database crawlers
 */
export interface DatabaseCrawlerStrategy {
    type: DatabaseType;
    connect(connectionString: string, alias: string): Promise<void>;
    crawl(alias: string): Promise<SchemaMetadata[]>;
    close(): Promise<void>;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add DatabaseCrawlerStrategy interface"
```

---

### Task 2: Create PostgreSQL Crawler Adapter

**Files:**
- Create: `src/crawlers/postgres-crawler-adapter.ts`

**Step 1: Create crawlers directory**

```bash
mkdir -p src/crawlers
```

**Step 2: Write PostgreSQL adapter**

Create `src/crawlers/postgres-crawler-adapter.ts`:

```typescript
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { PostgreschemaCrawler } from '../postgres-schema-crawler.js';

export class PostgresCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'postgresql';
    private crawler = new PostgreschemaCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

**Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/crawlers/
git commit -m "feat: add PostgreSQL crawler adapter"
```

---

### Task 3: Create MySQL Crawler Adapter

**Files:**
- Create: `src/crawlers/mysql-crawler-adapter.ts`

**Step 1: Write MySQL adapter**

Create `src/crawlers/mysql-crawler-adapter.ts`:

```typescript
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { MySQLSchemaCrawler } from '../mysql-schema-crawler.js';

export class MySQLCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'mysql';
    private crawler = new MySQLSchemaCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/crawlers/mysql-crawler-adapter.ts
git commit -m "feat: add MySQL crawler adapter"
```

---

### Task 4: Create MongoDB Crawler Adapter

**Files:**
- Create: `src/crawlers/mongodb-crawler-adapter.ts`

**Step 1: Write MongoDB adapter**

Create `src/crawlers/mongodb-crawler-adapter.ts`:

```typescript
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { MongoDBSchemaCrawler } from '../mongodb-schema-crawler.js';

export class MongoDBCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'mongodb';
    private crawler = new MongoDBSchemaCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/crawlers/mongodb-crawler-adapter.ts
git commit -m "feat: add MongoDB crawler adapter"
```

---

### Task 5: Create Redis Crawler Adapter

**Files:**
- Create: `src/crawlers/redis-crawler-adapter.ts`

**Step 1: Write Redis adapter**

Create `src/crawlers/redis-crawler-adapter.ts`:

```typescript
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { RedisPatternCrawler } from '../redis-pattern-crawler.js';

export class RedisCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'redis';
    private crawler = new RedisPatternCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlRedis(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/crawlers/redis-crawler-adapter.ts
git commit -m "feat: add Redis crawler adapter"
```

---

### Task 6: Create InfluxDB Crawler Adapter

**Files:**
- Create: `src/crawlers/influxdb-crawler-adapter.ts`

**Step 1: Write InfluxDB adapter**

Create `src/crawlers/influxdb-crawler-adapter.ts`:

```typescript
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { InfluxDBBucketCrawler } from '../influxdb-bucket-crawler.js';

export class InfluxDBCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'influxdb';
    private crawler = new InfluxDBBucketCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlInfluxDB(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/crawlers/influxdb-crawler-adapter.ts
git commit -m "feat: add InfluxDB crawler adapter"
```

---

### Task 7: Create Crawler Factory

**Files:**
- Create: `src/crawlers/factory.ts`
- Create: `src/crawlers/index.ts`

**Step 1: Write factory function**

Create `src/crawlers/factory.ts`:

```typescript
import { DatabaseType, DatabaseCrawlerStrategy } from '../types.js';
import { PostgresCrawlerAdapter } from './postgres-crawler-adapter.js';
import { MySQLCrawlerAdapter } from './mysql-crawler-adapter.js';
import { MongoDBCrawlerAdapter } from './mongodb-crawler-adapter.js';
import { RedisCrawlerAdapter } from './redis-crawler-adapter.js';
import { InfluxDBCrawlerAdapter } from './influxdb-crawler-adapter.js';

export function createCrawlerStrategy(type: DatabaseType): DatabaseCrawlerStrategy {
    switch (type) {
        case 'postgresql':
            return new PostgresCrawlerAdapter();
        case 'mysql':
            return new MySQLCrawlerAdapter();
        case 'mongodb':
            return new MongoDBCrawlerAdapter();
        case 'redis':
            return new RedisCrawlerAdapter();
        case 'influxdb':
            return new InfluxDBCrawlerAdapter();
        default:
            throw new Error(`Unknown database type: ${type}`);
    }
}
```

**Step 2: Create index file for exports**

Create `src/crawlers/index.ts`:

```typescript
export { createCrawlerStrategy } from './factory.js';
export { PostgresCrawlerAdapter } from './postgres-crawler-adapter.js';
export { MySQLCrawlerAdapter } from './mysql-crawler-adapter.js';
export { MongoDBCrawlerAdapter } from './mongodb-crawler-adapter.js';
export { RedisCrawlerAdapter } from './redis-crawler-adapter.js';
export { InfluxDBCrawlerAdapter } from './influxdb-crawler-adapter.js';
```

**Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/crawlers/
git commit -m "feat: add crawler factory and exports"
```

---

### Task 8: Add Security Helpers to SchemaIntelligenceService

**Files:**
- Modify: `src/schema-intelligence-service.ts` (lines 1-66)

**Step 1: Add sanitization and validation methods**

Add these private methods to `SchemaIntelligenceService` class (after constructor, before initialize):

```typescript
    /**
     * Sanitize connection string to prevent credential leakage in logs
     */
    private sanitizeConnectionString(connectionString: string): string {
        return connectionString
            .replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
            .replace(/\?.*token=([^&]+)/, '?...token=***');
    }

    /**
     * Validate configuration to catch errors early
     */
    private validateConfig(config: SchemaCrawlerConfig): void {
        if (!config.databases?.length) {
            throw new Error('At least one database must be configured');
        }
        if (!config.qdrantUrl) {
            throw new Error('qdrantUrl is required');
        }
        if (!config.qdrantCollection) {
            throw new Error('qdrantCollection is required');
        }

        const validTypes: DatabaseType[] = ['postgresql', 'mysql', 'mongodb', 'redis', 'influxdb'];
        for (const db of config.databases) {
            if (!db.type) {
                throw new Error('Database type is required');
            }
            if (!db.connectionString) {
                throw new Error('Database connectionString is required');
            }
            if (!validTypes.includes(db.type)) {
                throw new Error(`Invalid database type: ${db.type}. Valid types: ${validTypes.join(', ')}`);
            }
        }
    }
```

**Step 2: Call validation in constructor**

Modify the constructor to call validation first:

```typescript
    constructor(config: SchemaCrawlerConfig) {
        this.validateConfig(config); // Add this line first
        this.logger = pino({ name: 'schema-intelligence-service' });
        this.config = config;
        // ... rest of constructor
```

**Step 3: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/schema-intelligence-service.ts
git commit -m "feat: add connection string sanitization and config validation"
```

---

### Task 9: Refactor Service to Use Strategy Pattern - Part 1 (Replace Maps)

**Files:**
- Modify: `src/schema-intelligence-service.ts` (lines 31-46)

**Step 1: Replace five crawler maps with one**

Find these lines (around line 34-38):

```typescript
    private postgresCrawlers: Map<string, PostgreschemaCrawler> = new Map();
    private mysqlCrawlers: Map<string, MySQLSchemaCrawler> = new Map();
    private mongoCrawlers: Map<string, MongoDBSchemaCrawler> = new Map();
    private redisCrawlers: Map<string, RedisPatternCrawler> = new Map();
    private influxCrawlers: Map<string, InfluxDBBucketCrawler> = new Map();
```

Replace with:

```typescript
    private crawlers: Map<string, DatabaseCrawlerStrategy> = new Map();
```

**Step 2: Add imports**

Add at top of file:

```typescript
import { DatabaseCrawlerStrategy } from './types.js';
import { createCrawlerStrategy } from './crawlers/index.js';
```

**Step 3: Add performance fields**

Add these fields after the crawlers map:

```typescript
    private isScanning: boolean = false;
    private readonly MAX_METADATA_HISTORY = 10000;
```

**Step 4: Remove unused imports**

Remove these imports (no longer needed):

```typescript
import { PostgreschemaCrawler } from './postgres-schema-crawler.js';
import { MySQLSchemaCrawler } from './mysql-schema-crawler.js';
import { MongoDBSchemaCrawler } from './mongodb-schema-crawler.js';
import { RedisPatternCrawler } from './redis-pattern-crawler.js';
import { InfluxDBBucketCrawler } from './influxdb-bucket-crawler.js';
```

**Step 5: Verify TypeScript compiles**

Run: `npm run lint`
Expected: Errors about missing methods (we'll fix in next tasks)

**Step 6: Commit**

```bash
git add src/schema-intelligence-service.ts
git commit -m "refactor: replace five crawler maps with unified strategy map"
```

---

### Task 10: Refactor Service to Use Strategy Pattern - Part 2 (Initialize Method)

**Files:**
- Modify: `src/schema-intelligence-service.ts` (lines 71-125)

**Step 1: Replace initialize() method**

Replace the entire `initialize()` method with:

```typescript
    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing Schema Intelligence Service');

        // Initialize Qdrant collection
        await this.vectorizer.initializeCollection();

        // Connect to all databases in parallel
        const connectionPromises = this.config.databases.map(async (dbConfig) => {
            try {
                const crawler = createCrawlerStrategy(dbConfig.type);
                const alias = this.extractDbName(dbConfig.connectionString);
                await crawler.connect(dbConfig.connectionString, alias);
                this.crawlers.set(alias, crawler);
                this.logger.info(
                    { database: alias, type: dbConfig.type },
                    'Connected to database'
                );
            } catch (error) {
                this.logger.error(
                    { error, type: dbConfig.type },
                    'Failed to connect to database'
                );
                // Continue with other databases
            }
        });

        await Promise.allSettled(connectionPromises);

        // Run initial scan
        await this.scanAllDatabases();

        // Start periodic scanning if configured
        if (this.config.scanInterval && this.config.scanInterval > 0) {
            this.startPeriodicScanning();
        }

        this.logger.info('Schema Intelligence Service initialized');
    }
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: Errors about scanAllDatabases (we'll fix next)

**Step 3: Commit**

```bash
git add src/schema-intelligence-service.ts
git commit -m "refactor: parallelize database connections in initialize()"
```

---

### Task 11: Refactor Service to Use Strategy Pattern - Part 3 (Scan Method)

**Files:**
- Modify: `src/schema-intelligence-service.ts` (lines 130-265)

**Step 1: Replace scanAllDatabases() method**

Replace the entire `scanAllDatabases()` method with:

```typescript
    /**
     * Scan all configured databases
     */
    async scanAllDatabases(): Promise<void> {
        if (this.isScanning) {
            this.logger.warn('Scan already in progress, skipping');
            return;
        }

        this.isScanning = true;
        try {
            this.logger.info('Starting full database scan');
            const allMetadata: SchemaMetadata[] = [];
            const errors: Array<{ alias: string; error: Error }> = [];

            // Scan all databases in parallel with graceful degradation
            const scanPromises = Array.from(this.crawlers.entries()).map(async ([alias, crawler]) => {
                try {
                    const metadata = await crawler.crawl(alias);
                    return { alias, metadata, success: true };
                } catch (error) {
                    this.logger.error({ error, database: alias }, 'Failed to crawl database');
                    errors.push({ alias, error: error as Error });
                    return { alias, metadata: [], success: false };
                }
            });

            const results = await Promise.allSettled(scanPromises);

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.success) {
                    allMetadata.push(...result.value.metadata);
                }
            }

            if (errors.length > 0) {
                this.logger.warn(
                    { failedDatabases: errors.map(e => e.alias), totalErrors: errors.length },
                    'Some databases failed to scan'
                );
            }

            // Enrich descriptions using LLM if configured
            if (this.llmDescriptionGenerator && allMetadata.length > 0) {
                this.logger.info(
                    { schemaCount: allMetadata.length },
                    'Enriching schema descriptions with LLM'
                );
                try {
                    const descriptions = await this.llmDescriptionGenerator.generateBatchDescriptions(allMetadata);
                    for (const metadata of allMetadata) {
                        const enriched = descriptions.get(metadata.id);
                        if (enriched) {
                            (metadata as { description: string }).description = enriched;
                        }
                    }
                } catch (error) {
                    this.logger.error(
                        { error },
                        'Failed to enrich descriptions with LLM, using template descriptions'
                    );
                }
            }

            // Detect changes if we have previous snapshots
            const changes = this.detectChanges(allMetadata);
            if (changes.length > 0) {
                this.logger.info(
                    { changeCount: changes.length },
                    'Detected schema changes'
                );
                for (const change of changes) {
                    this.logger.info({ change }, 'Schema change detected');
                }
            }

            // Vectorize and store all schemas
            await this.vectorizer.vectorizeBatch(allMetadata);

            // Update snapshots for change detection
            for (const metadata of allMetadata) {
                this.schemaSnapshots.set(metadata.id, metadata.checksum);
            }

            // Persistent change tracking (Phase 2C)
            if (this.changeTracker) {
                try {
                    const trackedDiffs = await this.changeTracker.detectChanges(allMetadata);
                    if (trackedDiffs.length > 0 && this.changeTrackingCallback) {
                        this.changeTrackingCallback(trackedDiffs);
                    }
                    // Record new snapshots
                    for (const metadata of allMetadata) {
                        await this.changeTracker.recordSnapshot(metadata);
                    }
                } catch (error) {
                    this.logger.error({ error }, 'Change tracking failed');
                }
            }

            // Store latest metadata for graph building
            this.latestMetadata.push(...allMetadata);

            // Apply memory limits
            if (this.latestMetadata.length > this.MAX_METADATA_HISTORY) {
                const excess = this.latestMetadata.length - this.MAX_METADATA_HISTORY;
                this.latestMetadata.splice(0, excess);
                this.logger.warn(
                    { evicted: excess },
                    'Evicted old metadata to stay within memory limits'
                );
            }

            this.logger.info(
                { schemaCount: allMetadata.length },
                'Database scan complete'
            );
        } finally {
            this.isScanning = false;
        }
    }
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add src/schema-intelligence-service.ts
git commit -m "refactor: parallelize scanning with graceful degradation and memory limits"
```

---

### Task 12: Refactor Service to Use Strategy Pattern - Part 4 (Shutdown Method)

**Files:**
- Modify: `src/schema-intelligence-service.ts` (lines 465-489)

**Step 1: Replace shutdown() method**

Replace the entire `shutdown()` method with:

```typescript
    /**
     * Shutdown the service
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down Schema Intelligence Service');

        this.stopPeriodicScanning();

        // Close all crawler connections in parallel
        const closePromises = Array.from(this.crawlers.values()).map(async (crawler) => {
            try {
                await crawler.close();
            } catch (error) {
                this.logger.error({ error, type: crawler.type }, 'Failed to close database connection');
            }
        });

        await Promise.allSettled(closePromises);

        this.logger.info('Schema Intelligence Service shut down');
    }
```

**Step 2: Verify TypeScript compiles**

Run: `npm run lint`
Expected: No errors

**Step 3: Build and test**

Run: `npm run build && npm test`
Expected: Build succeeds, tests pass

**Step 4: Commit**

```bash
git add src/schema-intelligence-service.ts
git commit -m "refactor: close all database connections in shutdown"
```

---

### Task 13: Write Tests for Strategy Pattern

**Files:**
- Create: `tests/crawler-strategy.test.ts`

**Step 1: Write test file**

Create `tests/crawler-strategy.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCrawlerStrategy } from '../src/crawlers/index.js';
import { DatabaseType } from '../src/types.js';

describe('Crawler Strategy Pattern', () => {
    it('should create PostgreSQL crawler adapter', () => {
        const crawler = createCrawlerStrategy('postgresql');
        assert.strictEqual(crawler.type, 'postgresql');
        assert.strictEqual(typeof crawler.connect, 'function');
        assert.strictEqual(typeof crawler.crawl, 'function');
        assert.strictEqual(typeof crawler.close, 'function');
    });

    it('should create MySQL crawler adapter', () => {
        const crawler = createCrawlerStrategy('mysql');
        assert.strictEqual(crawler.type, 'mysql');
    });

    it('should create MongoDB crawler adapter', () => {
        const crawler = createCrawlerStrategy('mongodb');
        assert.strictEqual(crawler.type, 'mongodb');
    });

    it('should create Redis crawler adapter', () => {
        const crawler = createCrawlerStrategy('redis');
        assert.strictEqual(crawler.type, 'redis');
    });

    it('should create InfluxDB crawler adapter', () => {
        const crawler = createCrawlerStrategy('influxdb');
        assert.strictEqual(crawler.type, 'influxdb');
    });

    it('should throw error for unknown database type', () => {
        assert.throws(
            () => createCrawlerStrategy('unknown' as DatabaseType),
            /Unknown database type/
        );
    });
});
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/crawler-strategy.test.ts
git commit -m "test: add tests for crawler strategy pattern"
```

---

### Task 14: Write Tests for Configuration Validation

**Files:**
- Create: `tests/config-validation.test.ts`

**Step 1: Write test file**

Create `tests/config-validation.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SchemaIntelligenceService } from '../src/schema-intelligence-service.js';
import { SchemaCrawlerConfig } from '../src/types.js';

describe('Configuration Validation', () => {
    const validConfig: SchemaCrawlerConfig = {
        databases: [
            {
                type: 'postgresql',
                connectionString: 'postgresql://localhost/test',
            },
        ],
        qdrantUrl: 'http://localhost:6333',
        qdrantCollection: 'test',
        embeddingModel: 'simple',
    };

    it('should accept valid configuration', () => {
        assert.doesNotThrow(() => {
            new SchemaIntelligenceService(validConfig);
        });
    });

    it('should reject empty databases array', () => {
        const config = { ...validConfig, databases: [] };
        assert.throws(
            () => new SchemaIntelligenceService(config),
            /At least one database must be configured/
        );
    });

    it('should reject missing qdrantUrl', () => {
        const config = { ...validConfig, qdrantUrl: '' };
        assert.throws(
            () => new SchemaIntelligenceService(config as SchemaCrawlerConfig),
            /qdrantUrl is required/
        );
    });

    it('should reject missing qdrantCollection', () => {
        const config = { ...validConfig, qdrantCollection: '' };
        assert.throws(
            () => new SchemaIntelligenceService(config as SchemaCrawlerConfig),
            /qdrantCollection is required/
        );
    });

    it('should reject database without type', () => {
        const config = {
            ...validConfig,
            databases: [{ connectionString: 'postgresql://localhost/test' }],
        };
        assert.throws(
            () => new SchemaIntelligenceService(config as SchemaCrawlerConfig),
            /Database type is required/
        );
    });

    it('should reject database without connectionString', () => {
        const config = {
            ...validConfig,
            databases: [{ type: 'postgresql' }],
        };
        assert.throws(
            () => new SchemaIntelligenceService(config as SchemaCrawlerConfig),
            /Database connectionString is required/
        );
    });

    it('should reject invalid database type', () => {
        const config = {
            ...validConfig,
            databases: [
                {
                    type: 'invalid' as any,
                    connectionString: 'postgresql://localhost/test',
                },
            ],
        };
        assert.throws(
            () => new SchemaIntelligenceService(config),
            /Invalid database type/
        );
    });
});
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/config-validation.test.ts
git commit -m "test: add configuration validation tests"
```

---

### Task 15: Update Integration Tests

**Files:**
- Modify: `tests/integration.test.ts`

**Step 1: Read the current integration test**

Read: `tests/integration.test.ts`

**Step 2: Verify all database types are tested**

Ensure the integration test includes all five database types (PostgreSQL, MySQL, MongoDB, Redis, InfluxDB). If any are missing, add them.

**Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: Tests pass (or skip if databases not available)

**Step 4: Commit if changes made**

```bash
git add tests/integration.test.ts
git commit -m "test: ensure all database types tested in integration"
```

---

## Phase 2: Comprehensive Documentation

### Task 16: Create Architecture Documentation

**Files:**
- Create: `docs/architecture.md`

**Step 1: Write architecture documentation**

Create `docs/architecture.md`:

```markdown
# Architecture

## Overview

Schema Intelligence is a database schema documentation and vectorization service that crawls multiple database types, generates semantic descriptions, and provides search capabilities across all schemas.

## System Components

```
┌─────────────────────────────────────────────────────────┐
│         SchemaIntelligenceService                       │
│  (Main orchestrator)                                    │
└───────────┬─────────────────────────────────────────────┘
            │
            ├─────► DatabaseCrawlerStrategy (Interface)
            │       │
            │       ├─► PostgresCrawlerAdapter
            │       ├─► MySQLCrawlerAdapter
            │       ├─► MongoDBCrawlerAdapter
            │       ├─► RedisCrawlerAdapter
            │       └─► InfluxDBCrawlerAdapter
            │
            ├─────► SchemaVectorizer
            │       (Generates embeddings, stores in Qdrant)
            │
            ├─────► LLMDescriptionGenerator (Optional)
            │       (Enriches schemas with AI-generated descriptions)
            │
            └─────► SchemaChangeTracker (Optional)
                    (Tracks schema changes over time)
```

## Core Architecture Patterns

### Strategy Pattern for Database Crawlers

All database crawlers implement the `DatabaseCrawlerStrategy` interface:

```typescript
interface DatabaseCrawlerStrategy {
    type: DatabaseType;
    connect(connectionString: string, alias: string): Promise<void>;
    crawl(alias: string): Promise<SchemaMetadata[]>;
    close(): Promise<void>;
}
```

**Benefits:**
- Uniform handling of all database types
- Easy to add new database types
- Impossible to forget a database in initialization, scanning, or cleanup
- Reduces code duplication

### Parallel Processing

The service uses parallel processing for:
- **Database connections** - All databases connect simultaneously
- **Schema scanning** - All databases are crawled in parallel
- **Connection cleanup** - All connections close simultaneously

This significantly reduces initialization and scan times for multi-database environments.

### Graceful Degradation

When individual databases fail:
- Other databases continue processing
- Errors are logged with context
- Partial results are returned
- Service remains operational

## Data Flow

### 1. Initialization Flow

```
Start
  │
  ├─► Validate Configuration
  │
  ├─► Initialize Qdrant Collection
  │
  ├─► Connect to All Databases (Parallel)
  │     ├─► PostgreSQL
  │     ├─► MySQL
  │     ├─► MongoDB
  │     ├─► Redis
  │     └─► InfluxDB
  │
  ├─► Run Initial Scan
  │
  └─► Start Periodic Scanning (if configured)
```

### 2. Scanning Flow

```
Scan Triggered
  │
  ├─► Check if scan already in progress (skip if yes)
  │
  ├─► Crawl All Databases (Parallel)
  │     └─► Extract Schema Metadata
  │
  ├─► Enrich with LLM (Optional)
  │     └─► Generate Human-Readable Descriptions
  │
  ├─► Detect Changes
  │     └─► Compare Checksums
  │
  ├─► Vectorize Schemas
  │     └─► Generate Embeddings → Store in Qdrant
  │
  ├─► Track Changes (Optional)
  │     └─► Record Snapshots for History
  │
  └─► Apply Memory Limits
        └─► Evict Old Metadata if Needed
```

### 3. Search Flow

```
Search Query
  │
  ├─► Vectorize Query
  │
  ├─► Search Qdrant
  │     └─► Find Similar Schema Embeddings
  │
  └─► Return Results with Metadata
```

## Change Detection

Schema changes are detected using SHA256 checksums:

1. **CREATE** - New schema detected (no previous checksum)
2. **ALTER** - Schema modified (checksum changed)
3. **DROP** - Schema deleted (checksum exists but schema gone)

Changes can be tracked:
- **In-memory** - Current session only
- **Persistent** - Historical tracking with `SchemaChangeTracker`

## Vectorization

Schemas are converted to embeddings for semantic search:

1. **Simple Model** (Default) - TF-IDF based, no external API
2. **OpenAI** - High-quality embeddings via OpenAI API
3. **Anthropic** - Claude-based embeddings

Embeddings are stored in Qdrant for fast similarity search.

## Security Features

- **Connection String Sanitization** - Credentials masked in logs
- **Configuration Validation** - Early detection of invalid configs
- **Optional LLM Enrichment** - Opt-in to prevent unintended data sharing
- **Error Sanitization** - Sensitive data removed from error logs

## Performance Features

- **Parallel Operations** - Connections, scans, and cleanup parallelized
- **Memory Limits** - Configurable history size to prevent unbounded growth
- **Scan Overlap Prevention** - Only one scan runs at a time
- **Graceful Degradation** - Partial failures don't halt entire service

## Extension Points

### Adding a New Database Type

1. Create crawler implementing `DatabaseCrawlerStrategy`
2. Create adapter class
3. Add to factory function
4. Done - no changes to service needed

### Adding a New Embedding Model

1. Implement embedding generation in `SchemaVectorizer`
2. Add configuration option
3. Update factory logic

## Deployment Modes

- **Standalone Service** - Run as HTTP API server
- **CLI Tool** - Command-line interface for one-off scans
- **MCP Server** - Model Context Protocol for AI tool integration
- **Library** - Import and use programmatically in Node.js

## Dependencies

- **PostgreSQL** - `pg` client
- **MySQL** - `mysql2` client
- **MongoDB** - `mongodb` driver
- **Redis** - `redis` client
- **InfluxDB** - `@influxdata/influxdb-client`
- **Qdrant** - `@qdrant/js-client-rest`
- **Logging** - `pino`
- **MCP** - `@modelcontextprotocol/sdk`

## Design Decisions

### Why Strategy Pattern?

The original design used five separate crawler maps, leading to repetitive code and bugs where database types were handled inconsistently. The strategy pattern eliminates this by enforcing uniform handling.

### Why Parallel Processing?

Multi-database environments can have 10+ databases. Sequential processing would take 10x longer. Parallel processing with `Promise.allSettled` provides graceful degradation and speed.

### Why Memory Limits?

In large deployments, schemas can number in the thousands. Unbounded storage would lead to memory leaks. Configurable limits with LRU eviction prevent this.
```

**Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add architecture documentation"
```

---

### Task 17: Create API Documentation

**Files:**
- Create: `docs/api.md`

**Step 1: Read HTTP router and MCP server files**

Read: `src/http-router.ts` and `src/mcp-server.ts`

**Step 2: Write API documentation**

Create `docs/api.md` based on the routes and tools found in those files. Document:
- HTTP endpoints with request/response examples
- MCP tools, resources, and prompts
- Authentication (if any)
- Error codes

**Step 3: Commit**

```bash
git add docs/api.md
git commit -m "docs: add API documentation"
```

---

### Task 18: Create Development Documentation

**Files:**
- Create: `docs/development.md`

**Step 1: Write development documentation**

Create `docs/development.md`:

```markdown
# Development Guide

## Prerequisites

- Node.js >= 20.0.0
- Docker (for database testing)
- Git

## Setup

1. **Clone repository:**
   ```bash
   git clone https://github.com/iodev/schema-intelligence.git
   cd schema-intelligence
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database connections
   ```

## Development Workflow

### Build

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
```

### Testing

```bash
npm test                  # Run unit tests
npm run test:integration  # Run integration tests (requires databases)
npm run lint              # Type check
```

### Running Locally

**As HTTP Server:**
```bash
npm run build
npm start
```

**As MCP Server:**
```bash
npm run build
npm run mcp
```

**As CLI:**
```bash
npm run build
npm link
si --help
```

## Project Structure

```
schema-intelligence/
├── src/
│   ├── crawlers/               # Database crawler adapters
│   ├── cli.ts                  # CLI entrypoint
│   ├── http-router.ts          # HTTP API routes
│   ├── index.ts                # Main library exports
│   ├── llm-description-generator.ts
│   ├── mcp-entrypoint.ts       # MCP server entrypoint
│   ├── mcp-server.ts           # MCP tools/resources
│   ├── schema-change-tracker.ts
│   ├── schema-intelligence-service.ts  # Main service
│   ├── schema-relationship-graph.ts
│   ├── schema-vectorizer.ts
│   ├── server-entrypoint.ts    # HTTP server entrypoint
│   ├── server.ts               # HTTP server setup
│   ├── types.ts                # TypeScript types
│   └── *-crawler.ts            # Individual DB crawlers
├── tests/                      # Test files
├── docs/                       # Documentation
├── examples/                   # Usage examples
└── dist/                       # Compiled output
```

## Adding a New Database Type

1. **Create crawler class:**

```typescript
// src/my-db-crawler.ts
export class MyDBCrawler {
    async connect(connectionString: string, alias: string): Promise<void> {
        // Connect to database
    }
    
    async crawlDatabase(alias: string): Promise<SchemaMetadata[]> {
        // Extract schemas
    }
    
    async close(): Promise<void> {
        // Close connection
    }
}
```

2. **Create adapter:**

```typescript
// src/crawlers/my-db-crawler-adapter.ts
import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { MyDBCrawler } from '../my-db-crawler.js';

export class MyDBCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'mydb';
    private crawler = new MyDBCrawler();
    
    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }
    
    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }
    
    async close(): Promise<void> {
        await this.crawler.close();
    }
}
```

3. **Update factory:**

```typescript
// src/crawlers/factory.ts
import { MyDBCrawlerAdapter } from './my-db-crawler-adapter.js';

export function createCrawlerStrategy(type: DatabaseType): DatabaseCrawlerStrategy {
    switch (type) {
        // ... existing cases
        case 'mydb':
            return new MyDBCrawlerAdapter();
        default:
            throw new Error(`Unknown database type: ${type}`);
    }
}
```

4. **Update types:**

```typescript
// src/types.ts
export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb' | 'mydb';
```

5. **Write tests:**

Create `tests/my-db-crawler.test.ts` with unit tests.

6. **Update documentation:**

Add to README.md, this guide, and examples.

## Debugging

### Enable Debug Logs

```bash
LOG_LEVEL=debug npm start
```

### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "program": "${workspaceFolder}/dist/server-entrypoint.js",
      "preLaunchTask": "npm: build",
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

### Common Issues

**"Cannot find module" errors:**
- Run `npm run build` first
- Check import paths use `.js` extension

**Database connection failures:**
- Verify database is running
- Check connection string format
- Review logs for authentication errors

**TypeScript errors:**
- Run `npm run lint` to see all errors
- Check tsconfig.json settings

## Code Style

- **TypeScript strict mode** - All code uses strict type checking
- **Async/await** - Prefer over callbacks/promises
- **Error handling** - Always use try/catch for async operations
- **Logging** - Use pino logger, include context
- **Comments** - JSDoc for public APIs, inline for complex logic
- **Naming** - camelCase for variables/functions, PascalCase for classes

## Testing Guidelines

### Unit Tests

- Test individual functions/classes in isolation
- Mock external dependencies
- Use descriptive test names
- Aim for >80% coverage

### Integration Tests

- Test end-to-end flows
- Use real databases via Docker
- Set `RUN_INTEGRATION_TESTS=1` environment variable
- Clean up after tests

### Test Structure

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Feature Name', () => {
    it('should do something specific', () => {
        const result = functionUnderTest(input);
        assert.strictEqual(result, expected);
    });
    
    it('should handle errors gracefully', () => {
        assert.throws(
            () => functionUnderTest(invalidInput),
            /Expected error message/
        );
    });
});
```

## Git Workflow

### Branch Naming

- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/topic` - Documentation
- `refactor/component` - Code refactoring

### Commit Messages

Follow conventional commits:

```
feat: add MySQL support
fix: close all database connections in shutdown
docs: add API documentation
refactor: use strategy pattern for crawlers
test: add integration tests for all databases
```

### Pull Request Process

1. Create feature branch
2. Make changes with tests
3. Ensure all tests pass
4. Update documentation
5. Submit PR with description
6. Address review comments
7. Squash and merge

## Performance Profiling

```bash
node --cpu-prof dist/server-entrypoint.js
```

Analyze with Chrome DevTools.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.
```

**Step 2: Commit**

```bash
git add docs/development.md
git commit -m "docs: add development guide"
```

---

### Task 19: Create Deployment Documentation

**Files:**
- Create: `docs/deployment.md`

**Step 1: Read Docker and compose files**

Read: `Dockerfile`, `docker-compose.yml`, `docker-compose.test.yml`

**Step 2: Write deployment documentation**

Create `docs/deployment.md` based on Docker setup found. Include:
- Docker deployment instructions
- Configuration environment variables
- Production best practices
- Monitoring setup
- Security considerations

**Step 3: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: add deployment guide"
```

---

### Task 20: Create CHANGELOG

**Files:**
- Create: `CHANGELOG.md`

**Step 1: Write CHANGELOG**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-08

### Added

- **MySQL Support** - Full support for MySQL database schema crawling
- **MCP Server Integration** - Model Context Protocol server for AI tool integration
  - Tools: search_schemas, get_schema, scan_databases, get_stats, get_relationship_graph
  - Resources: schemas, database schemas
  - Prompts: schema exploration, relationship analysis
- **HTTP API Server** - RESTful API with OpenAPI specification
  - GET /api/schemas - List all schemas
  - GET /api/schemas/:id - Get specific schema
  - POST /api/search - Search schemas semantically
  - GET /api/databases/:name/schemas - Get database schemas
  - POST /api/scan - Trigger manual scan
  - GET /api/stats - Service statistics
  - GET /api/health - Health check endpoint
- **CLI Interface** - Command-line tool with `si` alias
  - `si scan` - Scan databases
  - `si search` - Search schemas
  - `si list` - List schemas
  - `si server` - Start HTTP server
  - `si mcp` - Start MCP server
- **Schema Relationship Graph** - Analyze foreign key relationships across schemas
- **LLM Description Generator** - Optional AI-powered schema descriptions
  - OpenAI integration
  - Anthropic/Claude integration
- **Schema Change Tracker** - Persistent change tracking with history
  - Snapshot storage
  - Diff calculation
  - Change history queries

### Changed

- **Refactored to Strategy Pattern** - Unified database crawler architecture
  - Single crawler map replaces five separate maps
  - Parallel database connections
  - Graceful degradation on failures
  - Memory limits with configurable history size
  - Scan overlap prevention
- **Improved Security**
  - Connection string sanitization in logs
  - Configuration validation at initialization
  - Error sanitization to prevent data leaks
- **Improved Performance**
  - Parallel database connections
  - Parallel schema scanning
  - Parallel connection cleanup
  - Memory management with LRU eviction

### Fixed

- MongoDB, Redis, and InfluxDB schemas now properly scanned
- All database connections now properly closed in shutdown (no more resource leaks)
- Configuration validation prevents runtime errors from invalid configs
- Credentials no longer exposed in logs

## [1.0.0] - 2025-01-12

### Added

- Initial release
- Support for PostgreSQL, MongoDB, Redis, InfluxDB
- Qdrant integration for semantic search
- Change detection with SHA256 checksums
- Periodic scanning
- Comprehensive documentation

[0.1.0]: https://github.com/iodev/schema-intelligence/compare/v1.0.0...v0.1.0
[1.0.0]: https://github.com/iodev/schema-intelligence/releases/tag/v1.0.0
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG for version 0.1.0"
```

---

### Task 21: Update README

**Files:**
- Modify: `README.md`

**Step 1: Read current README**

Read: `README.md`

**Step 2: Update README**

Update the following sections:
- Add MySQL to "Features" list (line 15)
- Add links to new docs in a "Documentation" section
- Add CLI usage examples
- Add MCP server setup instructions
- Update version to 0.1.0 in any version references

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with MySQL support and new features"
```

---

### Task 22: Update CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

**Step 1: Update CONTRIBUTING**

Update `CONTRIBUTING.md`:
- Reference `docs/development.md` for detailed setup
- Add link to architecture docs
- Update project structure to include new files (crawlers/, MCP, HTTP router)

**Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: update CONTRIBUTING with new project structure"
```

---

### Task 23: Final Testing and Review

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `npm run ci`
Expected: All tests pass, no lint errors, build succeeds

**Step 2: Manual smoke test**

If you have access to databases:
```bash
npm run build
npm start
# Test a few API endpoints
```

**Step 3: Review all changes**

Run: `git diff main --stat`
Review the summary of all changes

**Step 4: Update package.json version if needed**

If this is a release, update version in `package.json` to 0.1.0

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize bug fixes and documentation"
```

---

## Completion Checklist

- [ ] All adapter classes created
- [ ] Factory function implemented
- [ ] Service refactored to use strategy pattern
- [ ] Security helpers added (sanitization, validation)
- [ ] Performance improvements added (parallelization, memory limits)
- [ ] Error handling improved (graceful degradation)
- [ ] Unit tests written and passing
- [ ] Integration tests updated and passing
- [ ] Architecture docs created
- [ ] API docs created
- [ ] Development docs created
- [ ] Deployment docs created
- [ ] CHANGELOG created
- [ ] README updated
- [ ] CONTRIBUTING updated
- [ ] All tests passing
- [ ] No lint errors
- [ ] Build succeeds

---

## Estimated Time

- **Phase 1 (Bug Fixes):** 3-4 hours
- **Phase 2 (Documentation):** 2-3 hours
- **Total:** 5-7 hours

---

## Success Criteria

1. All database types (PostgreSQL, MySQL, MongoDB, Redis, InfluxDB) scanned correctly
2. All database connections closed properly in shutdown
3. No resource leaks
4. Configuration validated on initialization
5. No credentials in logs
6. Parallel operations working correctly
7. Memory limits enforced
8. All tests passing
9. Build succeeds
10. All documentation complete and accurate
