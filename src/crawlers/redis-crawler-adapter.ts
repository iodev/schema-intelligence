import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { RedisPatternCrawler } from '../redis-pattern-crawler.js';

export class RedisCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'redis';
    private crawler = new RedisPatternCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlRedis(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
