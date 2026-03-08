import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
import { InfluxDBBucketCrawler } from '../influxdb-bucket-crawler.js';

export class InfluxDBCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'influxdb';
    private crawler = new InfluxDBBucketCrawler();

    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }

    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlInfluxDB(alias);
    }

    async close(): Promise<void> {
        await this.crawler.close();
    }
}
