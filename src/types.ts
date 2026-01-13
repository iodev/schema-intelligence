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
    commonValue?: any;
}

export interface MongoIndexSchema {
    name: string;
    keys: Record<string, any>; // 1 for ascending, -1 for descending, or other index types
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

export interface SchemaMetadata {
    id: string;
    type: 'postgresql' | 'mongodb' | 'mysql' | 'redis' | 'influxdb';
    database: string;
    objectName: string; // table or collection name
    fullName: string; // schema.table or database.collection
    description: string; // human-readable description for vectorization
    schema: TableSchema | MongoCollectionSchema | any; // any for Redis/InfluxDB schemas
    vectorId?: string; // Qdrant vector ID
    lastScanned: Date;
    checksum: string; // for change detection
}

export interface SchemaChangeEvent {
    type: 'CREATE' | 'ALTER' | 'DROP';
    database: string;
    objectType: 'TABLE' | 'COLUMN' | 'INDEX' | 'CONSTRAINT' | 'COLLECTION';
    objectName: string;
    timestamp: Date;
    details: any;
}

export interface SchemaCrawlerConfig {
    databases: Array<{
        type: 'postgresql' | 'mongodb' | 'redis' | 'influxdb';
        connectionString: string;
        databases?: string[]; // specific databases to crawl
        excludeDatabases?: string[];
        excludeSchemas?: string[];
    }>;
    qdrantUrl: string;
    qdrantCollection: string;
    embeddingModel: string;
    scanInterval?: number; // minutes between scans
    enableChangeDetection?: boolean;
}
