import { PostgreschemaCrawler } from '../postgres-schema-crawler.js';
export class PostgresCrawlerAdapter {
    type = 'postgresql';
    crawler = new PostgreschemaCrawler();
    async connect(connectionString, alias) {
        await this.crawler.connect(connectionString, alias);
    }
    async crawl(alias) {
        return this.crawler.crawlDatabase(alias);
    }
    async close() {
        await this.crawler.close();
    }
}
//# sourceMappingURL=postgres-crawler-adapter.js.map