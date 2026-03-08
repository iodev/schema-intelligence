import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { PostgreschemaCrawler } from '../postgres-schema-crawler.js';

export class PostgresCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'postgresql';
    private crawler = new PostgreschemaCrawler();

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
