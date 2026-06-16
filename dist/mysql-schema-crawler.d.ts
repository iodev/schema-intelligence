/**
 * MySQL Schema Crawler
 *
 * Extracts comprehensive schema information from MySQL databases
 */
import { TableSchema, SchemaMetadata } from './types.js';
export declare class MySQLSchemaCrawler {
    private logger;
    private connections;
    constructor();
    /**
     * Connect to a MySQL database
     */
    connect(connectionString: string, alias: string): Promise<void>;
    /**
     * Get all schemas (databases) visible to the connected user, excluding system schemas
     */
    getSchemas(dbAlias: string): Promise<string[]>;
    /**
     * Get all tables in a database/schema
     */
    getTables(dbAlias: string, database: string): Promise<string[]>;
    /**
     * Extract complete schema for a table
     */
    extractTableSchema(dbAlias: string, database: string, tableName: string): Promise<TableSchema>;
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
     * Get table statistics (row count and size)
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
//# sourceMappingURL=mysql-schema-crawler.d.ts.map