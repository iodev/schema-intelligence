#!/usr/bin/env node
/**
 * Schema Intelligence Server Entry Point
 *
 * Reads configuration from schema-intelligence.yaml, initializes the service,
 * starts the HTTP server, and handles graceful shutdown.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { SchemaIntelligenceService } from './schema-intelligence-service.js';
import { SchemaIntelligenceServer } from './server.js';
// ── Config loading ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG_PATH = './schema-intelligence.yaml';
function loadConfig(configPath) {
    const resolvedPath = resolve(configPath);
    if (!existsSync(resolvedPath)) {
        console.error(`Error: Config file not found: ${resolvedPath}`);
        console.error(`Create one from the example: cp schema-intelligence.example.yaml schema-intelligence.yaml`);
        process.exit(1);
    }
    let rawConfig;
    try {
        const fileContent = readFileSync(resolvedPath, 'utf-8');
        rawConfig = yaml.load(fileContent);
    }
    catch (err) {
        console.error(`Error: Failed to parse config file: ${err.message}`);
        process.exit(1);
    }
    if (!rawConfig || !rawConfig.databases || rawConfig.databases.length === 0) {
        console.error('Error: Config file must contain at least one database entry.');
        process.exit(1);
    }
    const crawlerConfig = {
        databases: rawConfig.databases.map((db) => ({
            type: db.type,
            connectionString: db.connectionString,
            databases: db.databases,
            excludeDatabases: db.excludeDatabases,
            excludeSchemas: db.excludeSchemas,
        })),
        qdrantUrl: rawConfig.qdrant?.url ?? 'http://localhost:6333',
        qdrantCollection: rawConfig.qdrant?.collection ?? 'schema-intelligence',
        embeddingModel: (rawConfig.embedding?.model ?? 'simple'),
        scanInterval: rawConfig.scanInterval ?? 0,
        enableChangeDetection: rawConfig.enableChangeDetection ?? false,
    };
    const port = rawConfig.server?.port ?? parseInt(process.env.PORT ?? '3000', 10);
    const host = rawConfig.server?.host ?? process.env.HOST ?? '0.0.0.0';
    return { crawler: crawlerConfig, port, host };
}
// ── Environment variable overrides ──────────────────────────────────────────
function applyEnvOverrides(config) {
    const envQdrantUrl = process.env.SI_QDRANT_URL;
    if (envQdrantUrl) {
        config.crawler.qdrantUrl = envQdrantUrl;
    }
    const envQdrantCollection = process.env.SI_QDRANT_COLLECTION;
    if (envQdrantCollection) {
        config.crawler.qdrantCollection = envQdrantCollection;
    }
    const envPort = process.env.SI_PORT;
    if (envPort) {
        const parsed = parseInt(envPort, 10);
        if (!isNaN(parsed) && parsed > 0) {
            config.port = parsed;
        }
    }
    const envHost = process.env.SI_HOST;
    if (envHost) {
        config.host = envHost;
    }
}
// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const configPath = process.argv[2] ?? DEFAULT_CONFIG_PATH;
    console.log(`Loading configuration from ${resolve(configPath)}...`);
    const config = loadConfig(configPath);
    applyEnvOverrides(config);
    const { crawler: crawlerConfig, port, host } = config;
    console.log(`Initializing service with ${crawlerConfig.databases.length} database(s)...`);
    const service = new SchemaIntelligenceService(crawlerConfig);
    await service.initialize();
    const server = new SchemaIntelligenceServer({ service, port, host });
    await server.start();
    console.log(`Schema Intelligence Server running on http://${host}:${port}`);
    console.log('Press Ctrl+C to stop');
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\nReceived ${signal}. Shutting down gracefully...`);
        try {
            await server.stop();
            await service.shutdown();
            console.log('Server shut down successfully.');
            process.exit(0);
        }
        catch (err) {
            console.error('Error during shutdown:', err);
            process.exit(1);
        }
    };
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=server-entrypoint.js.map