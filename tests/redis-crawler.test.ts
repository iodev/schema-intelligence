/**
 * Unit tests for Redis Pattern Crawler
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RedisPatternCrawler } from '../src/redis-pattern-crawler.js';

// ---------------------------------------------------------------------------
// Access private methods via (instance as any)
// ---------------------------------------------------------------------------
let crawler: RedisPatternCrawler;

function freshCrawler(): RedisPatternCrawler {
    return new RedisPatternCrawler();
}

// ---------------------------------------------------------------------------
// Tests – extractPattern (core logic)
// ---------------------------------------------------------------------------

describe('RedisPatternCrawler – extractPattern', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    // Numeric ID replacement
    it('should replace trailing numeric ID with wildcard', () => {
        assert.equal((crawler as any).extractPattern('cache:user:123'), 'cache:user:*');
    });

    it('should replace multiple numeric segments', () => {
        assert.equal((crawler as any).extractPattern('order:42:item:7'), 'order:*:item:*');
    });

    it('should replace zero as numeric', () => {
        assert.equal((crawler as any).extractPattern('queue:0'), 'queue:*');
    });

    // UUID-like replacement
    it('should replace UUID-like hex strings (>= 8 chars)', () => {
        assert.equal(
            (crawler as any).extractPattern('session:abc123def456'),
            'session:*'
        );
    });

    it('should replace full UUID segments', () => {
        assert.equal(
            (crawler as any).extractPattern('token:550e8400e29b41d4a716446655440000'),
            'token:*'
        );
    });

    it('should replace 8-char hex segments', () => {
        assert.equal(
            (crawler as any).extractPattern('lock:abcdef12'),
            'lock:*'
        );
    });

    // Long random alphanumeric replacement
    it('should replace long random strings (> 10 chars alphanumeric)', () => {
        assert.equal(
            (crawler as any).extractPattern('session:aBcDeFgHiJkL'),
            'session:*'
        );
    });

    // Preserved patterns (no dynamic segments)
    it('should preserve static key with no dynamic parts', () => {
        assert.equal(
            (crawler as any).extractPattern('queue:emails:pending'),
            'queue:emails:pending'
        );
    });

    it('should preserve single-segment keys', () => {
        assert.equal(
            (crawler as any).extractPattern('settings'),
            'settings'
        );
    });

    it('should preserve short non-numeric, non-hex segments', () => {
        assert.equal(
            (crawler as any).extractPattern('cache:users:active'),
            'cache:users:active'
        );
    });

    // Edge cases
    it('should handle key with only numeric parts', () => {
        assert.equal(
            (crawler as any).extractPattern('123:456:789'),
            '*:*:*'
        );
    });

    it('should handle empty string', () => {
        assert.equal(
            (crawler as any).extractPattern(''),
            ''
        );
    });

    it('should handle key with many colons', () => {
        assert.equal(
            (crawler as any).extractPattern('a:b:c:d:e:f'),
            'a:b:c:d:e:f'
        );
    });

    it('should handle mixed dynamic and static segments', () => {
        assert.equal(
            (crawler as any).extractPattern('api:v2:user:99:profile'),
            'api:v2:user:*:profile'
        );
    });

    it('should handle short hex that is below 8 chars (not replaced)', () => {
        // "abc12" is only 5 chars, all hex, but < 8 chars so kept as-is
        assert.equal(
            (crawler as any).extractPattern('cache:abc12'),
            'cache:abc12'
        );
    });
});

// ---------------------------------------------------------------------------
// Tests – generateDescription
// ---------------------------------------------------------------------------

describe('RedisPatternCrawler – generateDescription', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should include database alias and total key count', () => {
        const schema = {
            database: 'redis-prod',
            patterns: [],
            totalKeys: 500,
            lastScanned: new Date(),
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('redis-prod'));
        assert.ok(desc.includes('500'));
    });

    it('should include pattern descriptions', () => {
        const schema = {
            database: 'redis-prod',
            patterns: [
                { pattern: 'cache:user:*', type: 'string', count: 100, exampleKeys: [], ttl: 3600 },
                { pattern: 'session:*', type: 'hash', count: 50, exampleKeys: [] },
            ],
            totalKeys: 150,
            lastScanned: new Date(),
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('cache:user:* (string, 100 keys)'));
        assert.ok(desc.includes('TTL: 3600s'));
        assert.ok(desc.includes('session:* (hash, 50 keys)'));
    });

    it('should limit to 10 patterns in description', () => {
        const patterns = Array.from({ length: 15 }, (_, i) => ({
            pattern: `pattern:${i}:*`,
            type: 'string',
            count: 10,
            exampleKeys: [],
        }));
        const schema = {
            database: 'redis-prod',
            patterns,
            totalKeys: 150,
            lastScanned: new Date(),
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('pattern:9:*'));
        assert.ok(!desc.includes('pattern:10:*'));
    });

    it('should handle empty patterns', () => {
        const schema = {
            database: 'redis-empty',
            patterns: [],
            totalKeys: 0,
            lastScanned: new Date(),
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('redis-empty'));
        assert.ok(desc.includes('0'));
        assert.ok(!desc.includes('Key patterns:'));
    });
});

// ---------------------------------------------------------------------------
// Tests – generateChecksum
// ---------------------------------------------------------------------------

describe('RedisPatternCrawler – generateChecksum', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should produce a valid SHA-256 hex string', () => {
        const schema = {
            database: 'redis',
            patterns: [
                { pattern: 'cache:*', type: 'string', count: 10, exampleKeys: [] },
            ],
            totalKeys: 10,
            lastScanned: new Date(),
        };
        const checksum: string = (crawler as any).generateChecksum(schema);
        assert.match(checksum, /^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
        const schema = {
            database: 'redis',
            patterns: [
                { pattern: 'cache:*', type: 'string', count: 10, exampleKeys: [] },
            ],
            totalKeys: 10,
            lastScanned: new Date(),
        };
        assert.equal(
            (crawler as any).generateChecksum(schema),
            (crawler as any).generateChecksum(schema)
        );
    });

    it('should change when patterns change', () => {
        const schema1 = {
            database: 'redis',
            patterns: [{ pattern: 'cache:*', type: 'string', count: 10, exampleKeys: [] }],
            totalKeys: 10,
            lastScanned: new Date(),
        };
        const schema2 = {
            database: 'redis',
            patterns: [{ pattern: 'session:*', type: 'hash', count: 5, exampleKeys: [] }],
            totalKeys: 5,
            lastScanned: new Date(),
        };
        assert.notEqual(
            (crawler as any).generateChecksum(schema1),
            (crawler as any).generateChecksum(schema2)
        );
    });

    it('should include totalKeys in checksum data', () => {
        const base = {
            database: 'redis',
            patterns: [{ pattern: 'cache:*', type: 'string', count: 10, exampleKeys: [] }],
            totalKeys: 10,
            lastScanned: new Date(),
        };
        const modified = { ...base, totalKeys: 999 };
        assert.notEqual(
            (crawler as any).generateChecksum(base),
            (crawler as any).generateChecksum(modified)
        );
    });
});

// ---------------------------------------------------------------------------
// Tests – crawlRedis with mock client
// ---------------------------------------------------------------------------

describe('RedisPatternCrawler – crawlRedis (mocked)', () => {
    it('should return metadata from mocked Redis scan', async () => {
        const crawlerLocal = freshCrawler();

        // Create a mock Redis client
        const mockClient = {
            scan: async (cursor: string) => {
                if (cursor === '0') {
                    return {
                        cursor: 0,
                        keys: ['cache:user:123', 'cache:user:456', 'session:abc123def456'],
                    };
                }
                return { cursor: 0, keys: [] };
            },
            type: async (_key: string) => 'string',
            ttl: async (_key: string) => 3600,
            get: async (_key: string) => '{"test":true}',
        };

        (crawlerLocal as any).clients.set('test-redis', mockClient);

        const results = await crawlerLocal.crawlRedis('test-redis');
        assert.equal(results.length, 1);

        const meta = results[0];
        assert.equal(meta.type, 'redis');
        assert.equal(meta.database, 'test-redis');
        assert.ok(meta.description.includes('test-redis'));
        assert.match(meta.checksum, /^[a-f0-9]{64}$/);
    });

    it('should return empty array on error', async () => {
        const crawlerLocal = freshCrawler();

        // No client registered -> extractPatterns will throw
        // But crawlRedis wraps that: the client check throws first
        // We mock a client that throws on scan
        const brokenClient = {
            scan: async () => { throw new Error('Connection refused'); },
        };
        (crawlerLocal as any).clients.set('broken', brokenClient);

        const results = await crawlerLocal.crawlRedis('broken');
        assert.equal(results.length, 0);
    });
});

// ---------------------------------------------------------------------------
// Tests – close
// ---------------------------------------------------------------------------

describe('RedisPatternCrawler – close', () => {
    it('should call quit on all clients and clear the map', async () => {
        const crawlerLocal = freshCrawler();
        let quitCount = 0;

        const mockClient = { quit: async () => { quitCount++; } };
        (crawlerLocal as any).clients.set('r1', mockClient);
        (crawlerLocal as any).clients.set('r2', { quit: async () => { quitCount++; } });

        await crawlerLocal.close();
        assert.equal(quitCount, 2);
        assert.equal((crawlerLocal as any).clients.size, 0);
    });
});
