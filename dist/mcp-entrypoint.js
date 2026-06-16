#!/usr/bin/env node
/**
 * Schema Intelligence MCP Server Entry Point
 *
 * Reads configuration from schema-intelligence.yaml, initializes the service,
 * and starts the MCP server using stdio transport for AI tool integration.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { SchemaIntelligenceService } from './schema-intelligence-service.js';
import { SchemaIntelligenceMCPServer } from './mcp-server.js';
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
    return {
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
        changeTracking: rawConfig.changeTracking
            ? {
                enabled: rawConfig.changeTracking.enabled ?? false,
                storageDir: rawConfig.changeTracking.storageDir,
                retentionDays: rawConfig.changeTracking.retentionDays,
            }
            : undefined,
    };
}
// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    const configPath = process.argv[2] ?? DEFAULT_CONFIG_PATH;
    // Log to stderr so we don't interfere with MCP stdio transport on stdout
    console.error(`Loading configuration from ${resolve(configPath)}...`);
    const config = loadConfig(configPath);
    console.error(`Initializing service with ${config.databases.length} database(s)...`);
    const service = new SchemaIntelligenceService(config);
    await service.initialize();
    console.error('Starting MCP server on stdio...');
    const mcpServer = new SchemaIntelligenceMCPServer({ service, config });
    await mcpServer.start();
    console.error('Schema Intelligence MCP server running on stdio');
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.error(`\nReceived ${signal}. Shutting down gracefully...`);
        try {
            await mcpServer.close();
            await service.shutdown();
            console.error('MCP server shut down successfully.');
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
//# sourceMappingURL=mcp-entrypoint.js.map