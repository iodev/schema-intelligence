/**
 * Schema Intelligence MCP Server
 *
 * Model Context Protocol server that exposes Schema Intelligence functionality
 * to AI tools (Claude, Cursor, etc.) via tools, resources, and prompts.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SchemaIntelligenceService } from './schema-intelligence-service.js';
import type { SchemaCrawlerConfig } from './types.js';
export interface MCPServerOptions {
    service: SchemaIntelligenceService;
    config: SchemaCrawlerConfig;
}
export declare class SchemaIntelligenceMCPServer {
    private mcpServer;
    private service;
    private config;
    constructor(options: MCPServerOptions);
    /**
     * Start the MCP server using stdio transport
     */
    start(): Promise<void>;
    /**
     * Close the MCP server
     */
    close(): Promise<void>;
    /**
     * Get the underlying McpServer instance (useful for testing)
     */
    getServer(): McpServer;
    private registerTools;
    private registerResources;
    private registerPrompts;
}
//# sourceMappingURL=mcp-server.d.ts.map