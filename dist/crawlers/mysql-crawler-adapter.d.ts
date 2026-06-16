import { DatabaseCrawlerStrategy, DatabaseType, SchemaMetadata } from '../types.js';
export declare class MySQLCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType;
    private crawler;
    connect(connectionString: string, alias: string): Promise<void>;
    crawl(alias: string): Promise<SchemaMetadata[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=mysql-crawler-adapter.d.ts.map