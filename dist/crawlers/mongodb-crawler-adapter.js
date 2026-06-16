import { MongoDBSchemaCrawler } from '../mongodb-schema-crawler.js';
export class MongoDBCrawlerAdapter {
    type = 'mongodb';
    crawler = new MongoDBSchemaCrawler();
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
//# sourceMappingURL=mongodb-crawler-adapter.js.map