#!/usr/bin/env node
/**
 * Change Detection Example
 *
 * Demonstrates periodic scanning with change detection
 */

import { SchemaIntelligenceService } from '@caelum/schema-intelligence';

async function main() {
    console.log('🔍 Schema Intelligence - Change Detection Example\n');

    const service = new SchemaIntelligenceService({
        databases: [
            {
                type: 'postgresql',
                connectionString: process.env.POSTGRES_URL || 'postgresql://user:pass@localhost:5432/mydb'
            }
        ],
        qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
        qdrantCollection: 'database_schemas_watch',
        embeddingModel: 'simple',
        scanInterval: 1, // Scan every minute for demo
        enableChangeDetection: true
    });

    try {
        console.log('📊 Initializing with change detection enabled...');
        await service.initialize();
        console.log('✅ Initial scan complete\n');

        console.log('👀 Watching for schema changes (scan every 1 minute)');
        console.log('   - CREATE events: New tables/collections');
        console.log('   - ALTER events: Schema modifications');
        console.log('   - DROP events: Deleted objects');
        console.log('\n💡 Make some schema changes in your database to see detection in action!');
        console.log('   Press Ctrl+C to stop\n');

        // Keep the process running
        await new Promise(() => {});
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        await service.shutdown();
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    process.exit(0);
});

main();
