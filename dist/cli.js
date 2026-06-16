#!/usr/bin/env node
/**
 * Schema Intelligence CLI
 *
 * Command-line interface for database schema crawling, vectorization, and semantic search.
 *
 * Usage:
 *   schema-intelligence scan [--config <path>]      # Scan all configured databases
 *   schema-intelligence search <query> [--limit N]   # Semantic search across schemas
 *   schema-intelligence status                       # Show service statistics
 *   schema-intelligence list [--database <name>]     # List all schemas (optionally filtered)
 *   schema-intelligence diff [--since <date>]        # Show schema changes (placeholder)
 */
import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { SchemaIntelligenceService } from './schema-intelligence-service.js';
// ── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_CONFIG_PATH = './schema-intelligence.yaml';
const VERSION = '1.0.0';
const HELP_TEXT = `
schema-intelligence v${VERSION}
Automated database schema crawling and vectorization

USAGE:
  schema-intelligence <command> [options]

COMMANDS:
  scan                         Scan all configured databases
  search <query>               Semantic search across schemas
  status                       Show service statistics
  list                         List all schemas
  diff                         Show schema changes (coming in v2.0)

OPTIONS:
  --config <path>              Path to config file (default: ./schema-intelligence.yaml)
  --limit <number>             Max results for search (default: 5)
  --database <name>            Filter by database name (for list command)
  --since <date>               Show changes since date (for diff command)
  --help, -h                   Show this help message
  --version, -v                Show version
`.trim();
// ── Config loading ──────────────────────────────────────────────────────────
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
    };
}
// ── Output helpers ──────────────────────────────────────────────────────────
function padRight(str, len) {
    return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}
function printTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
        const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0);
        return Math.max(h.length, maxRow) + 2;
    });
    // Header
    const headerLine = headers.map((h, i) => padRight(h, colWidths[i])).join('');
    console.log(headerLine);
    console.log(colWidths.map((w) => '-'.repeat(w)).join(''));
    // Rows
    for (const row of rows) {
        const line = row.map((cell, i) => padRight(cell ?? '', colWidths[i])).join('');
        console.log(line);
    }
}
// ── Commands ────────────────────────────────────────────────────────────────
async function commandScan(configPath) {
    console.log('Loading configuration...');
    const config = loadConfig(configPath);
    const dbCount = config.databases.length;
    const dbTypes = config.databases.map((d) => d.type);
    console.log(`Found ${dbCount} database(s): ${dbTypes.join(', ')}`);
    console.log(`Qdrant: ${config.qdrantUrl} (collection: ${config.qdrantCollection})`);
    console.log(`Embedding model: ${config.embeddingModel}`);
    console.log('');
    console.log('Initializing service and scanning databases...');
    const service = new SchemaIntelligenceService(config);
    try {
        await service.initialize();
        const stats = await service.getStats();
        console.log('');
        console.log('=== Scan Complete ===');
        console.log(`Total schemas discovered: ${stats.totalSchemas}`);
        if (Object.keys(stats.databases).length > 0) {
            console.log('');
            const rows = Object.entries(stats.databases).map(([db, count]) => [db, String(count)]);
            printTable(['Database', 'Schemas'], rows);
        }
        if (stats.lastScan) {
            console.log('');
            console.log(`Last scan: ${stats.lastScan.toISOString()}`);
        }
    }
    finally {
        await service.shutdown();
    }
}
async function commandSearch(configPath, query, limit) {
    if (!query) {
        console.error('Error: Search query is required.');
        console.error('Usage: schema-intelligence search <query> [--limit N]');
        process.exit(1);
    }
    console.log('Loading configuration...');
    const config = loadConfig(configPath);
    console.log('Initializing service...');
    const service = new SchemaIntelligenceService(config);
    try {
        await service.initialize();
        console.log(`Searching for: "${query}" (limit: ${limit})`);
        console.log('');
        const results = await service.searchSchemas(query, limit);
        if (results.length === 0) {
            console.log('No results found.');
            return;
        }
        console.log(`Found ${results.length} result(s):`);
        console.log('');
        const rows = results.map((r, i) => [
            String(i + 1),
            (r.score * 100).toFixed(1) + '%',
            r.database,
            r.table,
            r.description.length > 60 ? r.description.slice(0, 57) + '...' : r.description,
        ]);
        printTable(['#', 'Score', 'Database', 'Table', 'Description'], rows);
    }
    finally {
        await service.shutdown();
    }
}
async function commandStatus(configPath) {
    console.log('Loading configuration...');
    const config = loadConfig(configPath);
    const service = new SchemaIntelligenceService(config);
    try {
        const stats = await service.getStats();
        console.log('');
        console.log('=== Schema Intelligence Status ===');
        console.log(`Total schemas:  ${stats.totalSchemas}`);
        console.log(`Last scan:      ${stats.lastScan ? stats.lastScan.toISOString() : 'Never'}`);
        console.log('');
        if (Object.keys(stats.databases).length > 0) {
            console.log('Databases:');
            const rows = Object.entries(stats.databases).map(([db, count]) => [db, String(count)]);
            printTable(['Name', 'Schema Count'], rows);
        }
        else {
            console.log('No schemas found. Run "schema-intelligence scan" first.');
        }
        console.log('');
        console.log('Configuration:');
        console.log(`  Config file:      ${resolve(configPath)}`);
        console.log(`  Qdrant URL:       ${config.qdrantUrl}`);
        console.log(`  Collection:       ${config.qdrantCollection}`);
        console.log(`  Embedding model:  ${config.embeddingModel}`);
        console.log(`  Scan interval:    ${config.scanInterval ? config.scanInterval + ' minutes' : 'Manual only'}`);
    }
    finally {
        await service.shutdown();
    }
}
async function commandList(configPath, database) {
    console.log('Loading configuration...');
    const config = loadConfig(configPath);
    console.log('Initializing service...');
    const service = new SchemaIntelligenceService(config);
    try {
        await service.initialize();
        if (database) {
            console.log(`Listing schemas for database: ${database}`);
            console.log('');
            const schemas = await service.getDatabaseSchemas(database);
            if (schemas.length === 0) {
                console.log(`No schemas found for database "${database}".`);
                return;
            }
            const rows = schemas.map((s) => [
                String(s.database ?? database),
                String(s.objectName ?? s.fullName ?? '-'),
                String(s.type ?? '-'),
                typeof s.description === 'string' ? (s.description.length > 50 ? s.description.slice(0, 47) + '...' : s.description) : '-',
            ]);
            printTable(['Database', 'Object', 'Type', 'Description'], rows);
            console.log('');
            console.log(`Total: ${schemas.length} schema(s)`);
        }
        else {
            // List all databases from config
            console.log('Listing all schemas...');
            console.log('');
            let totalCount = 0;
            for (const dbConfig of config.databases) {
                const dbName = extractDbName(dbConfig.connectionString);
                const schemas = await service.getDatabaseSchemas(dbName);
                totalCount += schemas.length;
                if (schemas.length > 0) {
                    console.log(`--- ${dbName} (${dbConfig.type}) ---`);
                    const rows = schemas.map((s) => [
                        String(s.objectName ?? s.fullName ?? '-'),
                        String(s.type ?? '-'),
                        typeof s.description === 'string' ? (s.description.length > 50 ? s.description.slice(0, 47) + '...' : s.description) : '-',
                    ]);
                    printTable(['Object', 'Type', 'Description'], rows);
                    console.log('');
                }
            }
            if (totalCount === 0) {
                console.log('No schemas found. Run "schema-intelligence scan" first.');
            }
            else {
                console.log(`Total: ${totalCount} schema(s) across ${config.databases.length} database(s)`);
            }
        }
    }
    finally {
        await service.shutdown();
    }
}
function commandDiff() {
    console.log('Change history not yet implemented. Coming in v2.0.');
}
function extractDbName(connectionString) {
    const match = connectionString.match(/\/([^/?]+)(?:\?|$)/);
    return match ? match[1] : 'unknown';
}
// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    let parsed;
    try {
        parsed = parseArgs({
            allowPositionals: true,
            options: {
                config: { type: 'string', short: 'c' },
                limit: { type: 'string', short: 'l' },
                database: { type: 'string', short: 'd' },
                since: { type: 'string', short: 's' },
                help: { type: 'boolean', short: 'h' },
                version: { type: 'boolean', short: 'v' },
            },
        });
    }
    catch (err) {
        console.error(`Error: ${err.message}`);
        console.error('Run "schema-intelligence --help" for usage information.');
        process.exit(1);
    }
    const { values, positionals } = parsed;
    if (values.help) {
        console.log(HELP_TEXT);
        process.exit(0);
    }
    if (values.version) {
        console.log(`schema-intelligence v${VERSION}`);
        process.exit(0);
    }
    const command = positionals[0];
    const configPath = values.config ?? DEFAULT_CONFIG_PATH;
    if (!command) {
        console.log(HELP_TEXT);
        process.exit(0);
    }
    try {
        switch (command) {
            case 'scan':
                await commandScan(configPath);
                break;
            case 'search': {
                const query = positionals.slice(1).join(' ');
                const limit = values.limit ? parseInt(values.limit, 10) : 5;
                if (values.limit && (isNaN(limit) || limit <= 0)) {
                    console.error('Error: --limit must be a positive integer.');
                    process.exit(1);
                }
                await commandSearch(configPath, query, limit);
                break;
            }
            case 'status':
                await commandStatus(configPath);
                break;
            case 'list':
                await commandList(configPath, values.database);
                break;
            case 'diff':
                commandDiff();
                break;
            default:
                console.error(`Error: Unknown command "${command}"`);
                console.error('Run "schema-intelligence --help" for usage information.');
                process.exit(1);
        }
    }
    catch (err) {
        console.error(`Fatal error: ${err.message}`);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map