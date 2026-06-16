/**
 * InfluxDB Bucket Crawler
 *
 * Extracts bucket metadata, measurements, tags, and fields from InfluxDB
 */
import { SchemaMetadata, InfluxMeasurement, InfluxBucketSchema } from './types.js';
export type { InfluxMeasurement, InfluxBucketSchema };
export declare class InfluxDBBucketCrawler {
    private logger;
    private clients;
    private config;
    constructor();
    /**
     * Connect to an InfluxDB instance
     * connectionString format: "http://host:port?token=xxx&org=xxx"
     */
    connect(connectionString: string, alias: string): Promise<void>;
    /**
     * Get all buckets for the organization
     */
    getBuckets(dbAlias: string): Promise<Array<{
        id: string;
        name: string;
        retentionRules: any[];
    }>>;
    /**
     * Extract measurements from a bucket
     */
    extractBucketSchema(dbAlias: string, bucketName: string): Promise<InfluxBucketSchema>;
    /**
     * Get tags for a measurement
     */
    private getTags;
    /**
     * Get fields for a measurement
     */
    private getFields;
    /**
     * Crawl InfluxDB instance and return all bucket metadata
     */
    crawlInfluxDB(dbAlias: string): Promise<SchemaMetadata[]>;
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
//# sourceMappingURL=influxdb-bucket-crawler.d.ts.map