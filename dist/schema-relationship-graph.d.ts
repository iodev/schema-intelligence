/**
 * Schema Relationship Graph
 *
 * Graph data structure modeling relationships between schema objects
 * across all supported database types (Postgres, MySQL, MongoDB, Redis, InfluxDB).
 */
import type { SchemaMetadata } from './types.js';
export interface SchemaNode {
    id: string;
    database: string;
    type: 'table' | 'collection' | 'key_pattern' | 'measurement' | 'view';
    dbType: 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'influxdb';
    name: string;
    schema?: string;
    metadata?: SchemaMetadata;
}
export interface SchemaEdge {
    id: string;
    source: string;
    target: string;
    relationship: 'foreign_key' | 'references' | 'embeds' | 'caches' | 'derives_from' | 'indexes';
    label?: string;
    metadata?: Record<string, unknown>;
}
export interface GraphStats {
    nodeCount: number;
    edgeCount: number;
    databases: string[];
    isolatedNodes: string[];
}
export declare class SchemaRelationshipGraph {
    private nodes;
    private edges;
    private adjacency;
    addNode(node: SchemaNode): void;
    getNode(id: string): SchemaNode | undefined;
    removeNode(id: string): void;
    addEdge(edge: SchemaEdge): void;
    getEdge(id: string): SchemaEdge | undefined;
    private removeEdge;
    getNeighbors(nodeId: string, direction?: 'in' | 'out' | 'both'): SchemaNode[];
    getEdges(nodeId: string, direction?: 'in' | 'out' | 'both'): SchemaEdge[];
    /**
     * BFS shortest path between two nodes (undirected traversal).
     * Returns the list of nodes along the path including `from` and `to`.
     * Returns empty array if no path exists.
     */
    findPath(from: string, to: string): SchemaNode[];
    /**
     * All transitively connected nodes (connected component) containing nodeId.
     * Uses BFS with undirected traversal.
     */
    getConnectedComponent(nodeId: string): SchemaNode[];
    /**
     * Subgraph within N hops of nodeId (undirected BFS).
     */
    getRelationshipChain(nodeId: string, maxDepth?: number): {
        nodes: SchemaNode[];
        edges: SchemaEdge[];
    };
    toJSON(): {
        nodes: SchemaNode[];
        edges: SchemaEdge[];
    };
    static fromJSON(data: {
        nodes: SchemaNode[];
        edges: SchemaEdge[];
    }): SchemaRelationshipGraph;
    /**
     * Return a new graph containing only nodes (and their interconnecting edges)
     * belonging to the specified database.
     */
    getDatabaseSubgraph(database: string): SchemaRelationshipGraph;
    /**
     * Edges that cross database boundaries (source and target belong to different databases).
     */
    getCrossDatabaseEdges(): SchemaEdge[];
    getNodesByType(type: SchemaNode['type']): SchemaNode[];
    stats(): GraphStats;
    /**
     * Get all adjacent node IDs (undirected) — used by BFS helpers.
     */
    private getAdjacentNodeIds;
    private reconstructPath;
}
/**
 * Build a SchemaRelationshipGraph from an array of crawled SchemaMetadata.
 *
 * - Postgres / MySQL: extracts FK relationships from constraints and columns.
 * - MongoDB: heuristic detection of `_id` / `Id` suffixed fields matching collection names.
 * - Redis: heuristic detection of key patterns referencing table/collection names.
 * - InfluxDB: nodes for measurements inside buckets.
 */
export declare function buildGraphFromMetadata(metadatas: SchemaMetadata[]): SchemaRelationshipGraph;
//# sourceMappingURL=schema-relationship-graph.d.ts.map