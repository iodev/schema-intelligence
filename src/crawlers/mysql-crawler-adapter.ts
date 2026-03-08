import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { MySQLSchemaCrawler } from '../mysql-schema-crawler.js';

export class MySQLCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'mysql';
    private crawler = new MySQLSchemaCrawler();

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
