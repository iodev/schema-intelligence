/**
 * Tests for SchemaRelationshipGraph and buildGraphFromMetadata
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SchemaRelationshipGraph,
    SchemaNode,
    SchemaEdge,
    buildGraphFromMetadata,
} from '../src/schema-relationship-graph.js';
import type {
    SchemaMetadata,
    PostgresSchemaMetadata,
    MongoSchemaMetadata,
    RedisSchemaMetadata,
    TableSchema,
    MongoCollectionSchema,
    RedisPatternSchema,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<SchemaNode> = {}): SchemaNode {
    return {
        id,
        database: 'testdb',
        type: 'table',
        dbType: 'postgres',
        name: id,
        ...overrides,
    };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<SchemaEdge> = {}): SchemaEdge {
    return {
        id,
        source,
        target,
        relationship: 'foreign_key',
        ...overrides,
    };
}

function makeTableSchema(overrides: Partial<TableSchema> = {}): TableSchema {
    return {
        database: 'testdb',
        schema: 'public',
        tableName: 'users',
        columns: [],
        indexes: [],
        constraints: [],
        ...overrides,
    };
}

function makePostgresMeta(
    tableName: string,
    tableOverrides: Partial<TableSchema> = {},
    metaOverrides: Partial<PostgresSchemaMetadata> = {},
): PostgresSchemaMetadata {
    const schema = makeTableSchema({ tableName, ...tableOverrides });
    return {
        id: `testdb.public.${tableName}`,
        type: 'postgresql',
        database: 'testdb',
        objectName: tableName,
        fullName: `public.${tableName}`,
        description: `Table ${tableName}`,
        lastScanned: new Date(),
        checksum: 'abc',
        schema,
        ...metaOverrides,
    };
}

function makeMongoMeta(
    collectionName: string,
    collectionOverrides: Partial<MongoCollectionSchema> = {},
    metaOverrides: Partial<MongoSchemaMetadata> = {},
): MongoSchemaMetadata {
    const schema: MongoCollectionSchema = {
        database: 'testdb',
        collectionName,
        fields: [],
        indexes: [],
        ...collectionOverrides,
    };
    return {
        id: `testdb.${collectionName}`,
        type: 'mongodb',
        database: 'testdb',
        objectName: collectionName,
        fullName: collectionName,
        description: `Collection ${collectionName}`,
        lastScanned: new Date(),
        checksum: 'abc',
        schema,
        ...metaOverrides,
    };
}

// ---------------------------------------------------------------------------
// Node / Edge CRUD
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – Node CRUD', () => {
    it('should add and retrieve a node', () => {
        const graph = new SchemaRelationshipGraph();
        const node = makeNode('A');
        graph.addNode(node);
        assert.deepEqual(graph.getNode('A'), node);
    });

    it('should return undefined for missing node', () => {
        const graph = new SchemaRelationshipGraph();
        assert.equal(graph.getNode('nonexistent'), undefined);
    });

    it('should overwrite a node with the same id', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { name: 'first' }));
        graph.addNode(makeNode('A', { name: 'second' }));
        assert.equal(graph.getNode('A')!.name, 'second');
    });

    it('should remove a node and its connected edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        graph.removeNode('A');
        assert.equal(graph.getNode('A'), undefined);
        assert.equal(graph.getEdge('e1'), undefined);
        // B should still exist
        assert.ok(graph.getNode('B'));
        assert.deepEqual(graph.getEdges('B'), []);
    });

    it('should handle removing a nonexistent node gracefully', () => {
        const graph = new SchemaRelationshipGraph();
        graph.removeNode('nonexistent'); // should not throw
    });
});

describe('SchemaRelationshipGraph – Edge CRUD', () => {
    it('should add and retrieve an edge', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        const edge = makeEdge('e1', 'A', 'B');
        graph.addEdge(edge);
        assert.deepEqual(graph.getEdge('e1'), edge);
    });

    it('should return undefined for missing edge', () => {
        const graph = new SchemaRelationshipGraph();
        assert.equal(graph.getEdge('nonexistent'), undefined);
    });
});

// ---------------------------------------------------------------------------
// getNeighbors / getEdges
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getNeighbors', () => {
    it('should return outbound neighbors', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'C', 'A'));

        const out = graph.getNeighbors('A', 'out');
        assert.equal(out.length, 1);
        assert.equal(out[0].id, 'B');
    });

    it('should return inbound neighbors', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'C', 'A'));

        const inN = graph.getNeighbors('A', 'in');
        assert.equal(inN.length, 1);
        assert.equal(inN[0].id, 'C');
    });

    it('should return both directions by default', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'C', 'A'));

        const both = graph.getNeighbors('A');
        const ids = both.map(n => n.id).sort();
        assert.deepEqual(ids, ['B', 'C']);
    });

    it('should return empty for unknown node', () => {
        const graph = new SchemaRelationshipGraph();
        assert.deepEqual(graph.getNeighbors('nope'), []);
    });
});

describe('SchemaRelationshipGraph – getEdges (per node)', () => {
    it('should return outbound edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'A'));

        const out = graph.getEdges('A', 'out');
        assert.equal(out.length, 1);
        assert.equal(out[0].id, 'e1');
    });

    it('should return inbound edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'A'));

        const inE = graph.getEdges('A', 'in');
        assert.equal(inE.length, 1);
        assert.equal(inE[0].id, 'e2');
    });

    it('should default to both', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'A'));

        const both = graph.getEdges('A');
        assert.equal(both.length, 2);
    });
});

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – findPath', () => {
    it('should find path in a linear chain', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C'));

        const path = graph.findPath('A', 'C');
        assert.deepEqual(path.map(n => n.id), ['A', 'B', 'C']);
    });

    it('should return single node for from === to', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        const path = graph.findPath('A', 'A');
        assert.deepEqual(path.map(n => n.id), ['A']);
    });

    it('should return empty for disconnected nodes', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        // no edges
        assert.deepEqual(graph.findPath('A', 'B'), []);
    });

    it('should find shortest path in branching graph', () => {
        const graph = new SchemaRelationshipGraph();
        // A -> B -> D
        // A -> C -> D
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addNode(makeNode('D'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'D'));
        graph.addEdge(makeEdge('e3', 'A', 'C'));
        graph.addEdge(makeEdge('e4', 'C', 'D'));

        const path = graph.findPath('A', 'D');
        // Both paths are length 3, BFS should find one of them
        assert.equal(path.length, 3);
        assert.equal(path[0].id, 'A');
        assert.equal(path[path.length - 1].id, 'D');
    });

    it('should handle cycles without infinite loop', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C'));
        graph.addEdge(makeEdge('e3', 'C', 'A'));

        const path = graph.findPath('A', 'C');
        assert.equal(path.length, 2); // A -> C via the backward edge
    });

    it('should return empty array for nonexistent start node', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        assert.deepEqual(graph.findPath('X', 'A'), []);
    });

    it('should traverse against edge direction (undirected BFS)', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'B', 'A')); // B -> A only

        const path = graph.findPath('A', 'B');
        assert.deepEqual(path.map(n => n.id), ['A', 'B']);
    });
});

// ---------------------------------------------------------------------------
// getConnectedComponent
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getConnectedComponent', () => {
    it('should return all nodes in a connected graph', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C'));

        const component = graph.getConnectedComponent('A');
        assert.equal(component.length, 3);
        const ids = component.map(n => n.id).sort();
        assert.deepEqual(ids, ['A', 'B', 'C']);
    });

    it('should only return the reachable component', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        // C is isolated

        const component = graph.getConnectedComponent('A');
        assert.equal(component.length, 2);

        const componentC = graph.getConnectedComponent('C');
        assert.equal(componentC.length, 1);
        assert.equal(componentC[0].id, 'C');
    });

    it('should return empty for nonexistent node', () => {
        const graph = new SchemaRelationshipGraph();
        assert.deepEqual(graph.getConnectedComponent('nope'), []);
    });
});

// ---------------------------------------------------------------------------
// getRelationshipChain
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getRelationshipChain', () => {
    it('should return subgraph within depth limit', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addNode(makeNode('D'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C'));
        graph.addEdge(makeEdge('e3', 'C', 'D'));

        const chain = graph.getRelationshipChain('A', 2);
        const nodeIds = chain.nodes.map(n => n.id).sort();
        assert.deepEqual(nodeIds, ['A', 'B', 'C']);
        // D should be excluded (depth 3)
        assert.ok(!nodeIds.includes('D'));
    });

    it('should include edges between discovered nodes', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        const chain = graph.getRelationshipChain('A', 1);
        assert.equal(chain.nodes.length, 2);
        assert.equal(chain.edges.length, 1);
        assert.equal(chain.edges[0].id, 'e1');
    });

    it('should default to depth 3', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addNode(makeNode('C'));
        graph.addNode(makeNode('D'));
        graph.addNode(makeNode('E'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C'));
        graph.addEdge(makeEdge('e3', 'C', 'D'));
        graph.addEdge(makeEdge('e4', 'D', 'E'));

        const chain = graph.getRelationshipChain('A');
        const ids = chain.nodes.map(n => n.id).sort();
        assert.deepEqual(ids, ['A', 'B', 'C', 'D']);
    });

    it('should return empty for nonexistent node', () => {
        const graph = new SchemaRelationshipGraph();
        const chain = graph.getRelationshipChain('nope');
        assert.deepEqual(chain, { nodes: [], edges: [] });
    });

    it('should return only the start node with depth 0', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        const chain = graph.getRelationshipChain('A', 0);
        assert.equal(chain.nodes.length, 1);
        assert.equal(chain.nodes[0].id, 'A');
        assert.equal(chain.edges.length, 0);
    });
});

// ---------------------------------------------------------------------------
// toJSON / fromJSON round-trip
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – toJSON / fromJSON', () => {
    it('should round-trip an empty graph', () => {
        const graph = new SchemaRelationshipGraph();
        const json = graph.toJSON();
        assert.deepEqual(json, { nodes: [], edges: [] });

        const restored = SchemaRelationshipGraph.fromJSON(json);
        assert.deepEqual(restored.toJSON(), { nodes: [], edges: [] });
    });

    it('should round-trip a graph with nodes and edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        const json = graph.toJSON();
        const restored = SchemaRelationshipGraph.fromJSON(json);

        assert.deepEqual(restored.getNode('A'), graph.getNode('A'));
        assert.deepEqual(restored.getNode('B'), graph.getNode('B'));
        assert.deepEqual(restored.getEdge('e1'), graph.getEdge('e1'));
        assert.equal(restored.stats().nodeCount, 2);
        assert.equal(restored.stats().edgeCount, 1);
    });

    it('should preserve edge relationships after round-trip', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B', { relationship: 'references', label: 'test' }));

        const restored = SchemaRelationshipGraph.fromJSON(graph.toJSON());
        const neighbors = restored.getNeighbors('A', 'out');
        assert.equal(neighbors.length, 1);
        assert.equal(neighbors[0].id, 'B');
    });
});

// ---------------------------------------------------------------------------
// getDatabaseSubgraph
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getDatabaseSubgraph', () => {
    it('should return only nodes from the specified database', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { database: 'db1' }));
        graph.addNode(makeNode('B', { database: 'db1' }));
        graph.addNode(makeNode('C', { database: 'db2' }));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'B', 'C')); // cross-database

        const sub = graph.getDatabaseSubgraph('db1');
        assert.equal(sub.stats().nodeCount, 2);
        assert.equal(sub.stats().edgeCount, 1); // only A->B
        assert.equal(sub.getEdge('e1')!.source, 'A');
    });

    it('should return empty subgraph for unknown database', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { database: 'db1' }));
        const sub = graph.getDatabaseSubgraph('unknown');
        assert.equal(sub.stats().nodeCount, 0);
    });
});

// ---------------------------------------------------------------------------
// getCrossDatabaseEdges
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getCrossDatabaseEdges', () => {
    it('should return edges crossing database boundaries', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { database: 'db1' }));
        graph.addNode(makeNode('B', { database: 'db2' }));
        graph.addNode(makeNode('C', { database: 'db1' }));
        graph.addEdge(makeEdge('e1', 'A', 'B'));
        graph.addEdge(makeEdge('e2', 'A', 'C'));

        const cross = graph.getCrossDatabaseEdges();
        assert.equal(cross.length, 1);
        assert.equal(cross[0].id, 'e1');
    });

    it('should return empty when all edges are within same database', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { database: 'db1' }));
        graph.addNode(makeNode('B', { database: 'db1' }));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        assert.deepEqual(graph.getCrossDatabaseEdges(), []);
    });
});

// ---------------------------------------------------------------------------
// getNodesByType
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – getNodesByType', () => {
    it('should filter nodes by type', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { type: 'table' }));
        graph.addNode(makeNode('B', { type: 'collection' }));
        graph.addNode(makeNode('C', { type: 'table' }));

        const tables = graph.getNodesByType('table');
        assert.equal(tables.length, 2);
        const ids = tables.map(n => n.id).sort();
        assert.deepEqual(ids, ['A', 'C']);
    });

    it('should return empty for type with no matches', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { type: 'table' }));
        assert.deepEqual(graph.getNodesByType('measurement'), []);
    });
});

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – stats', () => {
    it('should return correct stats for empty graph', () => {
        const graph = new SchemaRelationshipGraph();
        const s = graph.stats();
        assert.equal(s.nodeCount, 0);
        assert.equal(s.edgeCount, 0);
        assert.deepEqual(s.databases, []);
        assert.deepEqual(s.isolatedNodes, []);
    });

    it('should return correct stats with nodes and edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A', { database: 'db1' }));
        graph.addNode(makeNode('B', { database: 'db2' }));
        graph.addNode(makeNode('C', { database: 'db1' }));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        const s = graph.stats();
        assert.equal(s.nodeCount, 3);
        assert.equal(s.edgeCount, 1);
        assert.deepEqual(s.databases, ['db1', 'db2']);
        assert.deepEqual(s.isolatedNodes, ['C']); // C has no edges
    });

    it('should not include connected nodes as isolated', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        assert.deepEqual(graph.stats().isolatedNodes, []);
    });
});

// ---------------------------------------------------------------------------
// buildGraphFromMetadata – PostgreSQL FK constraints
// ---------------------------------------------------------------------------

describe('buildGraphFromMetadata – PostgreSQL', () => {
    it('should create nodes from postgres metadata', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders'),
        ];
        const graph = buildGraphFromMetadata(meta);

        assert.equal(graph.stats().nodeCount, 2);
        assert.ok(graph.getNode('postgres:testdb.public.users'));
        assert.ok(graph.getNode('postgres:testdb.public.orders'));
    });

    it('should create FK edges from column foreignKeyTarget', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: true,
                        isForeignKey: false,
                    },
                    {
                        name: 'user_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: {
                            table: 'public.users',
                            column: 'id',
                        },
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 1);

        const edges = graph.getEdges('postgres:testdb.public.orders', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].relationship, 'foreign_key');
        assert.equal(edges[0].target, 'postgres:testdb.public.users');
        assert.equal(edges[0].label, 'orders.user_id -> public.users.id');
    });

    it('should handle multiple FK columns on same table', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('products'),
            makePostgresMeta('order_items', {
                columns: [
                    {
                        name: 'user_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: { table: 'public.users', column: 'id' },
                    },
                    {
                        name: 'product_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: { table: 'public.products', column: 'id' },
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 2);
        const edges = graph.getEdges('postgres:testdb.public.order_items', 'out');
        const targets = edges.map(e => e.target).sort();
        assert.deepEqual(targets, [
            'postgres:testdb.public.products',
            'postgres:testdb.public.users',
        ]);
    });

    it('should skip FK edges to nonexistent target tables', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('orders', {
                columns: [
                    {
                        name: 'user_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: { table: 'public.users', column: 'id' },
                    },
                ],
            }),
            // users table NOT included
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 0);
    });

    it('should handle self-referencing FK', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('categories', {
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: true,
                        isForeignKey: false,
                    },
                    {
                        name: 'parent_id',
                        type: 'integer',
                        nullable: true,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: { table: 'public.categories', column: 'id' },
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 1);
        const edges = graph.getEdges('postgres:testdb.public.categories', 'out');
        assert.equal(edges[0].source, 'postgres:testdb.public.categories');
        assert.equal(edges[0].target, 'postgres:testdb.public.categories');
    });
});

// ---------------------------------------------------------------------------
// buildGraphFromMetadata – MongoDB heuristic references
// ---------------------------------------------------------------------------

describe('buildGraphFromMetadata – MongoDB', () => {
    it('should create collection nodes', () => {
        const meta: SchemaMetadata[] = [
            makeMongoMeta('users'),
            makeMongoMeta('orders'),
        ];
        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().nodeCount, 2);
        const node = graph.getNode('mongodb:testdb.users');
        assert.ok(node);
        assert.equal(node!.type, 'collection');
        assert.equal(node!.dbType, 'mongodb');
    });

    it('should detect _id suffix references', () => {
        const meta: SchemaMetadata[] = [
            makeMongoMeta('users'),
            makeMongoMeta('orders', {
                fields: [
                    { name: '_id', types: ['objectId'], nullable: false },
                    { name: 'user_id', types: ['objectId'], nullable: false },
                    { name: 'total', types: ['number'], nullable: false },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        const edges = graph.getEdges('mongodb:testdb.orders', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].relationship, 'references');
        assert.equal(edges[0].target, 'mongodb:testdb.users');
    });

    it('should detect camelCase Id suffix references', () => {
        const meta: SchemaMetadata[] = [
            makeMongoMeta('users'),
            makeMongoMeta('comments', {
                fields: [
                    { name: '_id', types: ['objectId'], nullable: false },
                    { name: 'userId', types: ['objectId'], nullable: false },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        const edges = graph.getEdges('mongodb:testdb.comments', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].target, 'mongodb:testdb.users');
    });

    it('should handle plural/singular matching', () => {
        // Field says "author_id", collection is "authors"
        const meta: SchemaMetadata[] = [
            makeMongoMeta('authors'),
            makeMongoMeta('posts', {
                fields: [
                    { name: '_id', types: ['objectId'], nullable: false },
                    { name: 'author_id', types: ['objectId'], nullable: false },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        const edges = graph.getEdges('mongodb:testdb.posts', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].target, 'mongodb:testdb.authors');
    });

    it('should not create self-referencing edges from _id field', () => {
        const meta: SchemaMetadata[] = [
            makeMongoMeta('users', {
                fields: [
                    { name: '_id', types: ['objectId'], nullable: false },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 0);
    });
});

// ---------------------------------------------------------------------------
// buildGraphFromMetadata – Redis heuristic
// ---------------------------------------------------------------------------

describe('buildGraphFromMetadata – Redis', () => {
    it('should create key_pattern nodes', () => {
        const redisSchema: RedisPatternSchema = {
            database: 'redis-cache',
            patterns: [
                {
                    pattern: 'user:*',
                    type: 'hash',
                    exampleKeys: ['user:1', 'user:2'],
                    count: 100,
                },
            ],
            totalKeys: 100,
            lastScanned: new Date(),
        };

        const meta: SchemaMetadata[] = [{
            id: 'redis-cache.patterns',
            type: 'redis',
            database: 'redis-cache',
            objectName: 'redis_patterns',
            fullName: 'redis_patterns',
            description: 'Redis patterns',
            lastScanned: new Date(),
            checksum: 'abc',
            schema: redisSchema,
        } as RedisSchemaMetadata];

        const graph = buildGraphFromMetadata(meta);
        const node = graph.getNode('redis:redis-cache.user:*');
        assert.ok(node);
        assert.equal(node!.type, 'key_pattern');
        assert.equal(node!.dbType, 'redis');
    });

    it('should detect caching relationship to known tables', () => {
        const pgMeta = makePostgresMeta('users');
        const redisSchema: RedisPatternSchema = {
            database: 'redis-cache',
            patterns: [
                {
                    pattern: 'users:*',
                    type: 'hash',
                    exampleKeys: ['users:1'],
                    count: 50,
                },
            ],
            totalKeys: 50,
            lastScanned: new Date(),
        };
        const redisMeta: RedisSchemaMetadata = {
            id: 'redis-cache.patterns',
            type: 'redis',
            database: 'redis-cache',
            objectName: 'redis_patterns',
            fullName: 'redis_patterns',
            description: 'Redis patterns',
            lastScanned: new Date(),
            checksum: 'abc',
            schema: redisSchema,
        };

        const graph = buildGraphFromMetadata([pgMeta, redisMeta]);
        const edges = graph.getEdges('redis:redis-cache.users:*', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].relationship, 'caches');
        assert.equal(edges[0].target, 'postgres:testdb.public.users');
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('SchemaRelationshipGraph – Edge cases', () => {
    it('empty graph should have zero stats', () => {
        const graph = new SchemaRelationshipGraph();
        const s = graph.stats();
        assert.equal(s.nodeCount, 0);
        assert.equal(s.edgeCount, 0);
    });

    it('single node graph should show it as isolated', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('alone'));
        const s = graph.stats();
        assert.equal(s.nodeCount, 1);
        assert.deepEqual(s.isolatedNodes, ['alone']);
    });

    it('buildGraphFromMetadata with empty array returns empty graph', () => {
        const graph = buildGraphFromMetadata([]);
        assert.equal(graph.stats().nodeCount, 0);
        assert.equal(graph.stats().edgeCount, 0);
    });

    it('self-loop edge should appear in both in and out edges', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addEdge(makeEdge('e1', 'A', 'A'));

        assert.equal(graph.getEdges('A', 'out').length, 1);
        assert.equal(graph.getEdges('A', 'in').length, 1);
        // 'both' should deduplicate the same edge
        assert.equal(graph.getEdges('A', 'both').length, 1);
    });

    it('getNeighbors should exclude self for self-loop', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addEdge(makeEdge('e1', 'A', 'A'));

        assert.deepEqual(graph.getNeighbors('A'), []);
    });

    it('findPath should handle self-loop gracefully', () => {
        const graph = new SchemaRelationshipGraph();
        graph.addNode(makeNode('A'));
        graph.addNode(makeNode('B'));
        graph.addEdge(makeEdge('e-self', 'A', 'A'));
        graph.addEdge(makeEdge('e1', 'A', 'B'));

        const path = graph.findPath('A', 'B');
        assert.deepEqual(path.map(n => n.id), ['A', 'B']);
    });
});

// ---------------------------------------------------------------------------
// MySQL metadata
// ---------------------------------------------------------------------------

describe('buildGraphFromMetadata – MySQL', () => {
    it('should create nodes with mysql dbType', () => {
        const meta: SchemaMetadata[] = [{
            id: 'mysqldb.myschema.users',
            type: 'mysql',
            database: 'mysqldb',
            objectName: 'users',
            fullName: 'myschema.users',
            description: 'Users table',
            lastScanned: new Date(),
            checksum: 'abc',
            schema: makeTableSchema({ database: 'mysqldb', schema: 'myschema', tableName: 'users' }),
        }];

        const graph = buildGraphFromMetadata(meta);
        const node = graph.getNode('mysql:mysqldb.myschema.users');
        assert.ok(node);
        assert.equal(node!.dbType, 'mysql');
        assert.equal(node!.schema, 'myschema');
    });
});

// ---------------------------------------------------------------------------
// buildGraphFromMetadata – FK from constraints[]
// ---------------------------------------------------------------------------

describe('buildGraphFromMetadata – FK from constraints', () => {
    it('should create FK edges from constraints when columns lack foreignKeyTarget', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: true,
                        isForeignKey: false,
                    },
                    {
                        name: 'user_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: false,
                        // No foreignKeyTarget set
                    },
                ],
                constraints: [
                    {
                        name: 'fk_orders_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) REFERENCES users(id)',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 1);

        const edges = graph.getEdges('postgres:testdb.public.orders', 'out');
        assert.equal(edges.length, 1);
        assert.equal(edges[0].relationship, 'foreign_key');
        assert.equal(edges[0].target, 'postgres:testdb.public.users');
        assert.equal(edges[0].metadata?.sourceColumn, 'user_id');
        assert.equal(edges[0].metadata?.targetColumn, 'id');
    });

    it('should not create duplicate edges when both column and constraint report the same FK', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [
                    {
                        name: 'user_id',
                        type: 'integer',
                        nullable: false,
                        isPrimaryKey: false,
                        isForeignKey: true,
                        foreignKeyTarget: {
                            table: 'public.users',
                            column: 'id',
                        },
                    },
                ],
                constraints: [
                    {
                        name: 'fk_orders_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) REFERENCES public.users(id)',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        // Should only have 1 edge, not 2
        assert.equal(graph.stats().edgeCount, 1);

        const edges = graph.getEdges('postgres:testdb.public.orders', 'out');
        assert.equal(edges.length, 1);
    });

    it('should parse REFERENCES with schema-qualified table name', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [],
                constraints: [
                    {
                        name: 'fk_orders_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) REFERENCES public.users(id)',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 1);

        const edges = graph.getEdges('postgres:testdb.public.orders', 'out');
        assert.equal(edges[0].target, 'postgres:testdb.public.users');
        assert.equal(edges[0].metadata?.targetColumn, 'id');
    });

    it('should parse REFERENCES with extra whitespace', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [],
                constraints: [
                    {
                        name: 'fk_orders_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id)  REFERENCES   users  ( id )',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 1);

        const edges = graph.getEdges('postgres:testdb.public.orders', 'out');
        assert.equal(edges[0].target, 'postgres:testdb.public.users');
    });

    it('should skip non-FOREIGN KEY constraints', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users', {
                constraints: [
                    {
                        name: 'pk_users',
                        type: 'PRIMARY KEY',
                        columns: ['id'],
                        definition: 'PRIMARY KEY (id)',
                    },
                    {
                        name: 'uq_users_email',
                        type: 'UNIQUE',
                        columns: ['email'],
                        definition: 'UNIQUE (email)',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 0);
    });

    it('should skip constraint FK edges to nonexistent target tables', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('orders', {
                columns: [],
                constraints: [
                    {
                        name: 'fk_orders_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) REFERENCES users(id)',
                    },
                ],
            }),
            // users table NOT included
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 0);
    });

    it('should handle multiple FK constraints on the same table', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('products'),
            makePostgresMeta('order_items', {
                columns: [],
                constraints: [
                    {
                        name: 'fk_oi_user',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) REFERENCES users(id)',
                    },
                    {
                        name: 'fk_oi_product',
                        type: 'FOREIGN KEY',
                        columns: ['product_id'],
                        definition: 'FOREIGN KEY (product_id) REFERENCES products(id)',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 2);

        const edges = graph.getEdges('postgres:testdb.public.order_items', 'out');
        const targets = edges.map(e => e.target).sort();
        assert.deepEqual(targets, [
            'postgres:testdb.public.products',
            'postgres:testdb.public.users',
        ]);
    });

    it('should skip constraints with unparseable definitions', () => {
        const meta: SchemaMetadata[] = [
            makePostgresMeta('users'),
            makePostgresMeta('orders', {
                columns: [],
                constraints: [
                    {
                        name: 'fk_broken',
                        type: 'FOREIGN KEY',
                        columns: ['user_id'],
                        definition: 'FOREIGN KEY (user_id) SOMETHING_WRONG',
                    },
                ],
            }),
        ];

        const graph = buildGraphFromMetadata(meta);
        assert.equal(graph.stats().edgeCount, 0);
    });
});
