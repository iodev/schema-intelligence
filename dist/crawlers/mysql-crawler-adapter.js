import { MySQLSchemaCrawler } from '../mysql-schema-crawler.js';
export class MySQLCrawlerAdapter {
    type = 'mysql';
    crawler = new MySQLSchemaCrawler();
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
//# sourceMappingURL=mysql-crawler-adapter.js.map