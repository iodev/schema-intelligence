#!/usr/bin/env node
/**
 * Basic Usage Example
 *
 * Demonstrates simple schema documentation across multiple database types
 */

import { SchemaIntelligenceService } from '@caelum/schema-intelligence';

async function main() {
    console.log('🚀 Schema Intelligence - Basic Usage Example\n');

    const service = new SchemaIntelligenceService({
        databases: [
            {
                type: 'postgresql',
                connectionString: process.env.POSTGRES_URL || 'postgresql://user:pass@localhost:5432/mydb',
                excludeSchemas: ['information_schema', 'pg_catalog']
            },
            {
                type: 'mongodb',
                connectionString: process.env.MONGODB_URL || 'mongodb://localhost:27017/mydb'
            },
            {
                type: 'redis',
                connectionString: process.env.REDIS_URL || 'redis://localhost:6379'
            },
            {
                type: 'influxdb',
                connectionString: process.env.INFLUXDB_URL || 'http://localhost:8086?token=YOUR_TOKEN&org=myorg'
            }
        ],
        qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
        qdrantCollection: 'database_schemas',
        embeddingModel: 'simple',
        scanInterval: 0, // Manual scanning only
        enableChangeDetection: false
    });

    try {
        // Initialize and scan all databases
        console.log('📊 Initializing and scanning databases...');
        await service.initialize();
        console.log('✅ Schema scan complete!\n');

        // Get statistics
        const stats = await service.getStats();
        console.log('📈 Statistics:');
        console.log(`   Total schemas: ${stats.totalSchemas}`);
        console.log(`   Databases:`);
        for (const [db, count] of Object.entries(stats.databases)) {
            console.log(`   - ${db}: ${count} schemas`);
        }
        console.log();

        // Search schemas semantically
        console.log('🔍 Searching for "user authentication" schemas...');
        const results = await service.searchSchemas('user authentication', 3);
        for (const result of results) {
            console.log(`   - ${result.table} (score: ${result.score.toFixed(3)})`);
            console.log(`     Database: ${result.database}`);
            console.log(`     Description: ${result.description.substring(0, 100)}...`);
        }

        // Shutdown gracefully
        await service.shutdown();
        console.log('\n✅ Service shut down successfully');
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
