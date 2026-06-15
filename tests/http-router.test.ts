/**
 * Tests for HTTP Router and Schema Intelligence Server
 *
 * Tests route matching, query parsing, JSON body parsing, CORS headers,
 * error handling, and all API endpoints using real HTTP requests against
 * a running server instance with mocked service methods.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HttpRouter, jsonResponse, errorResponse } from '../src/http-router.js';
import { SchemaIntelligenceServer } from '../src/server.js';
import type { SchemaIntelligenceService } from '../src/schema-intelligence-service.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Make an HTTP request and return parsed response
 */
function request(options: {
    port: number;
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: unknown }> {
    return new Promise((resolve, reject) => {
        const reqBody = options.body !== undefined ? JSON.stringify(options.body) : undefined;

        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: options.port,
                method: options.method,
                path: options.path,
                headers: {
                    ...(reqBody ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers ?? {}),
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf-8');
                    let body: unknown;
                    try {
                        body = JSON.parse(raw);
                    } catch {
                        body = raw;
                    }
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body,
                    });
                });
            }
        );

        req.on('error', reject);
        if (reqBody) {
            req.write(reqBody);
        }
        req.end();
    });
}

/**
 * Simulate an HTTP request through the router (without a real server)
 */
function simulateRequest(
    router: HttpRouter,
    method: string,
    path: string,
    body?: unknown
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            await router.handle(req, res);
        });

        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            if (!addr || typeof addr === 'string') {
                server.close();
                reject(new Error('Failed to start test server'));
                return;
            }

            const reqBody = body !== undefined ? JSON.stringify(body) : undefined;

            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port: addr.port,
                    method,
                    path,
                    headers: reqBody ? { 'Content-Type': 'application/json' } : {},
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => {
                        const raw = Buffer.concat(chunks).toString('utf-8');
                        let parsedBody: unknown;
                        try {
                            parsedBody = JSON.parse(raw);
                        } catch {
                            parsedBody = raw;
                        }

                        const resHeaders: Record<string, string> = {};
                        for (const [key, value] of Object.entries(res.headers)) {
                            if (typeof value === 'string') {
                                resHeaders[key] = value;
                            }
                        }

                        server.close();
                        resolve({
                            status: res.statusCode ?? 0,
                            body: parsedBody,
                            headers: resHeaders,
                        });
                    });
                }
            );

            req.on('error', (err) => {
                server.close();
                reject(err);
            });

            if (reqBody) {
                req.write(reqBody);
            }
            req.end();
        });
    });
}

// ── Mock service ────────────────────────────────────────────────────────────

function createMockService(): SchemaIntelligenceService {
    const mockSchemas: Record<string, unknown>[] = [
        {
            schemaId: 'testdb.public.users',
            type: 'postgresql',
            database: 'testdb',
            objectName: 'users',
            fullName: 'public.users',
            description: 'User accounts table',
            schema: { tableName: 'users', columns: [] },
            lastScanned: '2025-01-01T00:00:00.000Z',
            checksum: 'abc123',
        },
        {
            schemaId: 'testdb.public.orders',
            type: 'postgresql',
            database: 'testdb',
            objectName: 'orders',
            fullName: 'public.orders',
            description: 'Customer orders table',
            schema: { tableName: 'orders', columns: [] },
            lastScanned: '2025-01-01T00:00:00.000Z',
            checksum: 'def456',
        },
    ];

    return {
        getStats: async () => ({
            totalSchemas: 2,
            databases: { testdb: 2 },
            lastScan: new Date('2025-01-01T00:00:00.000Z'),
        }),
        scanAllDatabases: async () => { /* no-op */ },
        getDatabaseSchemas: async (database: string) => {
            return mockSchemas.filter(
                (s) => (s as Record<string, unknown>).database === database
            );
        },
        getSchema: async (database: string, schema: string, table: string) => {
            const id = `${database}.${schema}.${table}`;
            return mockSchemas.find(
                (s) => (s as Record<string, unknown>).schemaId === id
            ) as Record<string, unknown> | null ?? null;
        },
        searchSchemas: async (_query: string, limit: number) => {
            return mockSchemas.slice(0, limit).map((s, i) => ({
                id: String((s as Record<string, unknown>).schemaId),
                score: 0.95 - i * 0.1,
                database: String((s as Record<string, unknown>).database),
                table: String((s as Record<string, unknown>).fullName),
                description: String((s as Record<string, unknown>).description),
                schema: (s as Record<string, unknown>).schema,
            }));
        },
        shutdown: async () => { /* no-op */ },
        // Not used in server but included for completeness
        initialize: async () => { /* no-op */ },
        stopPeriodicScanning: () => { /* no-op */ },
    } as unknown as SchemaIntelligenceService;
}

// ── Tests: HttpRouter ───────────────────────────────────────────────────────

describe('HttpRouter – route matching', () => {
    it('should match a simple GET route', async () => {
        const router = new HttpRouter();
        router.get('/api/test', () => jsonResponse({ ok: true }));

        const res = await simulateRequest(router, 'GET', '/api/test');
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { ok: true });
    });

    it('should match a route with path parameters', async () => {
        const router = new HttpRouter();
        router.get('/api/items/:itemId', (req) =>
            jsonResponse({ itemId: req.params.itemId })
        );

        const res = await simulateRequest(router, 'GET', '/api/items/42');
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { itemId: '42' });
    });

    it('should match a route with multiple path parameters', async () => {
        const router = new HttpRouter();
        router.get('/api/databases/:database/schemas/:schema', (req) =>
            jsonResponse({ database: req.params.database, schema: req.params.schema })
        );

        const res = await simulateRequest(router, 'GET', '/api/databases/mydb/schemas/public');
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { database: 'mydb', schema: 'public' });
    });

    it('should return 404 for unmatched routes', async () => {
        const router = new HttpRouter();
        router.get('/api/exists', () => jsonResponse({ ok: true }));

        const res = await simulateRequest(router, 'GET', '/api/does-not-exist');
        assert.equal(res.status, 404);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.error, 'Not Found');
    });

    it('should return 404 when method does not match', async () => {
        const router = new HttpRouter();
        router.get('/api/test', () => jsonResponse({ ok: true }));

        const res = await simulateRequest(router, 'POST', '/api/test');
        assert.equal(res.status, 404);
    });

    it('should match POST routes', async () => {
        const router = new HttpRouter();
        router.post('/api/items', (req) =>
            jsonResponse({ received: req.body }, 201)
        );

        const res = await simulateRequest(router, 'POST', '/api/items', { name: 'test' });
        assert.equal(res.status, 201);
        assert.deepEqual(res.body, { received: { name: 'test' } });
    });
});

describe('HttpRouter – query string parsing', () => {
    it('should parse query parameters', async () => {
        const router = new HttpRouter();
        router.get('/api/search', (req) =>
            jsonResponse({ query: req.query })
        );

        const res = await simulateRequest(router, 'GET', '/api/search?q=hello&limit=10');
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.deepEqual(body.query, { q: 'hello', limit: '10' });
    });

    it('should handle empty query string', async () => {
        const router = new HttpRouter();
        router.get('/api/search', (req) =>
            jsonResponse({ query: req.query })
        );

        const res = await simulateRequest(router, 'GET', '/api/search');
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.deepEqual(body.query, {});
    });
});

describe('HttpRouter – JSON body parsing', () => {
    it('should parse a valid JSON body', async () => {
        const router = new HttpRouter();
        router.post('/api/data', (req) =>
            jsonResponse({ received: req.body })
        );

        const res = await simulateRequest(router, 'POST', '/api/data', { key: 'value' });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { received: { key: 'value' } });
    });

    it('should return 400 for malformed JSON', async () => {
        const router = new HttpRouter();
        router.post('/api/data', (req) =>
            jsonResponse({ received: req.body })
        );

        // We need to send malformed JSON — use raw HTTP
        const result = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                await router.handle(req, res);
            });
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                if (!addr || typeof addr === 'string') {
                    server.close();
                    reject(new Error('failed'));
                    return;
                }

                const req = http.request(
                    {
                        hostname: '127.0.0.1',
                        port: addr.port,
                        method: 'POST',
                        path: '/api/data',
                        headers: { 'Content-Type': 'application/json' },
                    },
                    (res) => {
                        const chunks: Buffer[] = [];
                        res.on('data', (c: Buffer) => chunks.push(c));
                        res.on('end', () => {
                            const raw = Buffer.concat(chunks).toString('utf-8');
                            server.close();
                            resolve({
                                status: res.statusCode ?? 0,
                                body: JSON.parse(raw),
                            });
                        });
                    }
                );
                req.on('error', (err) => {
                    server.close();
                    reject(err);
                });
                req.write('{invalid json');
                req.end();
            });
        });

        assert.equal(result.status, 400);
        const body = result.body as Record<string, unknown>;
        assert.equal(body.error, 'Invalid JSON in request body');
    });

    it('should handle empty body for POST without content-type', async () => {
        const router = new HttpRouter();
        router.post('/api/data', (req) =>
            jsonResponse({ received: req.body ?? null })
        );

        // Send POST with no content-type and no body
        const result = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                await router.handle(req, res);
            });
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                if (!addr || typeof addr === 'string') {
                    server.close();
                    reject(new Error('failed'));
                    return;
                }

                const req = http.request(
                    {
                        hostname: '127.0.0.1',
                        port: addr.port,
                        method: 'POST',
                        path: '/api/data',
                    },
                    (res) => {
                        const chunks: Buffer[] = [];
                        res.on('data', (c: Buffer) => chunks.push(c));
                        res.on('end', () => {
                            const raw = Buffer.concat(chunks).toString('utf-8');
                            server.close();
                            resolve({
                                status: res.statusCode ?? 0,
                                body: JSON.parse(raw),
                            });
                        });
                    }
                );
                req.on('error', (err) => {
                    server.close();
                    reject(err);
                });
                req.end();
            });
        });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { received: null });
    });
});

describe('HttpRouter – CORS headers', () => {
    it('should include CORS headers in responses', async () => {
        const router = new HttpRouter();
        router.get('/api/test', () => jsonResponse({ ok: true }));

        const res = await simulateRequest(router, 'GET', '/api/test');
        assert.equal(res.headers['access-control-allow-origin'], '*');
        assert.ok(res.headers['access-control-allow-methods']?.includes('GET'));
        assert.ok(res.headers['access-control-allow-methods']?.includes('POST'));
    });

    it('should handle OPTIONS preflight requests', async () => {
        const router = new HttpRouter();
        router.get('/api/test', () => jsonResponse({ ok: true }));

        const result = await new Promise<{ status: number; headers: Record<string, string> }>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                await router.handle(req, res);
            });
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address();
                if (!addr || typeof addr === 'string') {
                    server.close();
                    reject(new Error('failed'));
                    return;
                }

                const req = http.request(
                    {
                        hostname: '127.0.0.1',
                        port: addr.port,
                        method: 'OPTIONS',
                        path: '/api/test',
                    },
                    (res) => {
                        const chunks: Buffer[] = [];
                        res.on('data', (c: Buffer) => chunks.push(c));
                        res.on('end', () => {
                            const hdrs: Record<string, string> = {};
                            for (const [key, value] of Object.entries(res.headers)) {
                                if (typeof value === 'string') hdrs[key] = value;
                            }
                            server.close();
                            resolve({ status: res.statusCode ?? 0, headers: hdrs });
                        });
                    }
                );
                req.on('error', (err) => {
                    server.close();
                    reject(err);
                });
                req.end();
            });
        });

        assert.equal(result.status, 204);
        assert.equal(result.headers['access-control-allow-origin'], '*');
    });
});

describe('HttpRouter – error handling', () => {
    it('should catch handler errors and return 500', async () => {
        const router = new HttpRouter();
        router.get('/api/error', () => {
            throw new Error('Something went wrong');
        });

        const res = await simulateRequest(router, 'GET', '/api/error');
        assert.equal(res.status, 500);
        const body = res.body as Record<string, unknown>;
        // Default error handler should NOT leak error messages
        assert.equal(body.error, 'Internal Server Error');
    });

    it('should use custom error handler when set', async () => {
        const router = new HttpRouter();
        router.onError((_error, _req) =>
            errorResponse('Custom error handler', 503)
        );
        router.get('/api/error', () => {
            throw new Error('Boom');
        });

        const res = await simulateRequest(router, 'GET', '/api/error');
        assert.equal(res.status, 503);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.error, 'Custom error handler');
    });
});

describe('HttpRouter – response helpers', () => {
    it('jsonResponse should create a proper response', () => {
        const res = jsonResponse({ data: 'test' }, 201);
        assert.equal(res.status, 201);
        assert.deepEqual(res.body, { data: 'test' });
    });

    it('errorResponse should create a proper error response', () => {
        const res = errorResponse('Not Found', 404);
        assert.equal(res.status, 404);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.error, 'Not Found');
        assert.equal(body.status, 404);
    });

    it('errorResponse should include details when provided', () => {
        const res = errorResponse('Validation failed', 400, { field: 'name' });
        const body = res.body as Record<string, unknown>;
        assert.deepEqual(body.details, { field: 'name' });
    });
});

// ── Tests: SchemaIntelligenceServer with real HTTP ──────────────────────────

describe('SchemaIntelligenceServer – API endpoints', () => {
    let server: SchemaIntelligenceServer;
    let port: number;

    before(async () => {
        const mockService = createMockService();
        server = new SchemaIntelligenceServer({
            service: mockService,
            port: 0, // random port
            host: '127.0.0.1',
        });
        await server.start();
        const addr = server.address();
        assert.ok(addr, 'Server should have an address');
        port = addr.port;
    });

    after(async () => {
        await server.stop();
    });

    // Health endpoints

    it('GET /api/v1/health should return health status', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/health' });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.status, 'healthy');
        assert.equal(body.qdrant, 'connected');
        assert.equal(body.databaseCount, 1);
        assert.equal(body.totalSchemas, 2);
        assert.ok(body.lastScan);
    });

    it('GET /api/v1/status should return detailed status', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/status' });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.totalSchemas, 2);
        assert.deepEqual(body.databases, { testdb: 2 });
        assert.ok(body.lastScan);
    });

    // OpenAPI spec

    it('GET /api/v1/openapi.json should return JSON spec', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/openapi.json' });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.openapi, '3.1.0');
        const info = body.info as Record<string, unknown>;
        assert.equal(info.title, 'Schema Intelligence API');
    });

    // Schema operations

    it('POST /api/v1/scan should trigger a scan', async () => {
        const res = await request({ port, method: 'POST', path: '/api/v1/scan', body: {} });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.message, 'Scan completed successfully');
        assert.equal(body.totalSchemas, 2);
    });

    it('POST /api/v1/scan with databases filter', async () => {
        const res = await request({
            port,
            method: 'POST',
            path: '/api/v1/scan',
            body: { databases: ['testdb'] },
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.message, 'Scan completed successfully');
    });

    it('GET /api/v1/schemas should list all schemas', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/schemas' });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.total, 2);
        assert.ok(Array.isArray(body.schemas));
        assert.equal((body.schemas as unknown[]).length, 2);
        assert.equal(body.limit, 100);
        assert.equal(body.offset, 0);
    });

    it('GET /api/v1/schemas with pagination', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/schemas?limit=1&offset=0',
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal((body.schemas as unknown[]).length, 1);
        assert.equal(body.total, 2);
        assert.equal(body.limit, 1);
        assert.equal(body.offset, 0);
    });

    it('GET /api/v1/schemas with database filter', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/schemas?database=testdb',
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.total, 2);
    });

    it('GET /api/v1/schemas/:schemaId should return schema details', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/schemas/testdb.public.users',
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.schemaId, 'testdb.public.users');
        assert.equal(body.objectName, 'users');
    });

    it('GET /api/v1/schemas/:schemaId should return 404 for unknown schema', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/schemas/testdb.public.nonexistent',
        });
        assert.equal(res.status, 404);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.error, 'Schema not found');
    });

    it('GET /api/v1/schemas/:schemaId should return 400 for bad format', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/schemas/invalid',
        });
        assert.equal(res.status, 400);
        const body = res.body as Record<string, unknown>;
        assert.ok((body.error as string).includes('Invalid schema ID format'));
    });

    // Database endpoints

    it('GET /api/v1/databases should list databases', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/databases' });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        const dbs = body.databases as Array<Record<string, unknown>>;
        assert.equal(dbs.length, 1);
        assert.equal(dbs[0].name, 'testdb');
        assert.equal(dbs[0].schemaCount, 2);
    });

    it('GET /api/v1/databases/:database/schemas should return schemas', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/databases/testdb/schemas',
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.database, 'testdb');
        assert.equal(body.total, 2);
        assert.ok(Array.isArray(body.schemas));
    });

    // Search

    it('POST /api/v1/search should return search results', async () => {
        const res = await request({
            port,
            method: 'POST',
            path: '/api/v1/search',
            body: { query: 'user accounts', limit: 5 },
        });
        assert.equal(res.status, 200);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.query, 'user accounts');
        assert.ok(Array.isArray(body.results));
        assert.ok((body.results as unknown[]).length > 0);
    });

    it('POST /api/v1/search should return 400 for missing query', async () => {
        const res = await request({
            port,
            method: 'POST',
            path: '/api/v1/search',
            body: {},
        });
        assert.equal(res.status, 400);
        const body = res.body as Record<string, unknown>;
        assert.ok((body.error as string).includes('query'));
    });

    it('POST /api/v1/search should return 400 for empty query', async () => {
        const res = await request({
            port,
            method: 'POST',
            path: '/api/v1/search',
            body: { query: '' },
        });
        assert.equal(res.status, 400);
    });

    it('POST /api/v1/search should return 400 for invalid limit', async () => {
        const res = await request({
            port,
            method: 'POST',
            path: '/api/v1/search',
            body: { query: 'test', limit: -1 },
        });
        assert.equal(res.status, 400);
    });

    // 404 for unknown routes

    it('should return 404 for unknown routes', async () => {
        const res = await request({
            port,
            method: 'GET',
            path: '/api/v1/nonexistent',
        });
        assert.equal(res.status, 404);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.error, 'Not Found');
    });

    // CORS headers on real server

    it('should include CORS headers in responses', async () => {
        const res = await request({ port, method: 'GET', path: '/api/v1/health' });
        assert.equal(res.headers['access-control-allow-origin'], '*');
    });
});
