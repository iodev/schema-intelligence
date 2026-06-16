/**
 * Schema Intelligence HTTP Server
 *
 * Standalone HTTP server that exposes the Schema Intelligence functionality
 * via a REST API using the built-in node:http module.
 */
import { SchemaIntelligenceService } from './schema-intelligence-service.js';
export interface SchemaIntelligenceServerOptions {
    service: SchemaIntelligenceService;
    port?: number;
    host?: string;
}
export declare class SchemaIntelligenceServer {
    private server;
    private router;
    private service;
    private logger;
    private port;
    private host;
    private openApiSpec;
    constructor(options: SchemaIntelligenceServerOptions);
    /**
     * Start listening for HTTP requests
     */
    start(): Promise<void>;
    /**
     * Gracefully stop the server
     */
    stop(): Promise<void>;
    /**
     * Get the address the server is listening on (useful for tests)
     */
    address(): {
        port: number;
        host: string;
    } | null;
    private handleRequest;
    private registerErrorHandler;
    private registerRoutes;
    private handleHealth;
    private handleStatus;
    private handleOpenApiSpec;
    private handleScan;
    private handleListSchemas;
    private handleGetSchema;
    private handleListDatabases;
    private handleDatabaseSchemas;
    private handleSearch;
}
//# sourceMappingURL=server.d.ts.map