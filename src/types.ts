/**
 * Schema Intelligence System - Types
 *
 * Defines types for database schema extraction and vectorization
 */

export interface TableColumn {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    foreignKeyTarget?: {
        table: string;
        column: string;
    };
    description?: string;
}

export interface TableIndex {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
}

export interface TableConstraint {
    name: string;
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
    columns: string[];
    definition: string;
}

export interface TableSchema {
    database: string;
    schema?: string;
    tableName: string;
    columns: TableColumn[];
    indexes: TableIndex[];
    constraints: TableConstraint[];
    rowCount?: number;
    sizeBytes?: number;
    description?: string;
    createdAt?: Date;
    lastModified?: Date;
}

export interface MongoFieldSchema {
    name: string;
    types: string[]; // Can have multiple types in MongoDB
    nullable: boolean;
    commonValue?: unknown;
}

export interface MongoIndexSchema {
    name: string;
    keys: Record<string, number | string>; // 1 for ascending, -1 for descending, or other index types
    unique: boolean;
}

export interface MongoCollectionSchema {
    database: string;
    collectionName: string;
    fields: MongoFieldSchema[];
    indexes: MongoIndexSchema[];
    documentCount?: number;
    sizeBytes?: number;
    avgDocSize?: number;
    description?: string;
    lastModified?: Date;
}

export interface RedisKeyPattern {
    pattern: string; // e.g., "cache:*", "session:user:*"
    type: string; // string, hash, list, set, zset
    exampleKeys: string[];
    count: number;
    ttl?: number; // Average TTL in seconds
    sampleValue?: unknown;
}

export interface RedisPatternSchema {
    database: string;
    patterns: RedisKeyPattern[];
    totalKeys: number;
    lastScanned: Date;
}

export interface InfluxMeasurement {
    name: string;
    tags: string[];
    fields: string[];
    count?: number;
}

export interface InfluxBucketSchema {
    database: string;
    bucketName: string;
    orgName: string;
    retentionPeriod?: number; // in seconds
    measurements: InfluxMeasurement[];
    lastScanned: Date;
}

/**
 * Base fields shared by all schema metadata variants
 */
interface SchemaMetadataBase {
    id: string;
    database: string;
    objectName: string; // table or collection name
    fullName: string; // schema.table or database.collection
    description: string; // human-readable description for vectorization
    vectorId?: string; // Qdrant vector ID
    lastScanned: Date;
    checksum: string; // for change detection
}

export interface PostgresSchemaMetadata extends SchemaMetadataBase {
    type: 'postgresql';
    schema: TableSchema;
}

export interface MongoSchemaMetadata extends SchemaMetadataBase {
    type: 'mongodb';
    schema: MongoCollectionSchema;
}

export interface MySQLSchemaMetadata extends SchemaMetadataBase {
    type: 'mysql';
    schema: TableSchema;
}

export interface RedisSchemaMetadata extends SchemaMetadataBase {
    type: 'redis';
    schema: RedisPatternSchema;
}

export interface InfluxDBSchemaMetadata extends SchemaMetadataBase {
    type: 'influxdb';
    schema: InfluxBucketSchema;
}

/**
 * Discriminated union of all schema metadata types
 */
export type SchemaMetadata =
    | PostgresSchemaMetadata
    | MongoSchemaMetadata
    | MySQLSchemaMetadata
    | RedisSchemaMetadata
    | InfluxDBSchemaMetadata;

export interface SchemaChangeEvent {
    type: 'CREATE' | 'ALTER' | 'DROP';
    database: string;
    objectType: 'TABLE' | 'COLUMN' | 'INDEX' | 'CONSTRAINT' | 'COLLECTION';
    objectName: string;
    timestamp: Date;
    details: Record<string, unknown>;
}

export interface LLMConfig {
    provider: 'openai' | 'anthropic' | 'template';
    model?: string;
    apiKey?: string;
    maxConcurrency?: number;
    cacheDescriptions?: boolean;
}

export interface SchemaCrawlerConfig {
    databases: Array<{
        type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';
        connectionString: string;
        databases?: string[]; // specific databases to crawl
        excludeDatabases?: string[];
        excludeSchemas?: string[];
    }>;
    qdrantUrl: string;
    qdrantCollection: string;
    embeddingModel: 'voyage' | 'openai' | 'anthropic' | 'simple';
    scanInterval?: number; // minutes between scans
    enableChangeDetection?: boolean;
    llm?: LLMConfig;
    changeTracking?: {
        enabled: boolean;
        storageDir?: string;
        retentionDays?: number;
    };
}

// ---------------------------------------------------------------------------
// Change tracking types (Phase 2C)
// ---------------------------------------------------------------------------

export interface SchemaSnapshot {
    id: string;
    schemaId: string;           // references SchemaMetadata.id
    database: string;
    objectName: string;
    type: string;               // 'table' | 'collection' etc.
    checksum: string;
    metadata: SchemaMetadata;
    capturedAt: Date;
}

export interface SchemaDiff {
    schemaId: string;
    database: string;
    objectName: string;
    before: SchemaSnapshot | null;  // null = newly created
    after: SchemaSnapshot | null;   // null = deleted
    changes: DiffEntry[];
    detectedAt: Date;
}

export interface DiffEntry {
    path: string;               // e.g. "columns.email.type", "indexes.idx_name"
    type: 'added' | 'removed' | 'modified';
    oldValue?: unknown;
    newValue?: unknown;
}

export interface ChangeHistoryEntry {
    id: string;
    schemaId: string;
    database: string;
    objectName: string;
    changeType: 'created' | 'modified' | 'deleted';
    diff: SchemaDiff;
    timestamp: Date;
}

// ---------------------------------------------------------------------------
// Database crawler strategy pattern (Task 1)
// ---------------------------------------------------------------------------

/**
 * Supported database types
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';

/**
 * Unified interface for all database crawlers
 */
export interface DatabaseCrawlerStrategy {
    type: DatabaseType;
    connect(connectionString: string, alias: string): Promise<void>;
    crawl(alias: string): Promise<SchemaMetadata[]>;
    close(): Promise<void>;
}
