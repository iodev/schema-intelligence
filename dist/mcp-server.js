/**
 * Schema Intelligence MCP Server
 *
 * Model Context Protocol server that exposes Schema Intelligence functionality
 * to AI tools (Claude, Cursor, etc.) via tools, resources, and prompts.
 */
import { z } from 'zod/v3';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// ---------------------------------------------------------------------------
// SchemaIntelligenceMCPServer
// ---------------------------------------------------------------------------
export class SchemaIntelligenceMCPServer {
    mcpServer;
    service;
    config;
    constructor(options) {
        this.service = options.service;
        this.config = options.config;
        this.mcpServer = new McpServer({
            name: 'schema-intelligence',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
            },
        });
        this.registerTools();
        this.registerResources();
        this.registerPrompts();
    }
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    /**
     * Start the MCP server using stdio transport
     */
    async start() {
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
    }
    /**
     * Close the MCP server
     */
    async close() {
        await this.mcpServer.close();
    }
    /**
     * Get the underlying McpServer instance (useful for testing)
     */
    getServer() {
        return this.mcpServer;
    }
    // -----------------------------------------------------------------------
    // Tools
    // -----------------------------------------------------------------------
    registerTools() {
        // 1. search_database_schemas
        this.mcpServer.tool('search_database_schemas', 'Semantic search across all database schemas', {
            query: z.string().describe('Search query text'),
            limit: z.number().optional().describe('Maximum number of results (default 5)'),
            database: z.string().optional().describe('Filter by database name'),
        }, async (args) => {
            const results = await this.service.searchSchemas(args.query, args.limit ?? 5, args.database);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(results, null, 2),
                    },
                ],
            };
        });
        // 2. get_database_schema
        this.mcpServer.tool('get_database_schema', 'Get detailed schema for a specific table/collection', {
            database: z.string().describe('Database name'),
            schema: z.string().optional().describe('Schema name (default "public")'),
            name: z.string().describe('Table or collection name'),
        }, async (args) => {
            const schemaName = args.schema ?? 'public';
            const result = await this.service.getSchema(args.database, schemaName, args.name);
            if (!result) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Schema not found: ${args.database}.${schemaName}.${args.name}`,
                        },
                    ],
                    isError: true,
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        });
        // 3. list_databases
        this.mcpServer.tool('list_databases', 'List all configured databases', {}, async () => {
            const databases = this.config.databases.map((db) => ({
                type: db.type,
                connectionString: maskConnectionString(db.connectionString),
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(databases, null, 2),
                    },
                ],
            };
        });
        // 4. list_database_schemas
        this.mcpServer.tool('list_database_schemas', 'List all schemas in a database', {
            database: z.string().describe('Database name'),
            type: z.string().optional().describe('Filter by database type'),
        }, async (args) => {
            const schemas = await this.service.getDatabaseSchemas(args.database);
            const summaries = schemas.map((s) => ({
                objectName: s.objectName,
                fullName: s.fullName,
                type: s.type,
                description: s.description,
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(summaries, null, 2),
                    },
                ],
            };
        });
        // 5. get_relationships
        this.mcpServer.tool('get_relationships', 'Get relationships for a schema object', {
            database: z.string().describe('Database name'),
            name: z.string().describe('Table or collection name'),
            depth: z.number().optional().describe('Traversal depth (default 2)'),
        }, async (args) => {
            const graph = this.service.getRelationshipGraph();
            const depth = args.depth ?? 2;
            // Try to find the node by scanning all nodes in the graph
            const graphJson = graph.toJSON();
            const matchingNode = graphJson.nodes.find((n) => n.database === args.database && n.name === args.name);
            if (!matchingNode) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No schema node found for ${args.database}.${args.name}`,
                        },
                    ],
                    isError: true,
                };
            }
            const subgraph = graph.getRelationshipChain(matchingNode.id, depth);
            // Strip metadata from nodes to keep response size reasonable
            const nodes = subgraph.nodes.map((n) => ({
                id: n.id,
                database: n.database,
                type: n.type,
                dbType: n.dbType,
                name: n.name,
                schema: n.schema,
            }));
            const edges = subgraph.edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                relationship: e.relationship,
                label: e.label,
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ nodes, edges }, null, 2),
                    },
                ],
            };
        });
        // 6. get_recent_changes
        this.mcpServer.tool('get_recent_changes', 'Get recent schema changes', {
            database: z.string().optional().describe('Filter by database name'),
            limit: z.number().optional().describe('Maximum number of changes (default 10)'),
        }, async (args) => {
            const limit = args.limit ?? 10;
            const changes = await this.service.getRecentChanges(undefined, limit);
            const filtered = args.database
                ? changes.filter((c) => c.database === args.database)
                : changes;
            const results = filtered.map((c) => ({
                id: c.id,
                schemaId: c.schemaId,
                database: c.database,
                objectName: c.objectName,
                changeType: c.changeType,
                timestamp: c.timestamp,
                changes: c.diff.changes,
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(results, null, 2),
                    },
                ],
            };
        });
        // 7. rescan_schemas
        this.mcpServer.tool('rescan_schemas', 'Trigger a full rescan of all databases to detect schema changes', {
            databases: z
                .array(z.string())
                .optional()
                .describe('Specific databases to scan (default: all)'),
        }, async (_args) => {
            await this.service.scanAllDatabases();
            const stats = await this.service.getStats();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Scan completed successfully',
                            totalSchemas: stats.totalSchemas,
                            databases: stats.databases,
                        }, null, 2),
                    },
                ],
            };
        });
        // 8. get_schema_stats
        this.mcpServer.tool('get_schema_stats', 'Get service statistics: total schemas indexed and per-database counts', {}, async () => {
            const stats = await this.service.getStats();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(stats, null, 2),
                    },
                ],
            };
        });
    }
    // -----------------------------------------------------------------------
    // Resources
    // -----------------------------------------------------------------------
    registerResources() {
        // 1. schema://databases — List of all databases
        this.mcpServer.resource('databases', 'schema://databases', { description: 'List of all configured databases', mimeType: 'application/json' }, async (uri) => {
            const stats = await this.service.getStats();
            const databases = Object.entries(stats.databases).map(([name, schemaCount]) => ({
                name,
                schemaCount,
            }));
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(databases, null, 2),
                    },
                ],
            };
        });
        // 2. schema://{database}/overview — Database overview
        this.mcpServer.resource('database_overview', new ResourceTemplate('schema://{database}/overview', { list: undefined }), { description: 'Overview of a specific database', mimeType: 'application/json' }, async (uri, variables) => {
            const database = String(variables.database);
            const schemas = await this.service.getDatabaseSchemas(database);
            const overview = {
                database,
                tableCount: schemas.length,
                tables: schemas.map((s) => ({
                    objectName: s.objectName,
                    fullName: s.fullName,
                    type: s.type,
                    description: s.description,
                })),
            };
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(overview, null, 2),
                    },
                ],
            };
        });
        // 3. schema://{database}/{schema}/{table} — Full schema details
        this.mcpServer.resource('table_schema', new ResourceTemplate('schema://{database}/{schema}/{table}', { list: undefined }), { description: 'Full schema details for a specific table', mimeType: 'application/json' }, async (uri, variables) => {
            const database = String(variables.database);
            const schemaName = String(variables.schema);
            const table = String(variables.table);
            const result = await this.service.getSchema(database, schemaName, table);
            if (!result) {
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: 'application/json',
                            text: JSON.stringify({ error: `Schema not found: ${database}.${schemaName}.${table}` }, null, 2),
                        },
                    ],
                };
            }
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        });
    }
    // -----------------------------------------------------------------------
    // Prompts
    // -----------------------------------------------------------------------
    registerPrompts() {
        // 1. analyze_schema
        this.mcpServer.prompt('analyze_schema', 'Generate a prompt for analyzing a specific schema', {
            database: z.string().describe('Database name'),
            name: z.string().describe('Table or collection name'),
        }, async (args) => {
            const result = await this.service.getSchema(args.database, 'public', args.name);
            const schemaContext = result
                ? JSON.stringify(result, null, 2)
                : `Schema not found: ${args.database}.public.${args.name}`;
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: [
                                `Analyze the following database schema for the table "${args.name}" in database "${args.database}".`,
                                '',
                                'Consider:',
                                '1. Data model design and normalization',
                                '2. Potential performance issues',
                                '3. Missing indexes or constraints',
                                '4. Naming conventions',
                                '5. Suggestions for improvement',
                                '',
                                'Schema:',
                                '```json',
                                schemaContext,
                                '```',
                            ].join('\n'),
                        },
                    },
                ],
            };
        });
        // 2. compare_schemas
        this.mcpServer.prompt('compare_schemas', 'Generate a prompt for comparing two schemas', {
            database1: z.string().describe('First database name'),
            name1: z.string().describe('First table or collection name'),
            database2: z.string().describe('Second database name'),
            name2: z.string().describe('Second table or collection name'),
        }, async (args) => {
            const schema1 = await this.service.getSchema(args.database1, 'public', args.name1);
            const schema2 = await this.service.getSchema(args.database2, 'public', args.name2);
            const schema1Context = schema1
                ? JSON.stringify(schema1, null, 2)
                : `Schema not found: ${args.database1}.public.${args.name1}`;
            const schema2Context = schema2
                ? JSON.stringify(schema2, null, 2)
                : `Schema not found: ${args.database2}.public.${args.name2}`;
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: [
                                `Compare the following two database schemas:`,
                                '',
                                `## Schema 1: ${args.database1}.${args.name1}`,
                                '```json',
                                schema1Context,
                                '```',
                                '',
                                `## Schema 2: ${args.database2}.${args.name2}`,
                                '```json',
                                schema2Context,
                                '```',
                                '',
                                'Analyze:',
                                '1. Structural differences',
                                '2. Column/field type mismatches',
                                '3. Index coverage differences',
                                '4. Constraint differences',
                                '5. Recommendations for alignment or improvement',
                            ].join('\n'),
                        },
                    },
                ],
            };
        });
        // 3. suggest_indexes
        this.mcpServer.prompt('suggest_indexes', 'Generate a prompt for index optimization', {
            database: z.string().describe('Database name'),
            name: z.string().describe('Table or collection name'),
        }, async (args) => {
            const result = await this.service.getSchema(args.database, 'public', args.name);
            const schemaContext = result
                ? JSON.stringify(result, null, 2)
                : `Schema not found: ${args.database}.public.${args.name}`;
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: [
                                `Analyze the indexes for table "${args.name}" in database "${args.database}" and suggest optimizations.`,
                                '',
                                'Consider:',
                                '1. Current indexes and their coverage',
                                '2. Columns that may benefit from indexing (foreign keys, frequently queried columns)',
                                '3. Composite index opportunities',
                                '4. Redundant or duplicate indexes',
                                '5. Index type recommendations (B-tree, hash, GIN, GiST, etc.)',
                                '',
                                'Schema:',
                                '```json',
                                schemaContext,
                                '```',
                            ].join('\n'),
                        },
                    },
                ],
            };
        });
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Mask sensitive parts of connection strings (passwords, auth tokens)
 */
function maskConnectionString(connectionString) {
    try {
        const url = new URL(connectionString);
        if (url.password) {
            url.password = '***';
        }
        return url.toString();
    }
    catch {
        // Not a valid URL format, return with basic masking
        return connectionString.replace(/:[^:@/]+@/, ':***@');
    }
}
//# sourceMappingURL=mcp-server.js.map