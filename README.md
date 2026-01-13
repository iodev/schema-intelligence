# Schema Intelligence

**Automated database schema documentation and vectorization for PostgreSQL, MongoDB, Redis, and InfluxDB**

Schema Intelligence automatically crawls your databases, extracts schema metadata, generates human-readable descriptions, and vectorizes them for semantic search. Perfect for:

- **Multi-database environments** - Document schemas across PostgreSQL, MongoDB, Redis, and InfluxDB
- **Semantic search** - Find tables/collections by natural language queries
- **Change detection** - Track schema changes over time with checksums
- **API generation** - Auto-discover schemas for code generation tools
- **Documentation** - Maintain up-to-date schema documentation automatically

## Features

- ✅ **PostgreSQL** - Tables, columns, types, constraints, indexes
- ✅ **MongoDB** - Collections, field types, indexes, validators
- ✅ **Redis** - Key patterns, data types, TTLs, sample values
- ✅ **InfluxDB** - Buckets, measurements, tags, fields, retention policies
- ✅ **Qdrant Integration** - Vector storage for semantic search
- ✅ **Change Detection** - SHA256 checksums track CREATE/ALTER/DROP events
- ✅ **Periodic Scanning** - Automated schema refresh on interval
- ✅ **Graceful Degradation** - Handles connection failures per database

## Installation

```bash
npm install @caelum/schema-intelligence
```

## Quick Start

```typescript
import { SchemaIntelligenceService } from '@caelum/schema-intelligence';

const service = new SchemaIntelligenceService({
    databases: [
        {
            type: 'postgresql',
            connectionString: 'postgresql://user:pass@host:5432/database'
        },
        {
            type: 'mongodb',
            connectionString: 'mongodb://user:pass@host:27017/database'
        },
        {
            type: 'redis',
            connectionString: 'redis://host:6379'
        },
        {
            type: 'influxdb',
            connectionString: 'http://host:8086?token=xxx&org=myorg'
        }
    ],
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'database_schemas',
    embeddingModel: 'simple',
    scanInterval: 60, // minutes
    enableChangeDetection: true
});

// Initialize and scan
await service.initialize();

// Search schemas semantically
const results = await service.searchSchemas('user authentication tables', 5);

// Get specific schema
const schema = await service.getSchema('mydb', 'public', 'users');

// Get all schemas for a database
const schemas = await service.getDatabaseSchemas('mydb');

// Get statistics
const stats = await service.getStats();

// Graceful shutdown
await service.shutdown();
```

## Configuration

### Database Configuration

```typescript
interface SchemaCrawlerConfig {
    databases: Array<{
        type: 'postgresql' | 'mongodb' | 'redis' | 'influxdb';
        connectionString: string;
        databases?: string[];          // Optional: limit to specific databases
        excludeDatabases?: string[];   // Optional: exclude specific databases
        excludeSchemas?: string[];     // Optional: exclude schemas (PostgreSQL)
    }>;
    qdrantUrl: string;                // Qdrant vector database URL
    qdrantCollection: string;         // Collection name for schemas
    embeddingModel: 'simple' | 'openai' | 'custom';  // Embedding strategy
    scanInterval?: number;            // Minutes between scans (0 = no periodic scan)
    enableChangeDetection?: boolean;  // Track schema changes
}
```

### Connection String Formats

**PostgreSQL:**
```
postgresql://user:password@host:port/database
```

**MongoDB:**
```
mongodb://user:password@host:port/database?authSource=admin
```

**Redis:**
```
redis://host:port
redis://host:port/0  // Specify database number
```

**InfluxDB:**
```
http://host:port?token=YOUR_TOKEN&org=YOUR_ORG
```

## Schema Metadata Structure

```typescript
interface SchemaMetadata {
    id: string;                    // Unique identifier
    type: 'postgresql' | 'mongodb' | 'redis' | 'influxdb';
    database: string;              // Database/instance name
    objectName: string;            // Table/collection/pattern/bucket name
    fullName: string;              // Fully qualified name
    description: string;           // Human-readable description
    schema: any;                   // Full schema details
    vectorId?: string;             // Qdrant point ID
    lastScanned: Date;             // Last scan timestamp
    checksum: string;              // SHA256 for change detection
}
```

## API Reference

### SchemaIntelligenceService

#### `initialize(): Promise<void>`
Connects to all databases and performs initial scan.

#### `scanAllDatabases(): Promise<void>`
Manually trigger a full scan of all databases.

#### `searchSchemas(query: string, limit?: number): Promise<SearchResult[]>`
Search schemas using natural language query.

```typescript
const results = await service.searchSchemas('payment processing tables', 5);
// Returns: [ { id, score, database, table, description, schema }, ... ]
```

#### `getSchema(database: string, schema: string, table: string): Promise<any>`
Get schema by exact name.

#### `getDatabaseSchemas(database: string): Promise<any[]>`
Get all schemas for a database.

#### `getStats(): Promise<Stats>`
Get service statistics (total schemas, schemas per database, last scan time).

#### `shutdown(): Promise<void>`
Close all database connections and stop periodic scanning.

## Examples

### Example 1: Document Multiple Databases

```typescript
import { SchemaIntelligenceService } from '@caelum/schema-intelligence';

const service = new SchemaIntelligenceService({
    databases: [
        {
            type: 'postgresql',
            connectionString: 'postgresql://user:pass@localhost:5432/app_db',
            excludeSchemas: ['information_schema', 'pg_catalog']
        },
        {
            type: 'mongodb',
            connectionString: 'mongodb://localhost:27017/app_db'
        }
    ],
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'app_schemas',
    embeddingModel: 'simple',
    scanInterval: 0,  // Manual scanning only
    enableChangeDetection: false
});

await service.initialize();
console.log('Schema documentation complete!');
await service.shutdown();
```

### Example 2: Change Detection

```typescript
const service = new SchemaIntelligenceService({
    databases: [
        { type: 'postgresql', connectionString: 'postgresql://...' }
    ],
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'schemas',
    embeddingModel: 'simple',
    scanInterval: 15,  // Scan every 15 minutes
    enableChangeDetection: true
});

await service.initialize();

// Schema changes are logged automatically
// Check logs for: "Schema change detected"
// Change types: CREATE, ALTER, DROP
```

### Example 3: Redis Key Pattern Analysis

```typescript
import { RedisPatternCrawler } from '@caelum/schema-intelligence';

const crawler = new RedisPatternCrawler();
await crawler.connect('redis://localhost:6379', 'cache_redis');

const patterns = await crawler.extractPatterns('cache_redis', 5000);
console.log('Discovered patterns:', patterns.patterns);
// Example output:
// [
//   { pattern: 'cache:user:*', type: 'string', count: 1234, ttl: 3600 },
//   { pattern: 'session:*', type: 'hash', count: 567, ttl: 7200 }
// ]

await crawler.close();
```

### Example 4: InfluxDB Bucket Documentation

```typescript
import { InfluxDBBucketCrawler } from '@caelum/schema-intelligence';

const crawler = new InfluxDBBucketCrawler();
await crawler.connect(
    'http://localhost:8086?token=YOUR_TOKEN&org=myorg',
    'metrics_influx'
);

const buckets = await crawler.getBuckets('metrics_influx');
for (const bucket of buckets) {
    const schema = await crawler.extractBucketSchema('metrics_influx', bucket.name);
    console.log(`Bucket: ${bucket.name}`);
    console.log(`Measurements: ${schema.measurements.length}`);
    console.log(`Retention: ${schema.retentionPeriod} seconds`);
}

await crawler.close();
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│         SchemaIntelligenceService                       │
│  (Main orchestrator)                                    │
└───────────┬─────────────────────────────────────────────┘
            │
            ├─────► PostgreschemaCrawler
            │       (Extracts tables, columns, types, constraints)
            │
            ├─────► MongoDBSchemaCrawler
            │       (Extracts collections, fields, indexes, validators)
            │
            ├─────► RedisPatternCrawler
            │       (Extracts key patterns, types, TTLs, samples)
            │
            ├─────► InfluxDBBucketCrawler
            │       (Extracts buckets, measurements, tags, fields)
            │
            └─────► SchemaVectorizer
                    (Generates embeddings, stores in Qdrant)
```

## Change Detection

Schema changes are detected by comparing SHA256 checksums:

```typescript
// CREATE event - New schema detected
{
    type: 'CREATE',
    database: 'mydb',
    objectType: 'TABLE',
    objectName: 'users',
    timestamp: Date,
    details: { metadata }
}

// ALTER event - Schema modified
{
    type: 'ALTER',
    database: 'mydb',
    objectType: 'TABLE',
    objectName: 'users',
    timestamp: Date,
    details: { previousChecksum, newChecksum }
}

// DROP event - Schema deleted
{
    type: 'DROP',
    database: 'mydb',
    objectType: 'TABLE',
    objectName: 'users',
    timestamp: Date,
    details: { id, previousChecksum }
}
```

## Embedding Models

### Simple (Default)
Fast, deterministic embeddings using TF-IDF. No external API required.

### OpenAI (Future)
High-quality embeddings using OpenAI's text-embedding-3-small model.

### Custom (Future)
Bring your own embedding function.

## Performance

- **PostgreSQL**: ~100 schemas/sec
- **MongoDB**: ~50 collections/sec
- **Redis**: ~1000 keys/sec (SCAN-based, non-blocking)
- **InfluxDB**: ~10 buckets/sec (Flux query overhead)

Vectorization throughput: ~500 schemas/sec (simple model)

## Requirements

- **Node.js**: >= 18.0.0
- **Qdrant**: >= 1.7.0 (for vector storage)
- **TypeScript**: >= 5.0.0 (development)

## Logging

Uses `pino` for structured logging:

```typescript
// All crawlers log:
// - Connection events
// - Scan progress
// - Errors with context
// - Change detection events

// Set log level via environment:
// LOG_LEVEL=debug node your-script.js
```

## Error Handling

- **Graceful degradation**: Failed database connections don't crash the service
- **Per-crawler isolation**: One database failure doesn't affect others
- **Retry logic**: Automatic reconnection on transient failures
- **Detailed error logging**: Full stack traces and context

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- GitHub Issues: https://github.com/iodev/schema-intelligence/issues
- Documentation: https://github.com/iodev/schema-intelligence#readme

## Changelog

### 1.0.0 (2025-01-12)
- Initial release
- Support for PostgreSQL, MongoDB, Redis, InfluxDB
- Qdrant integration for semantic search
- Change detection with SHA256 checksums
- Periodic scanning
- Comprehensive documentation
