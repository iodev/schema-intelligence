/**
 * Schema Intelligence Service
 *
 * Main orchestrator for database schema crawling, vectorization, and change detection
 */
import { SchemaCrawlerConfig, SchemaDiff, ChangeHistoryEntry } from './types.js';
import { SchemaRelationshipGraph } from './schema-relationship-graph.js';
export declare class SchemaIntelligenceService {
    private logger;
    private config;
    private postgresCrawlers;
    private mysqlCrawlers;
    private mongoCrawlers;
    private redisCrawlers;
    private influxCrawlers;
    private vectorizer;
    private llmDescriptionGenerator?;
    private scanInterval?;
    private schemaSnapshots;
    private latestMetadata;
    private changeTracker?;
    private changeTrackingCallback?;
    constructor(config: SchemaCrawlerConfig);
    /**
     * Initialize the service
     */
    initialize(): Promise<void>;
    /**
     * Scan all configured databases
     */
    scanAllDatabases(): Promise<void>;
    /**
     * Detect changes by comparing checksums
     */
    private detectChanges;
    /**
     * Start periodic scanning
     */
    private startPeriodicScanning;
    /**
     * Stop periodic scanning
     */
    stopPeriodicScanning(): void;
    /**
     * Search schemas semantically
     */
    searchSchemas(query: string, limit?: number, database?: string): Promise<Array<{
        id: string;
        score: number;
        database: string;
        table: string;
        description: string;
        schema: unknown;
    }>>;
    /**
     * Get schema by exact name
     */
    getSchema(database: string, schema: string, table: string): Promise<Record<string, unknown> | null>;
    /**
     * Get all schemas for a database
     */
    getDatabaseSchemas(database: string): Promise<Record<string, unknown>[]>;
    /**
     * Build and return a relationship graph from all currently stored metadata
     */
    getRelationshipGraph(): SchemaRelationshipGraph;
    /**
     * Register a callback invoked whenever schema changes are detected
     */
    onSchemaChange(callback: (diffs: SchemaDiff[]) => void): void;
    /**
     * Get change history for a specific schema object
     */
    getChangeHistory(schemaId: string, limit?: number): Promise<ChangeHistoryEntry[]>;
    /**
     * Get recent schema changes across all databases
     */
    getRecentChanges(since?: Date, limit?: number): Promise<ChangeHistoryEntry[]>;
    /**
     * Get diff between two specific snapshots
     */
    getChangeDiff(snapshotId1: string, snapshotId2: string): Promise<SchemaDiff>;
    /**
     * Get service statistics
     */
    getStats(): Promise<{
        totalSchemas: number;
        databases: Record<string, number>;
        lastScan?: Date;
    }>;
    /**
     * Extract database name from connection string
     */
    private extractDbName;
    /**
     * Shutdown the service
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=schema-intelligence-service.d.ts.map