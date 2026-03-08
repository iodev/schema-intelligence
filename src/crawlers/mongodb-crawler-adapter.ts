import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { MongoDBSchemaCrawler } from '../mongodb-schema-crawler.js';

export class MongoDBCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'mongodb';
    private crawler = new MongoDBSchemaCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
