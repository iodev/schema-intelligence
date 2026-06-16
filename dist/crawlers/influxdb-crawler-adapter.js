import { InfluxDBBucketCrawler } from '../influxdb-bucket-crawler.js';
export class InfluxDBCrawlerAdapter {
    type = 'influxdb';
    crawler = new InfluxDBBucketCrawler();
    async connect(connectionString, alias) {
        await this.crawler.connect(connectionString, alias);
    }
    async crawl(alias) {
        return this.crawler.crawlInfluxDB(alias);
    }
    async close() {
        await this.crawler.close();
    }
}
//# sourceMappingURL=influxdb-crawler-adapter.js.map