/**
 * PostgreSQL Schema Crawler
 *
 * Extracts comprehensive schema information from PostgreSQL databases
 */
import { TableSchema, SchemaMetadata } from './types.js';
export declare class PostgreschemaCrawler {
    private logger;
    private pools;
    constructor();
    /**
     * Connect to a PostgreSQL database
     */
    connect(connectionString: string, alias: string): Promise<void>;
    /**
     * Get all schemas in the database (exclude system schemas)
     */
    getSchemas(dbAlias: string): Promise<string[]>;
    /**
     * Get all tables in a schema
     */
    getTables(dbAlias: string, schema: string): Promise<string[]>;
    /**
     * Extract complete schema for a table
     */
    extractTableSchema(dbAlias: string, schema: string, tableName: string): Promise<TableSchema>;
    /**
     * Get columns for a table
     */
    private getColumns;
    /**
     * Get indexes for a table
     */
    private getIndexes;
    /**
     * Get constraints for a table
     */
    private getConstraints;
    /**
     * Get table statistics
     */
    private getTableStats;
    /**
     * Get table comment
     */
    private getTableComment;
    /**
     * Crawl entire database and return all schemas
     */
    crawlDatabase(dbAlias: string): Promise<SchemaMetadata[]>;
    /**
     * Generate human-readable description for vectorization
     */
    private generateDescription;
    /**
     * Generate checksum for change detection
     */
    private generateChecksum;
    /**
     * Close all connections
     */
    close(): Promise<void>;
}
//# sourceMappingURL=postgres-schema-crawler.d.ts.map