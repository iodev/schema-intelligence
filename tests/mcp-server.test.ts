/**
 * Tests for MCP Server
 *
 * Tests tool registration, tool handlers, resource handlers, and prompt
 * generation using the MCP SDK's in-memory transport with a real
 * Client ↔ Server connection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SchemaIntelligenceMCPServer } from '../src/mcp-server.js';
import type { SchemaIntelligenceService } from '../src/schema-intelligence-service.js';
import type { SchemaCrawlerConfig, ChangeHistoryEntry } from '../src/types.js';
import {
    SchemaRelationshipGraph,
    type SchemaNode,
    type SchemaEdge,
} from '../src/schema-relationship-graph.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TextContent {
    type: 'text';
    text: string;
}

function parseToolResult(result: { content: unknown[] }): unknown {
    const content = result.content[0] as TextContent;
    return JSON.parse(content.text);
}

function getToolText(result: { content: unknown[] }): string {
    const content = result.content[0] as TextContent;
    return content.text;
}

// ── Mock data ───────────────────────────────────────────────────────────────

const mockSchemas: Record<string, unknown>[] = [
    {
        schemaId: 'testdb.public.users',
        type: 'postgresql',
        database: 'testdb',
        objectName: 'users',
        fullName: 'public.users',
        description: 'User accounts table',
        schema: {
            tableName: 'users',
            columns: [
                { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true },
                { name: 'email', type: 'varchar(255)', nullable: false, isPrimaryKey: false },
            ],
            indexes: [
                { name: 'users_pkey', columns: ['id'], isUnique: true, isPrimary: true },
            ],
            constraints: [],
        },
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
        schema: {
            tableName: 'orders',
            columns: [
                { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true },
                { name: 'user_id', type: 'integer', nullable: false, isPrimaryKey: false },
            ],
            indexes: [],
            constraints: [],
        },
        lastScanned: '2025-01-01T00:00:00.000Z',
        checksum: 'def456',
    },
];

const mockConfig: SchemaCrawlerConfig = {
    databases: [
        {
            type: 'postgresql',
            connectionString: 'postgresql://user:secret@localhost:5432/testdb',
        },
        {
            type: 'mongodb',
            connectionString: 'mongodb://user:pass@localhost:27017/analytics',
        },
    ],
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'schema-intelligence',
    embeddingModel: 'simple',
};

const mockChangeHistory: ChangeHistoryEntry[] = [
    {
        id: 'change-1',
        schemaId: 'testdb.public.users',
        database: 'testdb',
        objectName: 'users',
        changeType: 'modified',
        diff: {
            schemaId: 'testdb.public.users',
            database: 'testdb',
            objectName: 'users',
            before: null,
            after: null,
            changes: [
                { path: 'columns.status', type: 'added', newValue: { name: 'status', type: 'varchar(50)' } },
            ],
            detectedAt: new Date('2025-06-01T12:00:00Z'),
        },
        timestamp: new Date('2025-06-01T12:00:00Z'),
    },
];

// ── Mock graph ──────────────────────────────────────────────────────────────

function createMockGraph(): SchemaRelationshipGraph {
    const nodes: SchemaNode[] = [
        {
            id: 'postgres:testdb.public.users',
            database: 'testdb',
            type: 'table',
            dbType: 'postgres',
            name: 'users',
            schema: 'public',
        },
        {
            id: 'postgres:testdb.public.orders',
            database: 'testdb',
            type: 'table',
            dbType: 'postgres',
            name: 'orders',
            schema: 'public',
        },
    ];

    const edges: SchemaEdge[] = [
        {
            id: 'edge-1',
            source: 'postgres:testdb.public.orders',
            target: 'postgres:testdb.public.users',
            relationship: 'foreign_key',
            label: 'orders.user_id -> users.id',
        },
    ];

    return SchemaRelationshipGraph.fromJSON({ nodes, edges });
}

// ── Mock service ────────────────────────────────────────────────────────────

function createMockService(graphOverride?: SchemaRelationshipGraph): SchemaIntelligenceService {
    return {
        getStats: async () => ({
            totalSchemas: 2,
            databases: { testdb: 2 },
            lastScan: new Date('2025-01-01T00:00:00.000Z'),
        }),
        scanAllDatabases: async () => {
            /* no-op */
        },
        getDatabaseSchemas: async (database: string) => {
            return mockSchemas.filter(
                (s) => (s as Record<string, unknown>).database === database,
            );
        },
        getSchema: async (database: string, schema: string, table: string) => {
            const id = `${database}.${schema}.${table}`;
            return (
                (mockSchemas.find(
                    (s) => (s as Record<string, unknown>).schemaId === id,
                ) as Record<string, unknown> | undefined) ?? null
            );
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
        getRelationshipGraph: () => {
            if (graphOverride) return graphOverride;
            // Return empty graph
            return SchemaRelationshipGraph.fromJSON({ nodes: [], edges: [] });
        },
        getRecentChanges: async (_since?: Date, _limit?: number) => {
            return mockChangeHistory;
        },
        getChangeHistory: async (_schemaId: string, _limit?: number) => {
            return mockChangeHistory;
        },
        shutdown: async () => {
            /* no-op */
        },
        initialize: async () => {
            /* no-op */
        },
        stopPeriodicScanning: () => {
            /* no-op */
        },
    } as unknown as SchemaIntelligenceService;
}

// ── Helper: connect MCP client ↔ server ─────────────────────────────────

async function createConnectedPair(
    graphOverride?: SchemaRelationshipGraph,
): Promise<{ client: Client; mcpServer: SchemaIntelligenceMCPServer; cleanup: () => Promise<void> }> {
    const mockService = createMockService(graphOverride);
    const mcpServer = new SchemaIntelligenceMCPServer({
        service: mockService,
        config: mockConfig,
    });

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await mcpServer.getServer().connect(serverTransport);
    await client.connect(clientTransport);

    return {
        client,
        mcpServer,
        cleanup: async () => {
            await client.close();
            await mcpServer.close();
        },
    };
}

// ── Tests: Tool registration ────────────────────────────────────────────────

describe('MCP Server – tool registration', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should register all 8 tools', async () => {
        const result = await client.listTools();
        const toolNames = result.tools.map((t) => t.name).sort();

        assert.deepEqual(toolNames, [
            'get_database_schema',
            'get_recent_changes',
            'get_relationships',
            'get_schema_stats',
            'list_database_schemas',
            'list_databases',
            'rescan_schemas',
            'search_database_schemas',
        ]);
    });

    it('search_database_schemas should have correct input schema', async () => {
        const result = await client.listTools();
        const tool = result.tools.find((t) => t.name === 'search_database_schemas');
        assert.ok(tool);
        assert.equal(tool.inputSchema.type, 'object');
        const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
        assert.ok(props.query);
        assert.ok(props.limit);
        assert.ok(props.database);
    });

    it('get_database_schema should have correct input schema', async () => {
        const result = await client.listTools();
        const tool = result.tools.find((t) => t.name === 'get_database_schema');
        assert.ok(tool);
        const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
        assert.ok(props.database);
        assert.ok(props.name);
        assert.ok(props.schema); // optional
    });

    it('get_relationships should have correct input schema', async () => {
        const result = await client.listTools();
        const tool = result.tools.find((t) => t.name === 'get_relationships');
        assert.ok(tool);
        const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
        assert.ok(props.database);
        assert.ok(props.name);
        assert.ok(props.depth);
    });
});

// ── Tests: search_database_schemas tool handler ──────────────────────────────────────

describe('MCP Server – search_database_schemas tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return search results', async () => {
        const result = await client.callTool({
            name: 'search_database_schemas',
            arguments: { query: 'user accounts', limit: 5 },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
        assert.ok(parsed.length > 0);
        assert.equal(parsed[0].id, 'testdb.public.users');
        assert.equal(typeof parsed[0].score, 'number');
    });

    it('should respect limit parameter', async () => {
        const result = await client.callTool({
            name: 'search_database_schemas',
            arguments: { query: 'test', limit: 1 },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as unknown[];
        assert.equal(parsed.length, 1);
    });

    it('should filter by database when provided', async () => {
        const result = await client.callTool({
            name: 'search_database_schemas',
            arguments: { query: 'test', database: 'testdb' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
    });
});

// ── Tests: get_database_schema tool handler ──────────────────────────────────────────

describe('MCP Server – get_database_schema tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return schema details for existing table', async () => {
        const result = await client.callTool({
            name: 'get_database_schema',
            arguments: { database: 'testdb', schema: 'public', name: 'users' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Record<string, unknown>;
        assert.equal(parsed.objectName, 'users');
        assert.equal(parsed.database, 'testdb');
    });

    it('should use default schema "public" when not provided', async () => {
        const result = await client.callTool({
            name: 'get_database_schema',
            arguments: { database: 'testdb', name: 'users' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Record<string, unknown>;
        assert.equal(parsed.objectName, 'users');
    });

    it('should return error for non-existent table', async () => {
        const result = await client.callTool({
            name: 'get_database_schema',
            arguments: { database: 'testdb', schema: 'public', name: 'nonexistent' },
        });

        const castResult = result as { content: unknown[]; isError?: boolean };
        assert.equal(castResult.isError, true);
        const text = getToolText(castResult);
        assert.ok(text.includes('Schema not found'));
    });
});

// ── Tests: list_databases tool handler ──────────────────────────────────────

describe('MCP Server – list_databases tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return configured databases', async () => {
        const result = await client.callTool({
            name: 'list_databases',
            arguments: {},
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 2);
        assert.equal(parsed[0].type, 'postgresql');
        assert.equal(parsed[1].type, 'mongodb');
    });

    it('should mask passwords in connection strings', async () => {
        const result = await client.callTool({
            name: 'list_databases',
            arguments: {},
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, string>>;
        for (const db of parsed) {
            assert.ok(!db.connectionString.includes('secret'), 'Password should be masked');
            assert.ok(!db.connectionString.includes('pass'), 'Password should be masked');
        }
    });
});

// ── Tests: list_database_schemas tool handler ────────────────────────────────────────

describe('MCP Server – list_database_schemas tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return schema summaries for a database', async () => {
        const result = await client.callTool({
            name: 'list_database_schemas',
            arguments: { database: 'testdb' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 2);
        assert.ok(parsed[0].objectName);
        assert.ok(parsed[0].fullName);
    });
});

// ── Tests: get_relationships tool handler ───────────────────────────────────

describe('MCP Server – get_relationships tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const graph = await createMockGraph();
        const pair = await createConnectedPair(graph);
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return relationship subgraph for existing node', async () => {
        const result = await client.callTool({
            name: 'get_relationships',
            arguments: { database: 'testdb', name: 'users' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as {
            nodes: SchemaNode[];
            edges: SchemaEdge[];
        };
        assert.ok(parsed.nodes);
        assert.ok(parsed.edges);
        assert.ok(parsed.nodes.length >= 1);
        assert.ok(parsed.edges.length >= 1);

        // Verify the FK relationship is included
        const fkEdge = parsed.edges.find((e) => e.relationship === 'foreign_key');
        assert.ok(fkEdge, 'Should have a foreign_key edge');
        assert.ok(fkEdge.label?.includes('orders.user_id'));
    });

    it('should return error for non-existent node', async () => {
        const result = await client.callTool({
            name: 'get_relationships',
            arguments: { database: 'testdb', name: 'nonexistent' },
        });

        const castResult = result as { content: unknown[]; isError?: boolean };
        assert.equal(castResult.isError, true);
        const text = getToolText(castResult);
        assert.ok(text.includes('No schema node found'));
    });
});

// ── Tests: get_recent_changes tool handler ──────────────────────────────────

describe('MCP Server – get_recent_changes tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return recent changes', async () => {
        const result = await client.callTool({
            name: 'get_recent_changes',
            arguments: {},
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].objectName, 'users');
        assert.equal(parsed[0].changeType, 'modified');
    });

    it('should filter by database when provided', async () => {
        const result = await client.callTool({
            name: 'get_recent_changes',
            arguments: { database: 'nonexistent' },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as unknown[];
        assert.equal(parsed.length, 0);
    });

    it('should include change details', async () => {
        const result = await client.callTool({
            name: 'get_recent_changes',
            arguments: { limit: 10 },
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Array<{
            changes: Array<{ path: string; type: string }>;
        }>;
        assert.ok(parsed[0].changes);
        assert.ok(parsed[0].changes.length > 0);
        assert.equal(parsed[0].changes[0].path, 'columns.status');
        assert.equal(parsed[0].changes[0].type, 'added');
    });
});

// ── Tests: rescan_schemas tool handler ───────────────────────────────────────

describe('MCP Server – rescan_schemas tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should trigger a scan and return results', async () => {
        const result = await client.callTool({
            name: 'rescan_schemas',
            arguments: {},
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Record<string, unknown>;
        assert.equal(parsed.message, 'Scan completed successfully');
        assert.equal(parsed.totalSchemas, 2);
    });
});

// ── Tests: get_schema_stats tool handler ────────────────────────────────────

describe('MCP Server – get_schema_stats tool', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should return service statistics', async () => {
        const result = await client.callTool({
            name: 'get_schema_stats',
            arguments: {},
        });

        const parsed = parseToolResult(result as { content: unknown[] }) as Record<string, unknown>;
        assert.equal(parsed.totalSchemas, 2);
        assert.deepEqual(parsed.databases, { testdb: 2 });
    });
});

// ── Tests: Resource handlers ────────────────────────────────────────────────

describe('MCP Server – resources', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should list static resources', async () => {
        const result = await client.listResources();
        assert.ok(result.resources.length >= 1);
        const dbResource = result.resources.find((r) => r.uri === 'schema://databases');
        assert.ok(dbResource, 'Should have a schema://databases resource');
    });

    it('should list resource templates', async () => {
        const result = await client.listResourceTemplates();
        assert.ok(result.resourceTemplates.length >= 2);

        const overviewTemplate = result.resourceTemplates.find((t) =>
            t.uriTemplate.includes('{database}/overview'),
        );
        assert.ok(overviewTemplate, 'Should have a database overview template');

        const tableTemplate = result.resourceTemplates.find((t) =>
            t.uriTemplate.includes('{table}'),
        );
        assert.ok(tableTemplate, 'Should have a table schema template');
    });

    it('should read databases resource', async () => {
        const result = await client.readResource({ uri: 'schema://databases' });
        assert.ok(result.contents.length > 0);

        const content = result.contents[0];
        assert.ok('text' in content);
        const parsed = JSON.parse((content as { text: string }).text) as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].name, 'testdb');
        assert.equal(parsed[0].schemaCount, 2);
    });

    it('should read database overview resource', async () => {
        const result = await client.readResource({
            uri: 'schema://testdb/overview',
        });
        assert.ok(result.contents.length > 0);

        const content = result.contents[0];
        assert.ok('text' in content);
        const parsed = JSON.parse((content as { text: string }).text) as Record<string, unknown>;
        assert.equal(parsed.database, 'testdb');
        assert.equal(parsed.tableCount, 2);
        assert.ok(Array.isArray(parsed.tables));
    });

    it('should read table schema resource', async () => {
        const result = await client.readResource({
            uri: 'schema://testdb/public/users',
        });
        assert.ok(result.contents.length > 0);

        const content = result.contents[0];
        assert.ok('text' in content);
        const parsed = JSON.parse((content as { text: string }).text) as Record<string, unknown>;
        assert.equal(parsed.objectName, 'users');
    });

    it('should handle missing table schema resource gracefully', async () => {
        const result = await client.readResource({
            uri: 'schema://testdb/public/nonexistent',
        });
        assert.ok(result.contents.length > 0);

        const content = result.contents[0];
        assert.ok('text' in content);
        const parsed = JSON.parse((content as { text: string }).text) as Record<string, unknown>;
        assert.ok(parsed.error);
    });
});

// ── Tests: Prompt generation ────────────────────────────────────────────────

describe('MCP Server – prompts', () => {
    let client: Client;
    let cleanup: () => Promise<void>;

    before(async () => {
        const pair = await createConnectedPair();
        client = pair.client;
        cleanup = pair.cleanup;
    });

    after(async () => {
        await cleanup();
    });

    it('should list all prompts', async () => {
        const result = await client.listPrompts();
        const promptNames = result.prompts.map((p) => p.name).sort();

        assert.deepEqual(promptNames, [
            'analyze_schema',
            'compare_schemas',
            'suggest_indexes',
        ]);
    });

    it('analyze_schema prompt should have correct arguments', async () => {
        const result = await client.listPrompts();
        const prompt = result.prompts.find((p) => p.name === 'analyze_schema');
        assert.ok(prompt);
        assert.ok(prompt.arguments);
        const argNames = prompt.arguments.map((a) => a.name).sort();
        assert.deepEqual(argNames, ['database', 'name']);
    });

    it('compare_schemas prompt should have correct arguments', async () => {
        const result = await client.listPrompts();
        const prompt = result.prompts.find((p) => p.name === 'compare_schemas');
        assert.ok(prompt);
        assert.ok(prompt.arguments);
        const argNames = prompt.arguments.map((a) => a.name).sort();
        assert.deepEqual(argNames, ['database1', 'database2', 'name1', 'name2']);
    });

    it('suggest_indexes prompt should have correct arguments', async () => {
        const result = await client.listPrompts();
        const prompt = result.prompts.find((p) => p.name === 'suggest_indexes');
        assert.ok(prompt);
        assert.ok(prompt.arguments);
        const argNames = prompt.arguments.map((a) => a.name).sort();
        assert.deepEqual(argNames, ['database', 'name']);
    });

    it('analyze_schema should generate a prompt with schema context', async () => {
        const result = await client.getPrompt({
            name: 'analyze_schema',
            arguments: { database: 'testdb', name: 'users' },
        });

        assert.ok(result.messages.length > 0);
        assert.equal(result.messages[0].role, 'user');

        const content = result.messages[0].content;
        assert.equal(content.type, 'text');
        const text = (content as { text: string }).text;
        assert.ok(text.includes('Analyze the following database schema'));
        assert.ok(text.includes('users'));
        // Should include schema JSON
        assert.ok(text.includes('users_pkey'));
    });

    it('compare_schemas should generate a prompt with both schemas', async () => {
        const result = await client.getPrompt({
            name: 'compare_schemas',
            arguments: {
                database1: 'testdb',
                name1: 'users',
                database2: 'testdb',
                name2: 'orders',
            },
        });

        assert.ok(result.messages.length > 0);
        const text = (result.messages[0].content as { text: string }).text;
        assert.ok(text.includes('Compare the following two database schemas'));
        assert.ok(text.includes('Schema 1'));
        assert.ok(text.includes('Schema 2'));
        assert.ok(text.includes('users'));
        assert.ok(text.includes('orders'));
    });

    it('suggest_indexes should generate a prompt with index analysis context', async () => {
        const result = await client.getPrompt({
            name: 'suggest_indexes',
            arguments: { database: 'testdb', name: 'users' },
        });

        assert.ok(result.messages.length > 0);
        const text = (result.messages[0].content as { text: string }).text;
        assert.ok(text.includes('Analyze the indexes'));
        assert.ok(text.includes('users'));
        assert.ok(text.includes('users_pkey'));
    });

    it('analyze_schema should handle non-existent schema gracefully', async () => {
        const result = await client.getPrompt({
            name: 'analyze_schema',
            arguments: { database: 'testdb', name: 'nonexistent' },
        });

        assert.ok(result.messages.length > 0);
        const text = (result.messages[0].content as { text: string }).text;
        assert.ok(text.includes('Schema not found'));
    });
});
