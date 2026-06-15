/**
 * PostgreSQL Schema Crawler
 *
 * Extracts comprehensive schema information from PostgreSQL databases
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import pino from 'pino';
import {
    TableSchema,
    TableColumn,
    TableIndex,
    TableConstraint,
    SchemaMetadata,
} from './types.js';

export class PostgreschemaCrawler {
    private logger: pino.Logger;
    private pools: Map<string, Pool> = new Map();

    constructor() {
        this.logger = pino({ name: 'postgres-schema-crawler' });
    }

    /**
     * Connect to a PostgreSQL database
     */
    async connect(connectionString: string, alias: string): Promise<void> {
        // Parse connection string to handle auth-host=trust cases
        let config: { connectionString: string } | { host: string; port: number; database: string; user: string; password: string };

        // If connection string doesn't have a password (e.g., user@host), don't use connectionString
        if (connectionString.match(/\/\/[^:]+@/)) {
            // No password in connection string - extract components and use direct config
            const url = new URL(connectionString.replace('postgresql://', 'postgres://'));
            config = {
                host: url.hostname,
                port: parseInt(url.port) || 5432,
                database: url.pathname.slice(1),
                user: url.username,
                password: '', // Empty string for trust auth
            };
        } else {
            // Use connection string for cases with password
            config = { connectionString };
        }

        const pool = new Pool(config);
        this.pools.set(alias, pool);
        this.logger.info({ alias }, 'Connected to PostgreSQL database');
    }

    /**
     * Get all schemas in the database (exclude system schemas)
     */
    async getSchemas(dbAlias: string): Promise<string[]> {
        const pool = this.pools.get(dbAlias);
        if (!pool) throw new Error(`Database ${dbAlias} not connected`);

        const result = await pool.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY schema_name
        `);

        return result.rows.map(r => r.schema_name);
    }

    /**
     * Get all tables in a schema
     */
    async getTables(dbAlias: string, schema: string): Promise<string[]> {
        const pool = this.pools.get(dbAlias);
        if (!pool) throw new Error(`Database ${dbAlias} not connected`);

        const result = await pool.query(
            `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1 AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `,
            [schema]
        );

        return result.rows.map(r => r.table_name);
    }

    /**
     * Extract complete schema for a table
     */
    async extractTableSchema(
        dbAlias: string,
        schema: string,
        tableName: string
    ): Promise<TableSchema> {
        const pool = this.pools.get(dbAlias);
        if (!pool) throw new Error(`Database ${dbAlias} not connected`);

        // Get columns
        const columns = await this.getColumns(pool, schema, tableName);

        // Get indexes
        const indexes = await this.getIndexes(pool, schema, tableName);

        // Get constraints
        const constraints = await this.getConstraints(pool, schema, tableName);

        // Get table stats
        const stats = await this.getTableStats(pool, schema, tableName);

        // Get table comment
        const comment = await this.getTableComment(pool, schema, tableName);

        return {
            database: dbAlias,
            schema,
            tableName,
            columns,
            indexes,
            constraints,
            rowCount: stats.rowCount,
            sizeBytes: stats.sizeBytes,
            description: comment || undefined,
            lastModified: new Date(),
        };
    }

    /**
     * Get columns for a table
     */
    private async getColumns(
        pool: Pool,
        schema: string,
        tableName: string
    ): Promise<TableColumn[]> {
        const result = await pool.query(
            `
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
                fk.foreign_table_schema,
                fk.foreign_table_name,
                fk.foreign_column_name,
                pgd.description
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
            ) pk ON c.column_name = pk.column_name
            LEFT JOIN (
                SELECT
                    kcu.column_name,
                    ccu.table_schema AS foreign_table_schema,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
            ) fk ON c.column_name = fk.column_name
            LEFT JOIN pg_catalog.pg_statio_all_tables st
                ON st.schemaname = c.table_schema
                AND st.relname = c.table_name
            LEFT JOIN pg_catalog.pg_description pgd
                ON pgd.objoid = st.relid
                AND pgd.objsubid = c.ordinal_position
            WHERE c.table_schema = $1 AND c.table_name = $2
            ORDER BY c.ordinal_position
        `,
            [schema, tableName]
        );

        return result.rows.map(row => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            defaultValue: row.column_default,
            isPrimaryKey: row.is_primary_key,
            isForeignKey: row.is_foreign_key,
            foreignKeyTarget: row.is_foreign_key
                ? {
                      table: `${row.foreign_table_schema}.${row.foreign_table_name}`,
                      column: row.foreign_column_name,
                  }
                : undefined,
            description: row.description,
        }));
    }

    /**
     * Get indexes for a table
     */
    private async getIndexes(
        pool: Pool,
        schema: string,
        tableName: string
    ): Promise<TableIndex[]> {
        const result = await pool.query(
            `
            SELECT
                i.relname as index_name,
                array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = $1 AND t.relname = $2
            GROUP BY i.relname, ix.indisunique, ix.indisprimary
            ORDER BY i.relname
        `,
            [schema, tableName]
        );

        return result.rows.map(row => ({
            name: row.index_name,
            columns: row.columns,
            isUnique: row.is_unique,
            isPrimary: row.is_primary,
        }));
    }

    /**
     * Get constraints for a table
     */
    private async getConstraints(
        pool: Pool,
        schema: string,
        tableName: string
    ): Promise<TableConstraint[]> {
        const result = await pool.query(
            `
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                array_agg(kcu.column_name) as columns,
                pg_get_constraintdef(c.oid) as definition
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN pg_namespace n ON n.nspname = tc.table_schema
            JOIN pg_constraint c ON c.conname = tc.constraint_name
                AND c.connamespace = n.oid
            WHERE tc.table_schema = $1 AND tc.table_name = $2
            GROUP BY tc.constraint_name, tc.constraint_type, c.oid
            ORDER BY tc.constraint_name
        `,
            [schema, tableName]
        );

        return result.rows.map(row => ({
            name: row.constraint_name,
            type: row.constraint_type as TableConstraint['type'],
            columns: row.columns,
            definition: row.definition,
        }));
    }

    /**
     * Get table statistics
     */
    private async getTableStats(
        pool: Pool,
        schema: string,
        tableName: string
    ): Promise<{ rowCount: number; sizeBytes: number }> {
        const result = await pool.query(
            `
            SELECT
                n_live_tup as row_count,
                pg_total_relation_size(quote_ident($1) || '.' || quote_ident($2)) as size_bytes
            FROM pg_stat_user_tables
            WHERE schemaname = $1 AND relname = $2
        `,
            [schema, tableName]
        );

        return {
            rowCount: result.rows[0]?.row_count || 0,
            sizeBytes: result.rows[0]?.size_bytes || 0,
        };
    }

    /**
     * Get table comment
     */
    private async getTableComment(
        pool: Pool,
        schema: string,
        tableName: string
    ): Promise<string | null> {
        const result = await pool.query(
            `
            SELECT obj_description((quote_ident($1) || '.' || quote_ident($2))::regclass, 'pg_class') as comment
        `,
            [schema, tableName]
        );

        return result.rows[0]?.comment || null;
    }

    /**
     * Crawl entire database and return all schemas
     */
    async crawlDatabase(dbAlias: string): Promise<SchemaMetadata[]> {
        this.logger.info({ dbAlias }, 'Starting database crawl');

        const schemas = await this.getSchemas(dbAlias);
        const metadata: SchemaMetadata[] = [];

        for (const schema of schemas) {
            const tables = await this.getTables(dbAlias, schema);

            for (const tableName of tables) {
                try {
                    const tableSchema = await this.extractTableSchema(
                        dbAlias,
                        schema,
                        tableName
                    );

                    // Generate human-readable description
                    const description = this.generateDescription(tableSchema);

                    // Generate checksum for change detection
                    const checksum = this.generateChecksum(tableSchema);

                    metadata.push({
                        id: `${dbAlias}.${schema}.${tableName}`,
                        type: 'postgresql',
                        database: dbAlias,
                        objectName: tableName,
                        fullName: `${schema}.${tableName}`,
                        description,
                        schema: tableSchema,
                        lastScanned: new Date(),
                        checksum,
                    });

                    this.logger.debug(
                        { schema, tableName },
                        'Extracted table schema'
                    );
                } catch (error) {
                    this.logger.error(
                        {
                            schema,
                            tableName,
                            errorMessage: error instanceof Error ? error.message : String(error),
                            errorStack: error instanceof Error ? error.stack : undefined
                        },
                        'Failed to extract table schema'
                    );
                }
            }
        }

        this.logger.info(
            { dbAlias, tableCount: metadata.length },
            'Database crawl complete'
        );

        return metadata;
    }

    /**
     * Generate human-readable description for vectorization
     */
    private generateDescription(schema: TableSchema): string {
        const parts: string[] = [];

        // Table name and schema
        parts.push(
            `Table ${schema.schema}.${schema.tableName} in ${schema.database} database`
        );

        // Description from comments
        if (schema.description) {
            parts.push(schema.description);
        }

        // Columns
        const columnDescriptions = schema.columns.map(col => {
            let desc = `${col.name} (${col.type}`;
            if (col.isPrimaryKey) desc += ', PRIMARY KEY';
            if (col.isForeignKey)
                desc += `, FOREIGN KEY to ${col.foreignKeyTarget?.table}`;
            if (!col.nullable) desc += ', NOT NULL';
            desc += ')';
            if (col.description) desc += ` - ${col.description}`;
            return desc;
        });

        parts.push('Columns: ' + columnDescriptions.join(', '));

        // Indexes
        if (schema.indexes.length > 0) {
            const indexDescriptions = schema.indexes
                .filter(idx => !idx.isPrimary)
                .map(idx => {
                    // Handle both array and string formats from PostgreSQL
                    const cols = Array.isArray(idx.columns)
                        ? idx.columns.join(', ')
                        : String(idx.columns).replace(/[{}]/g, '');
                    return `${idx.name} on (${cols})`;
                });
            if (indexDescriptions.length > 0) {
                parts.push('Indexes: ' + indexDescriptions.join(', '));
            }
        }

        // Stats
        if (schema.rowCount) {
            parts.push(`Row count: ${schema.rowCount.toLocaleString()}`);
        }

        return parts.join('. ');
    }

    /**
     * Generate checksum for change detection
     */
    private generateChecksum(schema: TableSchema): string {
        const data = JSON.stringify({
            columns: schema.columns,
            indexes: schema.indexes,
            constraints: schema.constraints,
        });
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Close all connections
     */
    async close(): Promise<void> {
        for (const [alias, pool] of Array.from(this.pools)) {
            await pool.end();
            this.logger.info({ alias }, 'Closed database connection');
        }
        this.pools.clear();
    }
}
