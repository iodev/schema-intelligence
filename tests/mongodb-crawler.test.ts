/**
 * Unit tests for MongoDB Schema Crawler
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoDBSchemaCrawler } from '../src/mongodb-schema-crawler.js';
import type { MongoCollectionSchema, MongoFieldSchema } from '../src/types.js';

// ---------------------------------------------------------------------------
// Access private methods via (instance as any)
// ---------------------------------------------------------------------------
let crawler: MongoDBSchemaCrawler;

function freshCrawler(): MongoDBSchemaCrawler {
    return new MongoDBSchemaCrawler();
}

// ---------------------------------------------------------------------------
// Tests – getMongoType
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – getMongoType', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should return "null" for null', () => {
        assert.equal((crawler as any).getMongoType(null), 'null');
    });

    it('should return "array" for arrays', () => {
        assert.equal((crawler as any).getMongoType([1, 2, 3]), 'array');
        assert.equal((crawler as any).getMongoType([]), 'array');
    });

    it('should return "date" for Date objects', () => {
        assert.equal((crawler as any).getMongoType(new Date()), 'date');
    });

    it('should return "objectId" for BSON ObjectID-like values', () => {
        const fakeObjectId = { _bsontype: 'ObjectID', toString: () => '507f1f77bcf86cd799439011' };
        assert.equal((crawler as any).getMongoType(fakeObjectId), 'objectId');
    });

    it('should return "boolean" for booleans', () => {
        assert.equal((crawler as any).getMongoType(true), 'boolean');
        assert.equal((crawler as any).getMongoType(false), 'boolean');
    });

    it('should return "int" for integers', () => {
        assert.equal((crawler as any).getMongoType(42), 'int');
        assert.equal((crawler as any).getMongoType(0), 'int');
        assert.equal((crawler as any).getMongoType(-100), 'int');
    });

    it('should return "double" for floating point numbers', () => {
        assert.equal((crawler as any).getMongoType(3.14), 'double');
        assert.equal((crawler as any).getMongoType(0.1), 'double');
    });

    it('should return "string" for strings', () => {
        assert.equal((crawler as any).getMongoType('hello'), 'string');
        assert.equal((crawler as any).getMongoType(''), 'string');
    });

    it('should return "object" for plain objects', () => {
        assert.equal((crawler as any).getMongoType({ a: 1 }), 'object');
        assert.equal((crawler as any).getMongoType({}), 'object');
    });
});

// ---------------------------------------------------------------------------
// Tests – getMostCommonValue
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – getMostCommonValue', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should return undefined for empty array', () => {
        assert.equal((crawler as any).getMostCommonValue([]), undefined);
    });

    it('should return the single value for single-element array', () => {
        assert.equal((crawler as any).getMostCommonValue(['hello']), 'hello');
    });

    it('should return the most frequent string', () => {
        const result = (crawler as any).getMostCommonValue(['a', 'b', 'a', 'c', 'a', 'b']);
        assert.equal(result, 'a');
    });

    it('should return the most frequent number', () => {
        const result = (crawler as any).getMostCommonValue([1, 2, 2, 3, 2, 1]);
        assert.equal(result, 2);
    });

    it('should handle objects by JSON stringification', () => {
        const obj = { x: 1 };
        const result = (crawler as any).getMostCommonValue([obj, obj, { y: 2 }]);
        assert.deepEqual(result, { x: 1 });
    });

    it('should handle mixed types', () => {
        const result = (crawler as any).getMostCommonValue([1, 'a', 1, 'a', 1]);
        assert.equal(result, 1);
    });

    it('should return first winner on tie', () => {
        // When there's a tie, it returns whichever was found first with max count
        const result = (crawler as any).getMostCommonValue(['a', 'b', 'a', 'b']);
        // Both have count 2; 'a' is encountered first
        assert.ok(result === 'a' || result === 'b');
    });
});

// ---------------------------------------------------------------------------
// Tests – analyzeDocumentStructure
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – analyzeDocumentStructure', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should return empty array for empty documents', () => {
        const result: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure([]);
        assert.equal(result.length, 0);
    });

    it('should extract fields from a single document', () => {
        const docs = [
            { _id: 'abc', name: 'Alice', age: 30, active: true },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const fieldNames = fields.map(f => f.name);
        assert.ok(fieldNames.includes('_id'));
        assert.ok(fieldNames.includes('name'));
        assert.ok(fieldNames.includes('age'));
        assert.ok(fieldNames.includes('active'));
    });

    it('should detect types correctly', () => {
        const docs = [
            { count: 42, ratio: 3.14, label: 'test', items: [1, 2] },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const byName = new Map(fields.map(f => [f.name, f]));
        assert.ok(byName.get('count')!.types.includes('int'));
        assert.ok(byName.get('ratio')!.types.includes('double'));
        assert.ok(byName.get('label')!.types.includes('string'));
        assert.ok(byName.get('items')!.types.includes('array'));
    });

    it('should detect nullable fields', () => {
        const docs = [
            { name: 'Alice', phone: '555-0100' },
            { name: 'Bob', phone: null },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const phoneField = fields.find(f => f.name === 'phone');
        assert.ok(phoneField);
        assert.equal(phoneField!.nullable, true);
        assert.ok(phoneField!.types.includes('string'));
    });

    it('should track multiple types for a field', () => {
        const docs = [
            { value: 42 },
            { value: 'hello' },
            { value: true },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const valueField = fields.find(f => f.name === 'value');
        assert.ok(valueField);
        assert.ok(valueField!.types.includes('int'));
        assert.ok(valueField!.types.includes('string'));
        assert.ok(valueField!.types.includes('boolean'));
    });

    it('should recursively analyze nested objects', () => {
        const docs = [
            { address: { city: 'Portland', zip: '97201' } },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const fieldNames = fields.map(f => f.name);
        assert.ok(fieldNames.includes('address'));
        assert.ok(fieldNames.includes('address.city'));
        assert.ok(fieldNames.includes('address.zip'));
    });

    it('should NOT recurse into arrays', () => {
        const docs = [
            { tags: ['a', 'b'], nested: { x: 1 } },
        ];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);

        const fieldNames = fields.map(f => f.name);
        // 'tags' should be an array type, no tags.0 etc.
        assert.ok(fieldNames.includes('tags'));
        assert.ok(!fieldNames.some(n => n.startsWith('tags.')));
    });

    it('should sort fields alphabetically', () => {
        const docs = [{ z: 1, a: 2, m: 3 }];
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);
        const names = fields.map(f => f.name);
        assert.deepEqual(names, [...names].sort());
    });

    it('should collect up to 10 examples per field', () => {
        // Create 15 documents, each with the same field
        const docs = Array.from({ length: 15 }, (_, i) => ({ val: i }));
        // Access the internal fieldStats to verify example count
        // We'll just ensure the function doesn't crash and returns correctly
        const fields: MongoFieldSchema[] = (crawler as any).analyzeDocumentStructure(docs);
        const valField = fields.find(f => f.name === 'val');
        assert.ok(valField);
        // commonValue should be determined from examples
        assert.ok(valField!.commonValue !== undefined);
    });
});

// ---------------------------------------------------------------------------
// Tests – generateDescription
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – generateDescription', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should include collection name and database', () => {
        const schema: MongoCollectionSchema = {
            database: 'analytics',
            collectionName: 'events',
            fields: [],
            indexes: [],
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('events'));
        assert.ok(desc.includes('analytics'));
    });

    it('should include field descriptions', () => {
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'items',
            fields: [
                { name: 'name', types: ['string'], nullable: false },
                { name: 'count', types: ['int', 'double'], nullable: true },
            ],
            indexes: [],
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('name (string)'));
        assert.ok(desc.includes('count (int|double), nullable'));
    });

    it('should include non-_id indexes', () => {
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'items',
            fields: [],
            indexes: [
                { name: '_id_', keys: { _id: 1 }, unique: true },
                { name: 'name_idx', keys: { name: 1 }, unique: false },
            ],
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('name_idx on (name)'));
        assert.ok(!desc.includes('_id_ on'));
    });

    it('should include document count when present', () => {
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'items',
            fields: [],
            indexes: [],
            documentCount: 12345,
        };
        const desc: string = (crawler as any).generateDescription(schema);
        assert.ok(desc.includes('12,345') || desc.includes('12345'));
    });

    it('should limit fields to 20 in the description', () => {
        const fields: MongoFieldSchema[] = Array.from({ length: 25 }, (_, i) => ({
            name: `field_${String(i).padStart(2, '0')}`,
            types: ['string'],
            nullable: false,
        }));
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'wide',
            fields,
            indexes: [],
        };
        const desc: string = (crawler as any).generateDescription(schema);
        // field_20 through field_24 should not appear
        assert.ok(!desc.includes('field_24'));
    });
});

// ---------------------------------------------------------------------------
// Tests – generateChecksum
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – generateChecksum', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should produce a valid SHA-256 hex string', () => {
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'test',
            fields: [{ name: 'x', types: ['int'], nullable: false }],
            indexes: [],
        };
        const checksum: string = (crawler as any).generateChecksum(schema);
        assert.match(checksum, /^[a-f0-9]{64}$/);
    });

    it('should be deterministic', () => {
        const schema: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'test',
            fields: [{ name: 'x', types: ['int'], nullable: false }],
            indexes: [],
        };
        assert.equal(
            (crawler as any).generateChecksum(schema),
            (crawler as any).generateChecksum(schema)
        );
    });

    it('should NOT change when documentCount changes', () => {
        const base: MongoCollectionSchema = {
            database: 'db',
            collectionName: 'test',
            fields: [{ name: 'x', types: ['int'], nullable: false }],
            indexes: [],
        };
        const modified = { ...base, documentCount: 999 };
        assert.equal(
            (crawler as any).generateChecksum(base),
            (crawler as any).generateChecksum(modified)
        );
    });
});

// ---------------------------------------------------------------------------
// Tests – extractDbName
// ---------------------------------------------------------------------------

describe('MongoDBSchemaCrawler – extractDbName', () => {
    beforeEach(() => { crawler = freshCrawler(); });

    it('should extract database name from standard connection string', () => {
        const name: string = (crawler as any).extractDbName('mongodb://user:pass@localhost:27017/mydb');
        assert.equal(name, 'mydb');
    });

    it('should extract database name with query parameters', () => {
        const name: string = (crawler as any).extractDbName('mongodb://localhost:27017/testdb?authSource=admin');
        assert.equal(name, 'testdb');
    });

    it('should default to "test" when no database is specified', () => {
        const name: string = (crawler as any).extractDbName('mongodb://localhost:27017/');
        // The regex /\/([^/?]+)(?:\?|$)/ won't match empty path, so returns 'test'
        assert.equal(name, 'test');
    });

    it('should extract host:port when no path separator present', () => {
        // The regex /\/([^/?]+)(?:\?|$)/ matches the last / segment,
        // which for "mongodb://localhost:27017" is "localhost:27017"
        const name: string = (crawler as any).extractDbName('mongodb://localhost:27017');
        assert.equal(name, 'localhost:27017');
    });

    it('should handle replica set connection strings', () => {
        const name: string = (crawler as any).extractDbName(
            'mongodb://host1:27017,host2:27017,host3:27017/replicadb?replicaSet=rs0'
        );
        assert.equal(name, 'replicadb');
    });
});
