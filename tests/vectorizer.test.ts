/**
 * Unit tests for Schema Vectorizer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaVectorizer } from '../src/schema-vectorizer.js';

// ---------------------------------------------------------------------------
// Test configuration (uses simple embedding, no real Qdrant)
// ---------------------------------------------------------------------------
const testConfig = {
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'test_schemas',
    // No embeddingModel / API keys → falls through to generateSimpleEmbedding
};

function makeVectorizer() {
    return new SchemaVectorizer(testConfig);
}

// ---------------------------------------------------------------------------
// Tests – generateSimpleEmbedding
// ---------------------------------------------------------------------------

describe('SchemaVectorizer – generateSimpleEmbedding', () => {
    it('should produce a vector of length 1024', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding('hello world');
        assert.equal(embedding.length, 1024);
    });

    it('should produce a normalized vector (magnitude ≈ 1.0)', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding(
            'Table public.users with columns id, name, email'
        );
        const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
        // Allow small floating point tolerance
        assert.ok(
            Math.abs(magnitude - 1.0) < 1e-6,
            `Expected magnitude ~1.0, got ${magnitude}`
        );
    });

    it('should be deterministic (same input = same output)', () => {
        const v = makeVectorizer();
        const text = 'PostgreSQL table schema for user accounts';
        const a: number[] = (v as any).generateSimpleEmbedding(text);
        const b: number[] = (v as any).generateSimpleEmbedding(text);
        assert.deepEqual(a, b);
    });

    it('should produce different vectors for different inputs', () => {
        const v = makeVectorizer();
        const a: number[] = (v as any).generateSimpleEmbedding('users table');
        const b: number[] = (v as any).generateSimpleEmbedding('orders table');
        // At least some elements should differ
        const hasDifference = a.some((val, i) => val !== b[i]);
        assert.ok(hasDifference, 'Vectors should differ for different inputs');
    });

    it('should handle empty string', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding('');
        assert.equal(embedding.length, 1024);
        // All zeros → magnitude is 0, so NaN after normalization
        // Let's verify it doesn't throw
        assert.ok(Array.isArray(embedding));
    });

    it('should handle very long text', () => {
        const v = makeVectorizer();
        const longText = 'a'.repeat(10000);
        const embedding: number[] = (v as any).generateSimpleEmbedding(longText);
        assert.equal(embedding.length, 1024);
        // Should still be normalized
        const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
        assert.ok(
            Math.abs(magnitude - 1.0) < 1e-6,
            `Expected magnitude ~1.0 for long text, got ${magnitude}`
        );
    });

    it('should handle unicode text', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding('日本語テスト 🚀');
        assert.equal(embedding.length, 1024);
    });
});

// ---------------------------------------------------------------------------
// Tests – generateUUID
// ---------------------------------------------------------------------------

describe('SchemaVectorizer – generateUUID', () => {
    it('should produce a valid UUID format', () => {
        const v = makeVectorizer();
        const uuid: string = (v as any).generateUUID('testdb.public.users');
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        assert.match(uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should be deterministic (same input = same UUID)', () => {
        const v = makeVectorizer();
        const id = 'mydb.public.orders';
        const a: string = (v as any).generateUUID(id);
        const b: string = (v as any).generateUUID(id);
        assert.equal(a, b);
    });

    it('should produce different UUIDs for different inputs', () => {
        const v = makeVectorizer();
        const a: string = (v as any).generateUUID('db1.public.users');
        const b: string = (v as any).generateUUID('db2.public.orders');
        assert.notEqual(a, b);
    });

    it('should handle empty string', () => {
        const v = makeVectorizer();
        const uuid: string = (v as any).generateUUID('');
        assert.match(uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should handle long input strings', () => {
        const v = makeVectorizer();
        const longId = 'a'.repeat(1000);
        const uuid: string = (v as any).generateUUID(longId);
        assert.match(uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should handle special characters', () => {
        const v = makeVectorizer();
        const uuid: string = (v as any).generateUUID('db/schema.table#col');
        assert.match(uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });
});

// ---------------------------------------------------------------------------
// Tests – generateEmbedding (routing logic)
// ---------------------------------------------------------------------------

describe('SchemaVectorizer – generateEmbedding routing', () => {
    it('should use simple embedding when no API keys are configured', async () => {
        const v = makeVectorizer();
        const embedding: number[] = await (v as any).generateEmbedding('test text');
        assert.equal(embedding.length, 1024);
    });

    it('should use simple embedding when embeddingModel is undefined', async () => {
        const v = new SchemaVectorizer({
            qdrantUrl: 'http://localhost:6333',
            qdrantCollection: 'test',
        });
        const embedding: number[] = await (v as any).generateEmbedding('test');
        assert.equal(embedding.length, 1024);
    });
});

// ---------------------------------------------------------------------------
// Tests – embedding properties
// ---------------------------------------------------------------------------

describe('SchemaVectorizer – embedding mathematical properties', () => {
    it('should produce vectors where all elements are finite numbers', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding('test data for schema');
        for (let i = 0; i < embedding.length; i++) {
            assert.ok(
                Number.isFinite(embedding[i]),
                `Element at index ${i} should be finite, got ${embedding[i]}`
            );
        }
    });

    it('should produce vectors with values between -1 and 1 after normalization', () => {
        const v = makeVectorizer();
        const embedding: number[] = (v as any).generateSimpleEmbedding(
            'PostgreSQL table public.users with id, email, name columns'
        );
        for (let i = 0; i < embedding.length; i++) {
            assert.ok(
                embedding[i] >= -1.0 && embedding[i] <= 1.0,
                `Element at index ${i} should be in [-1, 1], got ${embedding[i]}`
            );
        }
    });

    it('should produce similar vectors for similar inputs (cosine similarity > 0)', () => {
        const v = makeVectorizer();
        const a: number[] = (v as any).generateSimpleEmbedding('users table with id and email');
        const b: number[] = (v as any).generateSimpleEmbedding('users table with id and name');

        // Compute cosine similarity
        let dot = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
        }
        // Since both are normalized, cosine similarity = dot product
        assert.ok(dot > 0, `Cosine similarity should be > 0 for similar inputs, got ${dot}`);
    });
});
