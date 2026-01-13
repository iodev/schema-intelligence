/**
 * Schema Intelligence Service
 *
 * Main orchestrator for database schema crawling, vectorization, and change detection
 */

import pino from 'pino';
import { PostgreschemaCrawler } from './postgres-schema-crawler.js';
import { MongoDBSchemaCrawler } from './mongodb-schema-crawler.js';
import { RedisPatternCrawler } from './redis-pattern-crawler.js';
import { InfluxDBBucketCrawler } from './influxdb-bucket-crawler.js';
import { SchemaVectorizer } from './schema-vectorizer.js';
import {
    SchemaCrawlerConfig,
    SchemaMetadata,
    SchemaChangeEvent,
} from './types.js';

export class SchemaIntelligenceService {
    private logger: pino.Logger;
    private config: SchemaCrawlerConfig;
    private postgresCrawlers: Map<string, PostgreschemaCrawler> = new Map();
    private mongoCrawlers: Map<string, MongoDBSchemaCrawler> = new Map();
    private redisCrawlers: Map<string, RedisPatternCrawler> = new Map();
    private influxCrawlers: Map<string, InfluxDBBucketCrawler> = new Map();
    private vectorizer: SchemaVectorizer;
    private scanInterval?: NodeJS.Timeout;
    private schemaSnapshots: Map<string, string> = new Map(); // id -> checksum

    constructor(config: SchemaCrawlerConfig) {
        this.logger = pino({ name: 'schema-intelligence-service' });
        this.config = config;

        this.vectorizer = new SchemaVectorizer({
            qdrantUrl: config.qdrantUrl,
            qdrantCollection: config.qdrantCollection,
            embeddingModel: config.embeddingModel as any,
        });
    }

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing Schema Intelligence Service');

        // Initialize Qdrant collection
        await this.vectorizer.initializeCollection();

        // Connect to all configured databases
        for (const dbConfig of this.config.databases) {
            if (dbConfig.type === 'postgresql') {
                const crawler = new PostgreschemaCrawler();
                const alias = this.extractDbName(dbConfig.connectionString);
                await crawler.connect(dbConfig.connectionString, alias);
                this.postgresCrawlers.set(alias, crawler);
                this.logger.info({ database: alias }, 'Connected to PostgreSQL database');
            } else if (dbConfig.type === 'mongodb') {
                const crawler = new MongoDBSchemaCrawler();
                const alias = this.extractDbName(dbConfig.connectionString);
                await crawler.connect(dbConfig.connectionString, alias);
                this.mongoCrawlers.set(alias, crawler);
                this.logger.info({ database: alias }, 'Connected to MongoDB database');
            } else if (dbConfig.type === 'redis') {
                const crawler = new RedisPatternCrawler();
                const alias = dbConfig.connectionString.includes('//')
                    ? new URL(dbConfig.connectionString).hostname
                    : 'redis';
                await crawler.connect(dbConfig.connectionString, alias);
                this.redisCrawlers.set(alias, crawler);
                this.logger.info({ database: alias }, 'Connected to Redis instance');
            } else if (dbConfig.type === 'influxdb') {
                const crawler = new InfluxDBBucketCrawler();
                const alias = dbConfig.connectionString.includes('//')
                    ? new URL(dbConfig.connectionString.split('?')[0]).hostname
                    : 'influxdb';
                await crawler.connect(dbConfig.connectionString, alias);
                this.influxCrawlers.set(alias, crawler);
                this.logger.info({ database: alias }, 'Connected to InfluxDB instance');
            }
        }

        // Run initial scan
        await this.scanAllDatabases();

        // Start periodic scanning if configured
        if (this.config.scanInterval && this.config.scanInterval > 0) {
            this.startPeriodicScanning();
        }

        this.logger.info('Schema Intelligence Service initialized');
    }

    /**
     * Scan all configured databases
     */
    async scanAllDatabases(): Promise<void> {
        this.logger.info('Starting full database scan');

        const allMetadata: SchemaMetadata[] = [];

        // Scan PostgreSQL databases
        for (const [alias, crawler] of Array.from(this.postgresCrawlers)) {
            try {
                const metadata = await crawler.crawlDatabase(alias);
                allMetadata.push(...metadata);
            } catch (error) {
                this.logger.error(
                    { error, database: alias },
                    'Failed to crawl PostgreSQL database'
                );
            }
        }

        // Scan MongoDB databases
        for (const [alias, crawler] of Array.from(this.mongoCrawlers)) {
            try {
                const metadata = await crawler.crawlDatabase(alias);
                allMetadata.push(...metadata);
            } catch (error) {
                this.logger.error(
                    { error, database: alias },
                    'Failed to crawl MongoDB database'
                );
            }
        }

        // Scan Redis instances
        for (const [alias, crawler] of Array.from(this.redisCrawlers)) {
            try {
                const metadata = await crawler.crawlRedis(alias);
                allMetadata.push(...metadata);
            } catch (error) {
                this.logger.error(
                    { error, database: alias },
                    'Failed to crawl Redis instance'
                );
            }
        }

        // Scan InfluxDB instances
        for (const [alias, crawler] of Array.from(this.influxCrawlers)) {
            try {
                const metadata = await crawler.crawlInfluxDB(alias);
                allMetadata.push(...metadata);
            } catch (error) {
                this.logger.error(
                    { error, database: alias },
                    'Failed to crawl InfluxDB instance'
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

        this.logger.info(
            { schemaCount: allMetadata.length },
            'Database scan complete'
        );
    }

    /**
     * Detect changes by comparing checksums
     */
    private detectChanges(currentMetadata: SchemaMetadata[]): SchemaChangeEvent[] {
        const changes: SchemaChangeEvent[] = [];
        const currentIds = new Set(currentMetadata.map(m => m.id));

        // Check for new or modified schemas
        for (const metadata of currentMetadata) {
            const previousChecksum = this.schemaSnapshots.get(metadata.id);

            if (!previousChecksum) {
                // New schema
                changes.push({
                    type: 'CREATE',
                    database: metadata.database,
                    objectType: 'TABLE',
                    objectName: metadata.objectName,
                    timestamp: new Date(),
                    details: { metadata },
                });
            } else if (previousChecksum !== metadata.checksum) {
                // Modified schema
                changes.push({
                    type: 'ALTER',
                    database: metadata.database,
                    objectType: 'TABLE',
                    objectName: metadata.objectName,
                    timestamp: new Date(),
                    details: { metadata, previousChecksum, newChecksum: metadata.checksum },
                });
            }
        }

        // Check for deleted schemas
        for (const [id, checksum] of Array.from(this.schemaSnapshots)) {
            if (!currentIds.has(id)) {
                const [database, schema, table] = id.split('.');
                changes.push({
                    type: 'DROP',
                    database,
                    objectType: 'TABLE',
                    objectName: table,
                    timestamp: new Date(),
                    details: { id, previousChecksum: checksum },
                });
            }
        }

        return changes;
    }

    /**
     * Start periodic scanning
     */
    private startPeriodicScanning(): void {
        if (!this.config.scanInterval) return;

        const intervalMs = this.config.scanInterval * 60 * 1000;

        this.scanInterval = setInterval(async () => {
            this.logger.info('Starting periodic schema scan');
            try {
                await this.scanAllDatabases();
            } catch (error) {
                this.logger.error({ error }, 'Periodic scan failed');
            }
        }, intervalMs);

        this.logger.info(
            { intervalMinutes: this.config.scanInterval },
            'Started periodic scanning'
        );
    }

    /**
     * Stop periodic scanning
     */
    stopPeriodicScanning(): void {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = undefined;
            this.logger.info('Stopped periodic scanning');
        }
    }

    /**
     * Search schemas semantically
     */
    async searchSchemas(
        query: string,
        limit: number = 5
    ): Promise<Array<{
        id: string;
        score: number;
        database: string;
        table: string;
        description: string;
        schema: any;
    }>> {
        const results = await this.vectorizer.searchSchemas(query, limit);

        return results.map(result => ({
            id: result.id,
            score: result.score,
            database: result.metadata.database,
            table: result.metadata.fullName,
            description: result.metadata.description,
            schema: result.metadata.schema,
        }));
    }

    /**
     * Get schema by exact name
     */
    async getSchema(database: string, schema: string, table: string): Promise<any | null> {
        const id = `${database}.${schema}.${table}`;
        return this.vectorizer.getSchemaById(id);
    }

    /**
     * Get all schemas for a database
     */
    async getDatabaseSchemas(database: string): Promise<any[]> {
        return this.vectorizer.getDatabaseSchemas(database);
    }

    /**
     * Get service statistics
     */
    async getStats(): Promise<{
        totalSchemas: number;
        databases: Record<string, number>;
        lastScan?: Date;
    }> {
        const stats = await this.vectorizer.getStats();

        return {
            ...stats,
            lastScan: this.schemaSnapshots.size > 0 ? new Date() : undefined,
        };
    }

    /**
     * Extract database name from connection string
     */
    private extractDbName(connectionString: string): string {
        // Extract from postgres://user:pass@host:port/dbname
        const match = connectionString.match(/\/([^/?]+)(?:\?|$)/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Shutdown the service
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down Schema Intelligence Service');

        this.stopPeriodicScanning();

        // Close all crawler connections
        for (const [alias, crawler] of Array.from(this.postgresCrawlers)) {
            await crawler.close();
        }
        for (const [alias, crawler] of Array.from(this.mongoCrawlers)) {
            await crawler.close();
        }
        for (const [alias, crawler] of Array.from(this.redisCrawlers)) {
            await crawler.close();
        }
        for (const [alias, crawler] of Array.from(this.influxCrawlers)) {
            await crawler.close();
        }

        this.logger.info('Schema Intelligence Service shut down');
    }
}
