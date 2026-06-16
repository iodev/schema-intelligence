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
    types: string[];
    nullable: boolean;
    commonValue?: unknown;
}
export interface MongoIndexSchema {
    name: string;
    keys: Record<string, number | string>;
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
    pattern: string;
    type: string;
    exampleKeys: string[];
    count: number;
    ttl?: number;
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
    retentionPeriod?: number;
    measurements: InfluxMeasurement[];
    lastScanned: Date;
}
/**
 * Base fields shared by all schema metadata variants
 */
interface SchemaMetadataBase {
    id: string;
    database: string;
    objectName: string;
    fullName: string;
    description: string;
    vectorId?: string;
    lastScanned: Date;
    checksum: string;
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
export type SchemaMetadata = PostgresSchemaMetadata | MongoSchemaMetadata | MySQLSchemaMetadata | RedisSchemaMetadata | InfluxDBSchemaMetadata;
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
        databases?: string[];
        excludeDatabases?: string[];
        excludeSchemas?: string[];
    }>;
    qdrantUrl: string;
    qdrantCollection: string;
    embeddingModel: 'voyage' | 'openai' | 'anthropic' | 'simple';
    scanInterval?: number;
    enableChangeDetection?: boolean;
    llm?: LLMConfig;
    changeTracking?: {
        enabled: boolean;
        storageDir?: string;
        retentionDays?: number;
    };
}
export interface SchemaSnapshot {
    id: string;
    schemaId: string;
    database: string;
    objectName: string;
    type: string;
    checksum: string;
    metadata: SchemaMetadata;
    capturedAt: Date;
}
export interface SchemaDiff {
    schemaId: string;
    database: string;
    objectName: string;
    before: SchemaSnapshot | null;
    after: SchemaSnapshot | null;
    changes: DiffEntry[];
    detectedAt: Date;
}
export interface DiffEntry {
    path: string;
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
export {};
//# sourceMappingURL=types.d.ts.map