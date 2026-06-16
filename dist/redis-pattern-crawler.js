/**
 * Redis Pattern Crawler
 *
 * Documents Redis key patterns and data structures
 */
import { createClient } from 'redis';
import { createHash } from 'crypto';
import pino from 'pino';
export class RedisPatternCrawler {
    logger;
    clients = new Map();
    constructor() {
        this.logger = pino({ name: 'redis-pattern-crawler' });
    }
    /**
     * Connect to a Redis instance
     */
    async connect(connectionString, alias) {
        const client = createClient({ url: connectionString });
        await client.connect();
        this.clients.set(alias, client);
        this.logger.info({ alias }, 'Connected to Redis instance');
    }
    /**
     * Scan Redis keys and identify patterns
     */
    async extractPatterns(dbAlias, maxScan = 1000) {
        const client = this.clients.get(dbAlias);
        if (!client)
            throw new Error(`Redis ${dbAlias} not connected`);
        const patterns = new Map();
        let totalKeys = 0;
        let cursor = 0;
        // Scan keys using SCAN command (non-blocking)
        do {
            const result = await client.scan(cursor);
            cursor = typeof result.cursor === 'string' ? parseInt(result.cursor) : result.cursor;
            const keys = result.keys;
            for (const key of keys) {
                totalKeys++;
                if (totalKeys > maxScan)
                    break;
                // Extract pattern from key
                const pattern = this.extractPattern(key);
                if (!patterns.has(pattern)) {
                    patterns.set(pattern, {
                        pattern,
                        type: 'unknown',
                        exampleKeys: [],
                        count: 0,
                    });
                }
                const patternData = patterns.get(pattern);
                patternData.count++;
                // Sample first few keys
                if (patternData.exampleKeys.length < 3) {
                    patternData.exampleKeys.push(key);
                    // Get type and sample value for first key
                    if (patternData.exampleKeys.length === 1) {
                        try {
                            const type = await client.type(key);
                            patternData.type = type;
                            // Get TTL
                            const ttl = await client.ttl(key);
                            if (ttl > 0) {
                                patternData.ttl = ttl;
                            }
                            // Get sample value based on type
                            patternData.sampleValue = await this.getSampleValue(client, key, type);
                        }
                        catch (error) {
                            this.logger.error({ error, key }, 'Failed to analyze key');
                        }
                    }
                }
            }
            if (totalKeys > maxScan)
                break;
        } while (cursor !== 0);
        return {
            database: dbAlias,
            patterns: Array.from(patterns.values()).sort((a, b) => b.count - a.count),
            totalKeys,
            lastScanned: new Date(),
        };
    }
    /**
     * Extract pattern from key
     * Examples:
     *   "cache:user:123" -> "cache:user:*"
     *   "session:abc123" -> "session:*"
     *   "queue:emails:pending" -> "queue:emails:pending"
     */
    extractPattern(key) {
        const parts = key.split(':');
        // Replace numeric or UUID-like parts with wildcards
        const patternParts = parts.map(part => {
            // Check if part is numeric
            if (/^\d+$/.test(part))
                return '*';
            // Check if part is UUID-like
            if (/^[a-f0-9]{8,}$/i.test(part))
                return '*';
            // Check if part is random string (all lowercase/uppercase alphanumeric)
            if (part.length > 10 && /^[a-zA-Z0-9]+$/.test(part))
                return '*';
            return part;
        });
        return patternParts.join(':');
    }
    /**
     * Get sample value for a key based on its type
     */
    async getSampleValue(client, key, type) {
        try {
            switch (type) {
                case 'string': {
                    const strValue = await client.get(key);
                    if (!strValue)
                        return null;
                    const strVal = String(strValue);
                    // Try to parse as JSON
                    try {
                        return JSON.parse(strVal);
                    }
                    catch {
                        return strVal.substring(0, 100);
                    }
                }
                case 'hash': {
                    const hashValue = await client.hGetAll(key);
                    // Return first few fields
                    const hashKeys = Object.keys(hashValue).slice(0, 5);
                    const sample = {};
                    for (const k of hashKeys) {
                        sample[k] = hashValue[k];
                    }
                    return sample;
                }
                case 'list': {
                    const listValue = await client.lRange(key, 0, 2);
                    return listValue;
                }
                case 'set': {
                    const setValue = await client.sMembers(key);
                    return Array.from(setValue).slice(0, 5);
                }
                case 'zset': {
                    const zsetValue = await client.zRangeWithScores(key, 0, 2);
                    return zsetValue;
                }
                default:
                    return null;
            }
        }
        catch (error) {
            this.logger.error({ error, key, type }, 'Failed to get sample value');
            return null;
        }
    }
    /**
     * Crawl Redis instance and return metadata
     */
    async crawlRedis(dbAlias) {
        this.logger.info({ dbAlias }, 'Starting Redis pattern crawl');
        try {
            const patternSchema = await this.extractPatterns(dbAlias);
            // Generate human-readable description
            const description = this.generateDescription(patternSchema);
            // Generate checksum for change detection
            const checksum = this.generateChecksum(patternSchema);
            const metadata = {
                id: `${dbAlias}.redis_patterns`,
                type: 'redis',
                database: dbAlias,
                objectName: 'redis_patterns',
                fullName: 'redis_patterns',
                description,
                schema: patternSchema,
                lastScanned: new Date(),
                checksum,
            };
            this.logger.info({
                dbAlias,
                patternCount: patternSchema.patterns.length,
                totalKeys: patternSchema.totalKeys,
            }, 'Redis pattern crawl complete');
            return [metadata];
        }
        catch (error) {
            this.logger.error({
                dbAlias,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to crawl Redis');
            return [];
        }
    }
    /**
     * Generate human-readable description for vectorization
     */
    generateDescription(schema) {
        const parts = [];
        parts.push(`Redis instance ${schema.database} with ${schema.totalKeys} keys`);
        if (schema.patterns.length > 0) {
            const patternDescriptions = schema.patterns
                .slice(0, 10)
                .map(p => {
                let desc = `${p.pattern} (${p.type}, ${p.count} keys)`;
                if (p.ttl) {
                    desc += `, TTL: ${p.ttl}s`;
                }
                return desc;
            });
            parts.push('Key patterns: ' + patternDescriptions.join(', '));
        }
        return parts.join('. ');
    }
    /**
     * Generate checksum for change detection
     */
    generateChecksum(schema) {
        const data = JSON.stringify({
            patterns: schema.patterns.map(p => ({
                pattern: p.pattern,
                type: p.type,
                count: p.count,
            })),
            totalKeys: schema.totalKeys,
        });
        return createHash('sha256').update(data).digest('hex');
    }
    /**
     * Close all connections
     */
    async close() {
        for (const [alias, client] of Array.from(this.clients)) {
            await client.quit();
            this.logger.info({ alias }, 'Closed Redis connection');
        }
        this.clients.clear();
    }
}
//# sourceMappingURL=redis-pattern-crawler.js.map