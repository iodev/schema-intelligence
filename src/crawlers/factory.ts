import { DatabaseType, DatabaseCrawlerStrategy } from '../types.js';
import { PostgresCrawlerAdapter } from './postgres-crawler-adapter.js';
import { MySQLCrawlerAdapter } from './mysql-crawler-adapter.js';
import { MongoDBCrawlerAdapter } from './mongodb-crawler-adapter.js';
import { RedisCrawlerAdapter } from './redis-crawler-adapter.js';
import { InfluxDBCrawlerAdapter } from './influxdb-crawler-adapter.js';

export function createCrawlerStrategy(type: DatabaseType): DatabaseCrawlerStrategy {
    switch (type) {
        case 'postgresql':
            return new PostgresCrawlerAdapter();
        case 'mysql':
            return new MySQLCrawlerAdapter();
        case 'mongodb':
            return new MongoDBCrawlerAdapter();
        case 'redis':
            return new RedisCrawlerAdapter();
        case 'influxdb':
            return new InfluxDBCrawlerAdapter();
        default:
            throw new Error(`Unknown database type: ${type}`);
    }
}
