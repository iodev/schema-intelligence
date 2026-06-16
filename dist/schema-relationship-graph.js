/**
 * Schema Relationship Graph
 *
 * Graph data structure modeling relationships between schema objects
 * across all supported database types (Postgres, MySQL, MongoDB, Redis, InfluxDB).
 */
// ---------------------------------------------------------------------------
// SchemaRelationshipGraph
// ---------------------------------------------------------------------------
export class SchemaRelationshipGraph {
    nodes = new Map();
    edges = new Map();
    adjacency = new Map();
    // -- Node operations ---------------------------------------------------
    addNode(node) {
        this.nodes.set(node.id, node);
        if (!this.adjacency.has(node.id)) {
            this.adjacency.set(node.id, { outEdges: new Set(), inEdges: new Set() });
        }
    }
    getNode(id) {
        return this.nodes.get(id);
    }
    removeNode(id) {
        // Remove all edges connected to this node
        const adj = this.adjacency.get(id);
        if (adj) {
            const edgeIds = new Set([...adj.outEdges, ...adj.inEdges]);
            for (const edgeId of edgeIds) {
                this.removeEdge(edgeId);
            }
        }
        this.nodes.delete(id);
        this.adjacency.delete(id);
    }
    // -- Edge operations ---------------------------------------------------
    addEdge(edge) {
        this.edges.set(edge.id, edge);
        // Ensure adjacency entries exist for both endpoints
        if (!this.adjacency.has(edge.source)) {
            this.adjacency.set(edge.source, { outEdges: new Set(), inEdges: new Set() });
        }
        if (!this.adjacency.has(edge.target)) {
            this.adjacency.set(edge.target, { outEdges: new Set(), inEdges: new Set() });
        }
        this.adjacency.get(edge.source).outEdges.add(edge.id);
        this.adjacency.get(edge.target).inEdges.add(edge.id);
    }
    getEdge(id) {
        return this.edges.get(id);
    }
    removeEdge(edgeId) {
        const edge = this.edges.get(edgeId);
        if (!edge)
            return;
        this.adjacency.get(edge.source)?.outEdges.delete(edgeId);
        this.adjacency.get(edge.target)?.inEdges.delete(edgeId);
        this.edges.delete(edgeId);
    }
    // -- Neighbor / edge queries -------------------------------------------
    getNeighbors(nodeId, direction = 'both') {
        const adj = this.adjacency.get(nodeId);
        if (!adj)
            return [];
        const neighborIds = new Set();
        if (direction === 'out' || direction === 'both') {
            for (const edgeId of adj.outEdges) {
                const edge = this.edges.get(edgeId);
                if (edge)
                    neighborIds.add(edge.target);
            }
        }
        if (direction === 'in' || direction === 'both') {
            for (const edgeId of adj.inEdges) {
                const edge = this.edges.get(edgeId);
                if (edge)
                    neighborIds.add(edge.source);
            }
        }
        // Don't include the node itself (handles self-referencing edges for 'both')
        neighborIds.delete(nodeId);
        const result = [];
        for (const nid of neighborIds) {
            const node = this.nodes.get(nid);
            if (node)
                result.push(node);
        }
        return result;
    }
    getEdges(nodeId, direction = 'both') {
        const adj = this.adjacency.get(nodeId);
        if (!adj)
            return [];
        const edgeIds = new Set();
        if (direction === 'out' || direction === 'both') {
            for (const eid of adj.outEdges)
                edgeIds.add(eid);
        }
        if (direction === 'in' || direction === 'both') {
            for (const eid of adj.inEdges)
                edgeIds.add(eid);
        }
        const result = [];
        for (const eid of edgeIds) {
            const edge = this.edges.get(eid);
            if (edge)
                result.push(edge);
        }
        return result;
    }
    // -- Traversals --------------------------------------------------------
    /**
     * BFS shortest path between two nodes (undirected traversal).
     * Returns the list of nodes along the path including `from` and `to`.
     * Returns empty array if no path exists.
     */
    findPath(from, to) {
        if (from === to) {
            const node = this.nodes.get(from);
            return node ? [node] : [];
        }
        const visited = new Set();
        const parent = new Map();
        const queue = [from];
        visited.add(from);
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = this.getAdjacentNodeIds(current);
            for (const neighborId of neighbors) {
                if (visited.has(neighborId))
                    continue;
                visited.add(neighborId);
                parent.set(neighborId, current);
                if (neighborId === to) {
                    // Reconstruct path
                    return this.reconstructPath(parent, from, to);
                }
                queue.push(neighborId);
            }
        }
        return []; // no path found
    }
    /**
     * All transitively connected nodes (connected component) containing nodeId.
     * Uses BFS with undirected traversal.
     */
    getConnectedComponent(nodeId) {
        if (!this.nodes.has(nodeId))
            return [];
        const visited = new Set();
        const queue = [nodeId];
        visited.add(nodeId);
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = this.getAdjacentNodeIds(current);
            for (const nid of neighbors) {
                if (!visited.has(nid)) {
                    visited.add(nid);
                    queue.push(nid);
                }
            }
        }
        const result = [];
        for (const nid of visited) {
            const node = this.nodes.get(nid);
            if (node)
                result.push(node);
        }
        return result;
    }
    /**
     * Subgraph within N hops of nodeId (undirected BFS).
     */
    getRelationshipChain(nodeId, maxDepth = 3) {
        if (!this.nodes.has(nodeId))
            return { nodes: [], edges: [] };
        const visitedNodes = new Set();
        const visitedEdges = new Set();
        const queue = [{ id: nodeId, depth: 0 }];
        visitedNodes.add(nodeId);
        while (queue.length > 0) {
            const { id: current, depth } = queue.shift();
            if (depth >= maxDepth)
                continue;
            const adj = this.adjacency.get(current);
            if (!adj)
                continue;
            const allEdgeIds = [...adj.outEdges, ...adj.inEdges];
            for (const edgeId of allEdgeIds) {
                const edge = this.edges.get(edgeId);
                if (!edge)
                    continue;
                visitedEdges.add(edgeId);
                const neighborId = edge.source === current ? edge.target : edge.source;
                if (!visitedNodes.has(neighborId)) {
                    visitedNodes.add(neighborId);
                    queue.push({ id: neighborId, depth: depth + 1 });
                }
            }
        }
        const nodes = [];
        for (const nid of visitedNodes) {
            const node = this.nodes.get(nid);
            if (node)
                nodes.push(node);
        }
        const edges = [];
        for (const eid of visitedEdges) {
            const edge = this.edges.get(eid);
            if (edge)
                edges.push(edge);
        }
        return { nodes, edges };
    }
    // -- Serialization -----------------------------------------------------
    toJSON() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: Array.from(this.edges.values()),
        };
    }
    static fromJSON(data) {
        const graph = new SchemaRelationshipGraph();
        for (const node of data.nodes) {
            graph.addNode(node);
        }
        for (const edge of data.edges) {
            graph.addEdge(edge);
        }
        return graph;
    }
    // -- Filtering / querying ----------------------------------------------
    /**
     * Return a new graph containing only nodes (and their interconnecting edges)
     * belonging to the specified database.
     */
    getDatabaseSubgraph(database) {
        const subgraph = new SchemaRelationshipGraph();
        const nodeIds = new Set();
        for (const node of this.nodes.values()) {
            if (node.database === database) {
                subgraph.addNode(node);
                nodeIds.add(node.id);
            }
        }
        for (const edge of this.edges.values()) {
            if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
                subgraph.addEdge(edge);
            }
        }
        return subgraph;
    }
    /**
     * Edges that cross database boundaries (source and target belong to different databases).
     */
    getCrossDatabaseEdges() {
        const result = [];
        for (const edge of this.edges.values()) {
            const sourceNode = this.nodes.get(edge.source);
            const targetNode = this.nodes.get(edge.target);
            if (sourceNode && targetNode && sourceNode.database !== targetNode.database) {
                result.push(edge);
            }
        }
        return result;
    }
    getNodesByType(type) {
        const result = [];
        for (const node of this.nodes.values()) {
            if (node.type === type)
                result.push(node);
        }
        return result;
    }
    stats() {
        const databases = new Set();
        for (const node of this.nodes.values()) {
            databases.add(node.database);
        }
        // Nodes with no edges at all
        const isolatedNodes = [];
        for (const [nodeId, adj] of this.adjacency) {
            if (adj.outEdges.size === 0 && adj.inEdges.size === 0 && this.nodes.has(nodeId)) {
                isolatedNodes.push(nodeId);
            }
        }
        return {
            nodeCount: this.nodes.size,
            edgeCount: this.edges.size,
            databases: Array.from(databases).sort(),
            isolatedNodes,
        };
    }
    // -- Private helpers ---------------------------------------------------
    /**
     * Get all adjacent node IDs (undirected) — used by BFS helpers.
     */
    getAdjacentNodeIds(nodeId) {
        const adj = this.adjacency.get(nodeId);
        if (!adj)
            return [];
        const ids = new Set();
        for (const edgeId of adj.outEdges) {
            const edge = this.edges.get(edgeId);
            if (edge)
                ids.add(edge.target);
        }
        for (const edgeId of adj.inEdges) {
            const edge = this.edges.get(edgeId);
            if (edge)
                ids.add(edge.source);
        }
        ids.delete(nodeId); // ignore self-loops for traversal
        return Array.from(ids);
    }
    reconstructPath(parent, from, to) {
        const path = [];
        let current = to;
        while (current !== undefined) {
            const node = this.nodes.get(current);
            if (node)
                path.unshift(node);
            if (current === from)
                break;
            current = parent.get(current);
        }
        return path;
    }
}
// ---------------------------------------------------------------------------
// Graph building from crawled metadata
// ---------------------------------------------------------------------------
/**
 * Build a SchemaRelationshipGraph from an array of crawled SchemaMetadata.
 *
 * - Postgres / MySQL: extracts FK relationships from constraints and columns.
 * - MongoDB: heuristic detection of `_id` / `Id` suffixed fields matching collection names.
 * - Redis: heuristic detection of key patterns referencing table/collection names.
 * - InfluxDB: nodes for measurements inside buckets.
 */
export function buildGraphFromMetadata(metadatas) {
    const graph = new SchemaRelationshipGraph();
    // First pass: create all nodes and collect name lookup maps for heuristic matching
    const collectionNames = new Set(); // lowercase collection / table names
    const nodeIdByName = new Map(); // lowercase name -> node ID (first wins)
    for (const meta of metadatas) {
        switch (meta.type) {
            case 'postgresql':
            case 'mysql': {
                const dbType = meta.type === 'postgresql' ? 'postgres' : 'mysql';
                const schema = meta.schema.schema ?? 'public';
                const nodeId = `${dbType}:${meta.database}.${schema}.${meta.schema.tableName}`;
                graph.addNode({
                    id: nodeId,
                    database: meta.database,
                    type: 'table',
                    dbType,
                    name: meta.schema.tableName,
                    schema,
                    metadata: meta,
                });
                const lowerName = meta.schema.tableName.toLowerCase();
                collectionNames.add(lowerName);
                if (!nodeIdByName.has(lowerName)) {
                    nodeIdByName.set(lowerName, nodeId);
                }
                break;
            }
            case 'mongodb': {
                const nodeId = `mongodb:${meta.database}.${meta.schema.collectionName}`;
                graph.addNode({
                    id: nodeId,
                    database: meta.database,
                    type: 'collection',
                    dbType: 'mongodb',
                    name: meta.schema.collectionName,
                    metadata: meta,
                });
                const lowerName = meta.schema.collectionName.toLowerCase();
                collectionNames.add(lowerName);
                if (!nodeIdByName.has(lowerName)) {
                    nodeIdByName.set(lowerName, nodeId);
                }
                break;
            }
            case 'redis': {
                for (const pattern of meta.schema.patterns) {
                    const nodeId = `redis:${meta.database}.${pattern.pattern}`;
                    graph.addNode({
                        id: nodeId,
                        database: meta.database,
                        type: 'key_pattern',
                        dbType: 'redis',
                        name: pattern.pattern,
                        metadata: meta,
                    });
                }
                break;
            }
            case 'influxdb': {
                for (const measurement of meta.schema.measurements) {
                    const nodeId = `influxdb:${meta.database}.${measurement.name}`;
                    graph.addNode({
                        id: nodeId,
                        database: meta.database,
                        type: 'measurement',
                        dbType: 'influxdb',
                        name: measurement.name,
                        metadata: meta,
                    });
                    const lowerName = measurement.name.toLowerCase();
                    collectionNames.add(lowerName);
                    if (!nodeIdByName.has(lowerName)) {
                        nodeIdByName.set(lowerName, nodeId);
                    }
                }
                break;
            }
        }
    }
    // Second pass: create edges
    let edgeCounter = 0;
    const nextEdgeId = () => `edge-${++edgeCounter}`;
    for (const meta of metadatas) {
        switch (meta.type) {
            case 'postgresql':
            case 'mysql': {
                const dbType = meta.type === 'postgresql' ? 'postgres' : 'mysql';
                const schema = meta.schema.schema ?? 'public';
                const sourceNodeId = `${dbType}:${meta.database}.${schema}.${meta.schema.tableName}`;
                // Extract FK from columns (they have foreignKeyTarget)
                // Track added edges so the constraint pass can skip duplicates
                const addedColumnFKs = new Set();
                for (const col of meta.schema.columns) {
                    if (col.isForeignKey && col.foreignKeyTarget) {
                        // foreignKeyTarget.table is usually "schema.table"
                        const fkTable = col.foreignKeyTarget.table;
                        const fkColumn = col.foreignKeyTarget.column;
                        // Build target node ID
                        let targetNodeId;
                        if (fkTable.includes('.')) {
                            targetNodeId = `${dbType}:${meta.database}.${fkTable}`;
                        }
                        else {
                            targetNodeId = `${dbType}:${meta.database}.${schema}.${fkTable}`;
                        }
                        // Only add edge if target node exists in graph
                        if (graph.getNode(targetNodeId)) {
                            graph.addEdge({
                                id: nextEdgeId(),
                                source: sourceNodeId,
                                target: targetNodeId,
                                relationship: 'foreign_key',
                                label: `${meta.schema.tableName}.${col.name} -> ${fkTable}.${fkColumn}`,
                                metadata: {
                                    sourceColumn: col.name,
                                    targetColumn: fkColumn,
                                },
                            });
                            addedColumnFKs.add(`${sourceNodeId}|${targetNodeId}|${col.name}`);
                        }
                    }
                }
                // Second pass: extract FK relationships from table constraints
                // This catches constraints not reflected in column foreignKeyTarget
                const fkDefinitionRegex = /REFERENCES\s+(\S+)\s*\(\s*(\S+)\s*\)/i;
                for (const constraint of meta.schema.constraints) {
                    if (constraint.type !== 'FOREIGN KEY')
                        continue;
                    const match = fkDefinitionRegex.exec(constraint.definition);
                    if (!match)
                        continue;
                    const fkTable = match[1];
                    const fkColumn = match[2];
                    const sourceColumn = constraint.columns[0]; // first column in the constraint
                    // Build target node ID the same way as the column-based code
                    let targetNodeId;
                    if (fkTable.includes('.')) {
                        targetNodeId = `${dbType}:${meta.database}.${fkTable}`;
                    }
                    else {
                        targetNodeId = `${dbType}:${meta.database}.${schema}.${fkTable}`;
                    }
                    // Skip if this edge was already added from the column pass
                    const edgeKey = `${sourceNodeId}|${targetNodeId}|${sourceColumn}`;
                    if (addedColumnFKs.has(edgeKey))
                        continue;
                    // Only add edge if target node exists in graph
                    if (graph.getNode(targetNodeId)) {
                        graph.addEdge({
                            id: nextEdgeId(),
                            source: sourceNodeId,
                            target: targetNodeId,
                            relationship: 'foreign_key',
                            label: `${meta.schema.tableName}.${sourceColumn} -> ${fkTable}.${fkColumn}`,
                            metadata: {
                                sourceColumn,
                                targetColumn: fkColumn,
                            },
                        });
                    }
                }
                break;
            }
            case 'mongodb': {
                const sourceNodeId = `mongodb:${meta.database}.${meta.schema.collectionName}`;
                for (const field of meta.schema.fields) {
                    // Skip _id field itself
                    if (field.name === '_id')
                        continue;
                    // Detect fields ending in _id or Id that reference other collections
                    const refName = extractReferenceName(field.name);
                    if (refName) {
                        // Try to find a matching collection node
                        const lowerRef = refName.toLowerCase();
                        // Try exact match first, then plural/singular
                        const candidates = [
                            lowerRef,
                            lowerRef + 's', // singular -> plural
                            lowerRef.replace(/s$/, ''), // plural -> singular
                        ];
                        for (const candidate of candidates) {
                            const targetId = nodeIdByName.get(candidate);
                            if (targetId && targetId !== sourceNodeId) {
                                graph.addEdge({
                                    id: nextEdgeId(),
                                    source: sourceNodeId,
                                    target: targetId,
                                    relationship: 'references',
                                    label: `${meta.schema.collectionName}.${field.name} -> ${candidate}`,
                                    metadata: { sourceField: field.name },
                                });
                                break; // stop on first match
                            }
                        }
                    }
                    // Detect $ref-like patterns in field names
                    if (field.name === '$ref' || field.name.endsWith('.$ref')) {
                        // Use commonValue if it looks like a collection name
                        if (typeof field.commonValue === 'string') {
                            const targetId = nodeIdByName.get(field.commonValue.toLowerCase());
                            if (targetId && targetId !== sourceNodeId) {
                                graph.addEdge({
                                    id: nextEdgeId(),
                                    source: sourceNodeId,
                                    target: targetId,
                                    relationship: 'references',
                                    label: `${meta.schema.collectionName}.${field.name} -> ${field.commonValue}`,
                                    metadata: { sourceField: field.name },
                                });
                            }
                        }
                    }
                }
                break;
            }
            case 'redis': {
                for (const pattern of meta.schema.patterns) {
                    const sourceNodeId = `redis:${meta.database}.${pattern.pattern}`;
                    // Extract base name segments from pattern and try to match
                    const segments = pattern.pattern
                        .replace(/:\*$/, '') // remove trailing :*
                        .replace(/\*/g, '') // remove remaining wildcards
                        .split(':')
                        .filter(Boolean);
                    for (const segment of segments) {
                        const lowerSeg = segment.toLowerCase();
                        // Check if this segment references a known table/collection
                        const candidates = [
                            lowerSeg,
                            lowerSeg + 's',
                            lowerSeg.replace(/s$/, ''),
                        ];
                        for (const candidate of candidates) {
                            const targetId = nodeIdByName.get(candidate);
                            if (targetId) {
                                graph.addEdge({
                                    id: nextEdgeId(),
                                    source: sourceNodeId,
                                    target: targetId,
                                    relationship: 'caches',
                                    label: `${pattern.pattern} caches ${candidate}`,
                                    metadata: { pattern: pattern.pattern },
                                });
                                break;
                            }
                        }
                    }
                }
                break;
            }
            case 'influxdb': {
                // InfluxDB measurements are already nodes; no automatic edges
                // unless measurement names reference table names (edge case)
                break;
            }
        }
    }
    return graph;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Extract a potential collection/table reference name from a field name.
 * Handles patterns like: `user_id` -> `user`, `userId` -> `user`,
 * `author_id` -> `author`, `authorId` -> `author`
 */
function extractReferenceName(fieldName) {
    // Pattern: something_id
    if (fieldName.endsWith('_id')) {
        const base = fieldName.slice(0, -3);
        return base.length > 0 ? base : null;
    }
    // Pattern: somethingId (camelCase)
    if (fieldName.endsWith('Id') && fieldName.length > 2) {
        const base = fieldName.slice(0, -2);
        return base.length > 0 ? base : null;
    }
    return null;
}
//# sourceMappingURL=schema-relationship-graph.js.map