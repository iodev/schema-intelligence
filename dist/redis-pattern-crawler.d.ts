/**
 * Redis Pattern Crawler
 *
 * Documents Redis key patterns and data structures
 */
import { SchemaMetadata, RedisKeyPattern, RedisPatternSchema } from './types.js';
export type { RedisKeyPattern, RedisPatternSchema };
export declare class RedisPatternCrawler {
    private logger;
    private clients;
    constructor();
    /**
     * Connect to a Redis instance
     */
    connect(connectionString: string, alias: string): Promise<void>;
    /**
     * Scan Redis keys and identify patterns
     */
    extractPatterns(dbAlias: string, maxScan?: number): Promise<RedisPatternSchema>;
    /**
     * Extract pattern from key
     * Examples:
     *   "cache:user:123" -> "cache:user:*"
     *   "session:abc123" -> "session:*"
     *   "queue:emails:pending" -> "queue:emails:pending"
     */
    private extractPattern;
    /**
     * Get sample value for a key based on its type
     */
    private getSampleValue;
    /**
     * Crawl Redis instance and return metadata
     */
    crawlRedis(dbAlias: string): Promise<SchemaMetadata[]>;
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
//# sourceMappingURL=redis-pattern-crawler.d.ts.map