#!/usr/bin/env node
/**
 * Semantic Search Example
 *
 * Demonstrates searching schemas using natural language queries
 */

import { SchemaIntelligenceService } from '@caelum/schema-intelligence';

async function main() {
    console.log('🔍 Schema Intelligence - Semantic Search Example\n');

    const service = new SchemaIntelligenceService({
        databases: [
            {
                type: 'postgresql',
                connectionString: process.env.POSTGRES_URL || 'postgresql://user:pass@localhost:5432/mydb'
            },
            {
                type: 'mongodb',
                connectionString: process.env.MONGODB_URL || 'mongodb://localhost:27017/mydb'
            }
        ],
        qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
        qdrantCollection: 'database_schemas',
        embeddingModel: 'simple',
        scanInterval: 0,
        enableChangeDetection: false
    });

    try {
        // Initialize
        console.log('📊 Initializing...');
        await service.initialize();
        console.log('✅ Initialized\n');

        // Example queries
        const queries = [
            'user authentication and sessions',
            'payment processing and transactions',
            'product catalog and inventory',
            'analytics and metrics',
            'email notifications'
        ];

        for (const query of queries) {
            console.log(`🔍 Query: "${query}"`);
            const results = await service.searchSchemas(query, 3);

            if (results.length === 0) {
                console.log('   No results found\n');
                continue;
            }

            for (const result of results) {
                console.log(`\n   📄 ${result.table} (score: ${result.score.toFixed(3)})`);
                console.log(`      Database: ${result.database}`);
                console.log(`      Description: ${result.description.substring(0, 120)}...`);
            }
            console.log();
        }

        // Get schema details by exact name
        console.log('📋 Getting schema details for specific table...');
        const schema = await service.getSchema('mydb', 'public', 'users');
        if (schema) {
            console.log('   Found schema:');
            console.log(`   - Database: ${schema.database}`);
            console.log(`   - Type: ${schema.type}`);
            console.log(`   - Description: ${schema.description}`);
            console.log(`   - Last scanned: ${schema.lastScanned}`);
        } else {
            console.log('   Schema not found');
        }

        // Shutdown
        await service.shutdown();
        console.log('\n✅ Complete');
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
