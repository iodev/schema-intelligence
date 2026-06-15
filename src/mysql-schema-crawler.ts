/**
 * MySQL Schema Crawler
 *
 * Extracts comprehensive schema information from MySQL databases
 */

import mysql from 'mysql2/promise';
import { createHash } from 'crypto';
import pino from 'pino';
import {
    TableSchema,
    TableColumn,
    TableIndex,
    TableConstraint,
    SchemaMetadata,
} from './types.js';

export class MySQLSchemaCrawler {
    private logger: pino.Logger;
    private connections: Map<string, mysql.Connection> = new Map();

    constructor() {
        this.logger = pino({ name: 'mysql-schema-crawler' });
    }

    /**
     * Connect to a MySQL database
     */
    async connect(connectionString: string, alias: string): Promise<void> {
        const connection = await mysql.createConnection(connectionString);
        this.connections.set(alias, connection);
        this.logger.info({ alias }, 'Connected to MySQL database');
    }

    /**
     * Get all schemas (databases) visible to the connected user, excluding system schemas
     */
    async getSchemas(dbAlias: string): Promise<string[]> {
        const connection = this.connections.get(dbAlias);
        if (!connection) throw new Error(`Database ${dbAlias} not connected`);

        const [rows] = await connection.query<mysql.RowDataPacket[]>(`
            SELECT SCHEMA_NAME
            FROM information_schema.SCHEMATA
            WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY SCHEMA_NAME
        `);

        return rows.map(r => r.SCHEMA_NAME);
    }

    /**
     * Get all tables in a database/schema
     */
    async getTables(dbAlias: string, database: string): Promise<string[]> {
        const connection = this.connections.get(dbAlias);
        if (!connection) throw new Error(`Database ${dbAlias} not connected`);

        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `,
            [database]
        );

        return rows.map(r => r.TABLE_NAME);
    }

    /**
     * Extract complete schema for a table
     */
    async extractTableSchema(
        dbAlias: string,
        database: string,
        tableName: string
    ): Promise<TableSchema> {
        const connection = this.connections.get(dbAlias);
        if (!connection) throw new Error(`Database ${dbAlias} not connected`);

        // Get columns
        const columns = await this.getColumns(connection, database, tableName);

        // Get indexes
        const indexes = await this.getIndexes(connection, database, tableName);

        // Get constraints
        const constraints = await this.getConstraints(connection, database, tableName);

        // Get table stats
        const stats = await this.getTableStats(connection, database, tableName);

        // Get table comment
        const comment = await this.getTableComment(connection, database, tableName);

        return {
            database: dbAlias,
            schema: database,
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
        connection: mysql.Connection,
        database: string,
        tableName: string
    ): Promise<TableColumn[]> {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.COLUMN_TYPE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                c.COLUMN_COMMENT,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
                CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
                fk.REFERENCED_TABLE_SCHEMA,
                fk.REFERENCED_TABLE_NAME,
                fk.REFERENCED_COLUMN_NAME
            FROM information_schema.COLUMNS c
            LEFT JOIN (
                SELECT kcu.COLUMN_NAME
                FROM information_schema.TABLE_CONSTRAINTS tc
                JOIN information_schema.KEY_COLUMN_USAGE kcu
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                    AND tc.TABLE_NAME = kcu.TABLE_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                    AND tc.TABLE_SCHEMA = ?
                    AND tc.TABLE_NAME = ?
            ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
                SELECT
                    kcu.COLUMN_NAME,
                    kcu.REFERENCED_TABLE_SCHEMA,
                    kcu.REFERENCED_TABLE_NAME,
                    kcu.REFERENCED_COLUMN_NAME
                FROM information_schema.TABLE_CONSTRAINTS tc
                JOIN information_schema.KEY_COLUMN_USAGE kcu
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                    AND tc.TABLE_NAME = kcu.TABLE_NAME
                WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
                    AND tc.TABLE_SCHEMA = ?
                    AND tc.TABLE_NAME = ?
            ) fk ON c.COLUMN_NAME = fk.COLUMN_NAME
            WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
            ORDER BY c.ORDINAL_POSITION
        `,
            [database, tableName, database, tableName, database, tableName]
        );

        return rows.map(row => ({
            name: row.COLUMN_NAME,
            type: row.COLUMN_TYPE,
            nullable: row.IS_NULLABLE === 'YES',
            defaultValue: row.COLUMN_DEFAULT ?? undefined,
            isPrimaryKey: row.is_primary_key === 1,
            isForeignKey: row.is_foreign_key === 1,
            foreignKeyTarget: row.is_foreign_key === 1
                ? {
                      table: `${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}`,
                      column: row.REFERENCED_COLUMN_NAME,
                  }
                : undefined,
            description: row.COLUMN_COMMENT || undefined,
        }));
    }

    /**
     * Get indexes for a table
     */
    private async getIndexes(
        connection: mysql.Connection,
        database: string,
        tableName: string
    ): Promise<TableIndex[]> {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT
                INDEX_NAME,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_csv,
                CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique,
                CASE WHEN INDEX_NAME = 'PRIMARY' THEN 1 ELSE 0 END AS is_primary
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            GROUP BY INDEX_NAME, NON_UNIQUE
            ORDER BY INDEX_NAME
        `,
            [database, tableName]
        );

        return rows.map(row => ({
            name: row.INDEX_NAME,
            columns: row.columns_csv.split(','),
            isUnique: row.is_unique === 1,
            isPrimary: row.is_primary === 1,
        }));
    }

    /**
     * Get constraints for a table
     */
    private async getConstraints(
        connection: mysql.Connection,
        database: string,
        tableName: string
    ): Promise<TableConstraint[]> {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT
                tc.CONSTRAINT_NAME,
                tc.CONSTRAINT_TYPE,
                GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) AS columns_csv,
                CASE
                    WHEN tc.CONSTRAINT_TYPE = 'FOREIGN KEY' THEN
                        CONCAT('FOREIGN KEY (', GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION), ') REFERENCES ',
                               kcu.REFERENCED_TABLE_SCHEMA, '.', kcu.REFERENCED_TABLE_NAME,
                               '(', GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION), ')')
                    WHEN tc.CONSTRAINT_TYPE = 'PRIMARY KEY' THEN
                        CONCAT('PRIMARY KEY (', GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION), ')')
                    WHEN tc.CONSTRAINT_TYPE = 'UNIQUE' THEN
                        CONCAT('UNIQUE (', GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION), ')')
                    ELSE tc.CONSTRAINT_TYPE
                END AS definition
            FROM information_schema.TABLE_CONSTRAINTS tc
            JOIN information_schema.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                AND tc.TABLE_NAME = kcu.TABLE_NAME
            WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
            GROUP BY tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE,
                     kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME
            ORDER BY tc.CONSTRAINT_NAME
        `,
            [database, tableName]
        );

        return rows.map(row => ({
            name: row.CONSTRAINT_NAME,
            type: row.CONSTRAINT_TYPE as TableConstraint['type'],
            columns: row.columns_csv.split(','),
            definition: row.definition,
        }));
    }

    /**
     * Get table statistics (row count and size)
     */
    private async getTableStats(
        connection: mysql.Connection,
        database: string,
        tableName: string
    ): Promise<{ rowCount: number; sizeBytes: number }> {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT
                TABLE_ROWS AS row_count,
                (DATA_LENGTH + INDEX_LENGTH) AS size_bytes
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        `,
            [database, tableName]
        );

        return {
            rowCount: rows[0]?.row_count || 0,
            sizeBytes: rows[0]?.size_bytes || 0,
        };
    }

    /**
     * Get table comment
     */
    private async getTableComment(
        connection: mysql.Connection,
        database: string,
        tableName: string
    ): Promise<string | null> {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(
            `
            SELECT TABLE_COMMENT
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        `,
            [database, tableName]
        );

        return rows[0]?.TABLE_COMMENT || null;
    }

    /**
     * Crawl entire database and return all schemas
     */
    async crawlDatabase(dbAlias: string): Promise<SchemaMetadata[]> {
        this.logger.info({ dbAlias }, 'Starting database crawl');

        const databases = await this.getSchemas(dbAlias);
        const metadata: SchemaMetadata[] = [];

        for (const database of databases) {
            const tables = await this.getTables(dbAlias, database);

            for (const tableName of tables) {
                try {
                    const tableSchema = await this.extractTableSchema(
                        dbAlias,
                        database,
                        tableName
                    );

                    // Generate human-readable description
                    const description = this.generateDescription(tableSchema);

                    // Generate checksum for change detection
                    const checksum = this.generateChecksum(tableSchema);

                    metadata.push({
                        id: `${dbAlias}.${database}.${tableName}`,
                        type: 'mysql',
                        database: dbAlias,
                        objectName: tableName,
                        fullName: `${database}.${tableName}`,
                        description,
                        schema: tableSchema,
                        lastScanned: new Date(),
                        checksum,
                    });

                    this.logger.debug(
                        { database, tableName },
                        'Extracted table schema'
                    );
                } catch (error) {
                    this.logger.error(
                        {
                            database,
                            tableName,
                            errorMessage: error instanceof Error ? error.message : String(error),
                            errorStack: error instanceof Error ? error.stack : undefined,
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

        // Table name and database
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
                    const cols = idx.columns.join(', ');
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
        for (const [alias, connection] of Array.from(this.connections)) {
            await connection.end();
            this.logger.info({ alias }, 'Closed database connection');
        }
        this.connections.clear();
    }
}
