/**
 * MongoDB Schema Crawler
 *
 * Extracts collection schemas by analyzing document structure
 */

import { MongoClient, Db } from 'mongodb';
import { createHash } from 'crypto';
import pino from 'pino';
import {
    MongoCollectionSchema,
    MongoFieldSchema,
    SchemaMetadata,
} from './types.js';

export class MongoDBSchemaCrawler {
    private logger: pino.Logger;
    private clients: Map<string, MongoClient> = new Map();
    private databases: Map<string, Db> = new Map();

    constructor() {
        this.logger = pino({ name: 'mongodb-schema-crawler' });
    }

    /**
     * Connect to a MongoDB database
     */
    async connect(connectionString: string, alias: string): Promise<void> {
        const client = new MongoClient(connectionString);
        await client.connect();

        // Extract database name from connection string
        const dbName = this.extractDbName(connectionString);
        const db = client.db(dbName);

        this.clients.set(alias, client);
        this.databases.set(alias, db);
        this.logger.info({ alias, dbName }, 'Connected to MongoDB database');
    }

    /**
     * Get all collections in the database
     */
    async getCollections(dbAlias: string): Promise<string[]> {
        const db = this.databases.get(dbAlias);
        if (!db) throw new Error(`Database ${dbAlias} not connected`);

        const collections = await db.listCollections().toArray();
        return collections
            .filter(c => !c.name.startsWith('system.'))
            .map(c => c.name);
    }

    /**
     * Extract collection schema by sampling documents
     */
    async extractCollectionSchema(
        dbAlias: string,
        collectionName: string,
        sampleSize: number = 100
    ): Promise<MongoCollectionSchema> {
        const db = this.databases.get(dbAlias);
        if (!db) throw new Error(`Database ${dbAlias} not connected`);

        const collection = db.collection(collectionName);

        // Get document count
        const docCount = await collection.countDocuments();

        // Sample documents to infer schema
        const samples = await collection
            .find({})
            .limit(sampleSize)
            .toArray();

        // Analyze field structure
        const fields = this.analyzeDocumentStructure(samples);

        // Get collection stats
        const stats = await db.command({ collStats: collectionName });

        // Get indexes
        const indexes = await collection.indexes();

        return {
            database: dbAlias,
            collectionName,
            fields,
            indexes: indexes.map(idx => ({
                name: idx.name || 'unknown',
                keys: idx.key,
                unique: idx.unique || false,
            })),
            documentCount: docCount,
            sizeBytes: stats.size || 0,
            avgDocSize: stats.avgObjSize || 0,
            lastModified: new Date(),
        };
    }

    /**
     * Analyze document structure to infer schema
     */
    private analyzeDocumentStructure(documents: Record<string, unknown>[]): MongoFieldSchema[] {
        if (documents.length === 0) return [];

        const fieldStats = new Map<string, {
            types: Set<string>;
            nullable: boolean;
            examples: unknown[];
        }>();

        // Analyze each document
        for (const doc of documents) {
            this.analyzeDocument(doc, '', fieldStats);
        }

        // Convert to schema format
        const fields: MongoFieldSchema[] = [];
        for (const [fieldPath, stats] of Array.from(fieldStats)) {
            const types = Array.from(stats.types);
            fields.push({
                name: fieldPath,
                types,
                nullable: stats.nullable,
                commonValue: this.getMostCommonValue(stats.examples),
            });
        }

        return fields.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Recursively analyze document fields
     */
    private analyzeDocument(
        obj: Record<string, unknown>,
        prefix: string,
        fieldStats: Map<string, {
            types: Set<string>;
            nullable: boolean;
            examples: unknown[];
        }>
    ): void {
        for (const [key, value] of Object.entries(obj)) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;

            if (!fieldStats.has(fieldPath)) {
                fieldStats.set(fieldPath, {
                    types: new Set<string>(),
                    nullable: false,
                    examples: [],
                });
            }

            const stats = fieldStats.get(fieldPath)!;

            if (value === null || value === undefined) {
                stats.nullable = true;
            } else {
                const type = this.getMongoType(value);
                stats.types.add(type);

                // Store examples for common value detection
                if (stats.examples.length < 10) {
                    stats.examples.push(value);
                }

                // Recursively analyze nested objects (but not arrays of objects)
                if (type === 'object' && !Array.isArray(value)) {
                    this.analyzeDocument(value as Record<string, unknown>, fieldPath, fieldStats);
                }
            }
        }
    }

    /**
     * Determine MongoDB BSON type
     */
    private getMongoType(value: unknown): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (value instanceof Date) return 'date';
        if (typeof value === 'object' && value !== null && '_bsontype' in value && (value as Record<string, unknown>)._bsontype === 'ObjectID') return 'objectId';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'int' : 'double';
        }
        if (typeof value === 'string') return 'string';
        if (typeof value === 'object') return 'object';
        return 'unknown';
    }

    /**
     * Get most common value from examples
     */
    private getMostCommonValue(examples: unknown[]): unknown {
        if (examples.length === 0) return undefined;

        const counts = new Map<string, { value: unknown; count: number }>();
        for (const example of examples) {
            const key = JSON.stringify(example);
            if (!counts.has(key)) {
                counts.set(key, { value: example, count: 0 });
            }
            counts.get(key)!.count++;
        }

        let maxCount = 0;
        let commonValue = undefined;
        for (const { value, count } of counts.values()) {
            if (count > maxCount) {
                maxCount = count;
                commonValue = value;
            }
        }

        return commonValue;
    }

    /**
     * Crawl entire database and return all collection schemas
     */
    async crawlDatabase(dbAlias: string): Promise<SchemaMetadata[]> {
        this.logger.info({ dbAlias }, 'Starting MongoDB database crawl');

        const collections = await this.getCollections(dbAlias);
        const metadata: SchemaMetadata[] = [];

        for (const collectionName of collections) {
            try {
                const collectionSchema = await this.extractCollectionSchema(
                    dbAlias,
                    collectionName
                );

                // Generate human-readable description
                const description = this.generateDescription(collectionSchema);

                // Generate checksum for change detection
                const checksum = this.generateChecksum(collectionSchema);

                metadata.push({
                    id: `${dbAlias}.${collectionName}`,
                    type: 'mongodb',
                    database: dbAlias,
                    objectName: collectionName,
                    fullName: collectionName,
                    description,
                    schema: collectionSchema,
                    lastScanned: new Date(),
                    checksum,
                });

                this.logger.debug(
                    { collectionName },
                    'Extracted collection schema'
                );
            } catch (error) {
                this.logger.error(
                    {
                        collectionName,
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorStack: error instanceof Error ? error.stack : undefined
                    },
                    'Failed to extract collection schema'
                );
            }
        }

        this.logger.info(
            { dbAlias, collectionCount: metadata.length },
            'MongoDB database crawl complete'
        );

        return metadata;
    }

    /**
     * Generate human-readable description for vectorization
     */
    private generateDescription(schema: MongoCollectionSchema): string {
        const parts: string[] = [];

        // Collection name and database
        parts.push(
            `MongoDB collection ${schema.collectionName} in ${schema.database} database`
        );

        // Field descriptions
        const fieldDescriptions = schema.fields.map(field => {
            let desc = `${field.name} (${field.types.join('|')})`;
            if (field.nullable) desc += ', nullable';
            return desc;
        });

        if (fieldDescriptions.length > 0) {
            parts.push('Fields: ' + fieldDescriptions.slice(0, 20).join(', '));
        }

        // Indexes
        if (schema.indexes.length > 0) {
            const indexDescriptions = schema.indexes
                .filter(idx => idx.name !== '_id_')
                .map(idx => {
                    const keys = Object.keys(idx.keys).join(', ');
                    return `${idx.name} on (${keys})`;
                });
            if (indexDescriptions.length > 0) {
                parts.push('Indexes: ' + indexDescriptions.join(', '));
            }
        }

        // Stats
        if (schema.documentCount) {
            parts.push(`Document count: ${schema.documentCount.toLocaleString()}`);
        }

        return parts.join('. ');
    }

    /**
     * Generate checksum for change detection
     */
    private generateChecksum(schema: MongoCollectionSchema): string {
        const data = JSON.stringify({
            fields: schema.fields,
            indexes: schema.indexes,
        });
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Extract database name from connection string
     */
    private extractDbName(connectionString: string): string {
        // mongodb://user:pass@host:port/dbname?options
        const match = connectionString.match(/\/([^/?]+)(?:\?|$)/);
        return match ? match[1] : 'test';
    }

    /**
     * Close all connections
     */
    async close(): Promise<void> {
        for (const [alias, client] of Array.from(this.clients)) {
            await client.close();
            this.logger.info({ alias }, 'Closed MongoDB connection');
        }
        this.clients.clear();
        this.databases.clear();
    }
}
