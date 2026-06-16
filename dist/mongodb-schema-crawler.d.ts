/**
 * MongoDB Schema Crawler
 *
 * Extracts collection schemas by analyzing document structure
 */
import { MongoCollectionSchema, SchemaMetadata } from './types.js';
export declare class MongoDBSchemaCrawler {
    private logger;
    private clients;
    private databases;
    constructor();
    /**
     * Connect to a MongoDB database
     */
    connect(connectionString: string, alias: string): Promise<void>;
    /**
     * Get all collections in the database
     */
    getCollections(dbAlias: string): Promise<string[]>;
    /**
     * Extract collection schema by sampling documents
     */
    extractCollectionSchema(dbAlias: string, collectionName: string, sampleSize?: number): Promise<MongoCollectionSchema>;
    /**
     * Analyze document structure to infer schema
     */
    private analyzeDocumentStructure;
    /**
     * Recursively analyze document fields
     */
    private analyzeDocument;
    /**
     * Determine MongoDB BSON type
     */
    private getMongoType;
    /**
     * Get most common value from examples
     */
    private getMostCommonValue;
    /**
     * Crawl entire database and return all collection schemas
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
     * Extract database name from connection string
     */
    private extractDbName;
    /**
     * Close all connections
     */
    close(): Promise<void>;
}
//# sourceMappingURL=mongodb-schema-crawler.d.ts.map