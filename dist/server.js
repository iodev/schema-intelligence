/**
 * Schema Intelligence HTTP Server
 *
 * Standalone HTTP server that exposes the Schema Intelligence functionality
 * via a REST API using the built-in node:http module.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import yaml from 'js-yaml';
import { HttpRouter, jsonResponse, errorResponse } from './http-router.js';
// ── Server ──────────────────────────────────────────────────────────────────
export class SchemaIntelligenceServer {
    server;
    router;
    service;
    logger;
    port;
    host;
    openApiSpec = null;
    constructor(options) {
        this.service = options.service;
        this.port = options.port ?? 3000;
        this.host = options.host ?? '0.0.0.0';
        this.logger = pino({ name: 'schema-intelligence-server' });
        this.router = new HttpRouter({ corsOrigin: '*' });
        this.registerRoutes();
        this.registerErrorHandler();
        this.server = createServer((req, res) => {
            this.handleRequest(req, res);
        });
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────
    /**
     * Start listening for HTTP requests
     */
    async start() {
        return new Promise((resolveP, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, this.host, () => {
                this.server.removeListener('error', reject);
                this.logger.info({ port: this.port, host: this.host }, `Schema Intelligence Server listening on http://${this.host}:${this.port}`);
                resolveP();
            });
        });
    }
    /**
     * Gracefully stop the server
     */
    async stop() {
        return new Promise((resolveP, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.logger.info('Schema Intelligence Server stopped');
                    resolveP();
                }
            });
        });
    }
    /**
     * Get the address the server is listening on (useful for tests)
     */
    address() {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
            return { port: addr.port, host: addr.address };
        }
        return null;
    }
    // ── Request handling ──────────────────────────────────────────────────
    async handleRequest(req, res) {
        const start = Date.now();
        const method = req.method ?? 'GET';
        const url = req.url ?? '/';
        try {
            await this.router.handle(req, res);
        }
        catch (error) {
            this.logger.error({ error, method, url }, 'Unhandled error in request handler');
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error', status: 500 }));
            }
        }
        finally {
            const duration = Date.now() - start;
            this.logger.info({ method, url, status: res.statusCode, durationMs: duration }, `${method} ${url} ${res.statusCode} ${duration}ms`);
        }
    }
    // ── Error handler ─────────────────────────────────────────────────────
    registerErrorHandler() {
        const isDevelopment = process.env.NODE_ENV === 'development';
        this.router.onError((error, _req) => {
            const message = isDevelopment && error instanceof Error
                ? error.message
                : 'Internal Server Error';
            const details = {};
            if (isDevelopment && error instanceof Error && error.stack) {
                details.stack = error.stack;
            }
            this.logger.error({ error }, 'Route handler error');
            return errorResponse(message, 500, Object.keys(details).length > 0 ? details : undefined);
        });
    }
    // ── Route registration ────────────────────────────────────────────────
    registerRoutes() {
        // Health
        this.router.get('/api/v1/health', (req) => this.handleHealth(req));
        this.router.get('/api/v1/status', (req) => this.handleStatus(req));
        // OpenAPI spec
        this.router.get('/api/v1/openapi.json', () => this.handleOpenApiSpec());
        // Schema operations
        this.router.post('/api/v1/scan', (req) => this.handleScan(req));
        this.router.get('/api/v1/schemas', (req) => this.handleListSchemas(req));
        this.router.get('/api/v1/schemas/:schemaId', (req) => this.handleGetSchema(req));
        this.router.get('/api/v1/databases', (req) => this.handleListDatabases(req));
        this.router.get('/api/v1/databases/:database/schemas', (req) => this.handleDatabaseSchemas(req));
        // Search
        this.router.post('/api/v1/search', (req) => this.handleSearch(req));
    }
    // ── Route handlers ────────────────────────────────────────────────────
    async handleHealth(_req) {
        try {
            const stats = await this.service.getStats();
            return jsonResponse({
                status: 'healthy',
                qdrant: 'connected',
                databaseCount: Object.keys(stats.databases).length,
                totalSchemas: stats.totalSchemas,
                lastScan: stats.lastScan ? stats.lastScan.toISOString() : null,
            });
        }
        catch {
            return jsonResponse({
                status: 'unhealthy',
                qdrant: 'disconnected',
                databaseCount: 0,
                totalSchemas: 0,
                lastScan: null,
            }, 503);
        }
    }
    async handleStatus(_req) {
        const stats = await this.service.getStats();
        return jsonResponse({
            totalSchemas: stats.totalSchemas,
            databases: stats.databases,
            lastScan: stats.lastScan ? stats.lastScan.toISOString() : null,
        });
    }
    handleOpenApiSpec() {
        if (!this.openApiSpec) {
            try {
                const currentDir = dirname(fileURLToPath(import.meta.url));
                // Try multiple possible locations (handles dist/, dist-test/src/, src/)
                const candidates = [
                    resolve(currentDir, '..', 'openapi.yaml'),
                    resolve(currentDir, '..', '..', 'openapi.yaml'),
                    resolve(currentDir, 'openapi.yaml'),
                ];
                let specContent;
                for (const candidate of candidates) {
                    try {
                        specContent = readFileSync(candidate, 'utf-8');
                        break;
                    }
                    catch {
                        // try next candidate
                    }
                }
                if (!specContent) {
                    return errorResponse('OpenAPI spec not found', 500);
                }
                this.openApiSpec = yaml.load(specContent);
            }
            catch {
                return errorResponse('OpenAPI spec not found', 500);
            }
        }
        return jsonResponse(this.openApiSpec);
    }
    async handleScan(req) {
        // body.databases is accepted but currently the service scans all configured databases
        void req.body?.databases;
        // Trigger a full scan (the service scans all configured databases)
        await this.service.scanAllDatabases();
        const stats = await this.service.getStats();
        return jsonResponse({
            message: 'Scan completed successfully',
            totalSchemas: stats.totalSchemas,
            databases: stats.databases,
        });
    }
    async handleListSchemas(req) {
        const database = req.query.database;
        // type filter is accepted in the API but filtering is done via Qdrant queries
        void req.query.type;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
        if (req.query.limit && (isNaN(limit) || limit < 0)) {
            return errorResponse('Invalid limit parameter', 400);
        }
        if (req.query.offset && (isNaN(offset) || offset < 0)) {
            return errorResponse('Invalid offset parameter', 400);
        }
        const stats = await this.service.getStats();
        const allDatabases = Object.keys(stats.databases);
        const targetDatabases = database ? [database] : allDatabases;
        const allSchemas = [];
        for (const db of targetDatabases) {
            const schemas = await this.service.getDatabaseSchemas(db);
            allSchemas.push(...schemas);
        }
        // Apply pagination
        const paginated = allSchemas.slice(offset, offset + limit);
        return jsonResponse({
            schemas: paginated,
            total: allSchemas.length,
            limit,
            offset,
        });
    }
    async handleGetSchema(req) {
        const schemaId = req.params.schemaId;
        // Attempt to parse schemaId as database.schema.table
        const parts = schemaId.split('.');
        if (parts.length < 3) {
            return errorResponse('Invalid schema ID format. Expected: database.schema.table', 400);
        }
        const [database, schema, ...tableParts] = parts;
        const table = tableParts.join('.');
        const result = await this.service.getSchema(database, schema, table);
        if (!result) {
            return errorResponse('Schema not found', 404);
        }
        return jsonResponse(result);
    }
    async handleListDatabases(_req) {
        const stats = await this.service.getStats();
        const databases = Object.entries(stats.databases).map(([name, schemaCount]) => ({
            name,
            schemaCount,
        }));
        return jsonResponse({ databases });
    }
    async handleDatabaseSchemas(req) {
        const database = req.params.database;
        const schemas = await this.service.getDatabaseSchemas(database);
        return jsonResponse({
            database,
            schemas,
            total: schemas.length,
        });
    }
    async handleSearch(req) {
        const body = req.body;
        if (!body || typeof body.query !== 'string' || body.query.trim().length === 0) {
            return errorResponse('Missing or empty "query" field in request body', 400);
        }
        const limit = body.limit ?? 5;
        if (typeof limit !== 'number' || limit < 1) {
            return errorResponse('Invalid "limit" field: must be a positive number', 400);
        }
        const results = await this.service.searchSchemas(body.query, limit, body.database);
        return jsonResponse({
            query: body.query,
            results,
            total: results.length,
        });
    }
}
//# sourceMappingURL=server.js.map