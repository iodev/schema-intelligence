#!/usr/bin/env node
/**
 * Redis Pattern Analysis Example
 *
 * Demonstrates Redis key pattern extraction and analysis
 */

import { RedisPatternCrawler } from '@caelum/schema-intelligence';

async function main() {
    console.log('🔑 Schema Intelligence - Redis Pattern Analysis\n');

    const crawler = new RedisPatternCrawler();

    try {
        // Connect to Redis
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        console.log(`📡 Connecting to Redis: ${redisUrl}`);
        await crawler.connect(redisUrl, 'redis_analysis');
        console.log('✅ Connected\n');

        // Extract patterns (scan up to 5000 keys)
        console.log('🔍 Scanning keys and extracting patterns...');
        const patternSchema = await crawler.extractPatterns('redis_analysis', 5000);

        console.log(`\n📊 Results:`);
        console.log(`   Total keys scanned: ${patternSchema.totalKeys}`);
        console.log(`   Unique patterns found: ${patternSchema.patterns.length}\n`);

        // Display top patterns
        console.log('🏆 Top Patterns:');
        for (const pattern of patternSchema.patterns.slice(0, 10)) {
            console.log(`\n   Pattern: ${pattern.pattern}`);
            console.log(`   Type: ${pattern.type}`);
            console.log(`   Count: ${pattern.count} keys`);
            if (pattern.ttl) {
                console.log(`   TTL: ${pattern.ttl} seconds`);
            }
            console.log(`   Example keys: ${pattern.exampleKeys.slice(0, 2).join(', ')}`);
            if (pattern.sampleValue) {
                console.log(`   Sample value: ${JSON.stringify(pattern.sampleValue).substring(0, 80)}...`);
            }
        }

        // Close connection
        await crawler.close();
        console.log('\n✅ Analysis complete');
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        await crawler.close();
        process.exit(1);
    }
}

main();
