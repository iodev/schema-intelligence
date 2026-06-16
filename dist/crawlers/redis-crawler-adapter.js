import { RedisPatternCrawler } from '../redis-pattern-crawler.js';
export class RedisCrawlerAdapter {
    type = 'redis';
    crawler = new RedisPatternCrawler();
    async connect(connectionString, alias) {
        await this.crawler.connect(connectionString, alias);
    }
    async crawl(alias) {
        return this.crawler.crawlRedis(alias);
    }
    async close() {
        await this.crawler.close();
    }
}
//# sourceMappingURL=redis-crawler-adapter.js.map