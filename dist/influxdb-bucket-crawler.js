/**
 * InfluxDB Bucket Crawler
 *
 * Extracts bucket metadata, measurements, tags, and fields from InfluxDB
 */
import { InfluxDB } from '@influxdata/influxdb-client';
import { BucketsAPI } from '@influxdata/influxdb-client-apis';
import { createHash } from 'crypto';
import pino from 'pino';
export class InfluxDBBucketCrawler {
    logger;
    clients = new Map();
    config = new Map();
    constructor() {
        this.logger = pino({ name: 'influxdb-bucket-crawler' });
    }
    /**
     * Connect to an InfluxDB instance
     * connectionString format: "http://host:port?token=xxx&org=xxx"
     */
    async connect(connectionString, alias) {
        const url = new URL(connectionString);
        const token = url.searchParams.get('token') || '';
        const org = url.searchParams.get('org') || 'caelum';
        // Remove query params from URL
        const influxUrl = `${url.protocol}//${url.host}`;
        const influx = new InfluxDB({ url: influxUrl, token });
        const queryApi = influx.getQueryApi(org);
        this.clients.set(alias, { influx, queryApi });
        this.config.set(alias, { url: influxUrl, token, org });
        this.logger.info({ alias, url: influxUrl, org }, 'Connected to InfluxDB instance');
    }
    /**
     * Get all buckets for the organization
     */
    async getBuckets(dbAlias) {
        const config = this.config.get(dbAlias);
        if (!config)
            throw new Error(`InfluxDB ${dbAlias} not connected`);
        const { influx } = this.clients.get(dbAlias);
        // Get buckets using BucketsAPI
        const bucketsAPI = new BucketsAPI(influx);
        const bucketsResponse = await bucketsAPI.getBuckets({ org: config.org });
        return (bucketsResponse.buckets || [])
            .filter(b => !b.name.startsWith('_')) // Exclude system buckets
            .map(b => ({
            id: b.id,
            name: b.name,
            retentionRules: b.retentionRules || [],
        }));
    }
    /**
     * Extract measurements from a bucket
     */
    async extractBucketSchema(dbAlias, bucketName) {
        const config = this.config.get(dbAlias);
        const { queryApi } = this.clients.get(dbAlias);
        if (!config)
            throw new Error(`InfluxDB ${dbAlias} not connected`);
        // Query to get all measurements in the bucket
        const measurementsQuery = `
            import "influxdata/influxdb/schema"
            schema.measurements(bucket: "${bucketName}")
        `;
        const measurements = [];
        const measurementNames = [];
        try {
            for await (const { values, tableMeta } of queryApi.iterateRows(measurementsQuery)) {
                const row = tableMeta.toObject(values);
                if (row._value) {
                    measurementNames.push(row._value);
                }
            }
        }
        catch (error) {
            this.logger.warn({ error, bucket: bucketName }, 'Failed to query measurements, bucket may be empty');
        }
        // For each measurement, get tags and fields
        for (const measurement of measurementNames.slice(0, 20)) {
            // Limit to first 20 measurements
            try {
                const tags = await this.getTags(queryApi, bucketName, measurement);
                const fields = await this.getFields(queryApi, bucketName, measurement);
                measurements.push({
                    name: measurement,
                    tags,
                    fields,
                });
            }
            catch (error) {
                this.logger.error({ error, measurement, bucket: bucketName }, 'Failed to extract measurement schema');
            }
        }
        // Get bucket retention period
        const bucketsAPI = new BucketsAPI(this.clients.get(dbAlias).influx);
        const bucketsResponse = await bucketsAPI.getBuckets({ name: bucketName });
        const bucket = bucketsResponse.buckets?.[0];
        const retentionPeriod = bucket?.retentionRules?.[0]?.everySeconds;
        return {
            database: dbAlias,
            bucketName,
            orgName: config.org,
            retentionPeriod,
            measurements,
            lastScanned: new Date(),
        };
    }
    /**
     * Get tags for a measurement
     */
    async getTags(queryApi, bucket, measurement) {
        const query = `
            import "influxdata/influxdb/schema"
            schema.measurementTagKeys(
                bucket: "${bucket}",
                measurement: "${measurement}"
            )
        `;
        const tags = [];
        try {
            for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
                const row = tableMeta.toObject(values);
                if (row._value) {
                    tags.push(row._value);
                }
            }
        }
        catch (error) {
            // Ignore errors for empty measurements
        }
        return tags;
    }
    /**
     * Get fields for a measurement
     */
    async getFields(queryApi, bucket, measurement) {
        const query = `
            import "influxdata/influxdb/schema"
            schema.measurementFieldKeys(
                bucket: "${bucket}",
                measurement: "${measurement}"
            )
        `;
        const fields = [];
        try {
            for await (const { values, tableMeta } of queryApi.iterateRows(query)) {
                const row = tableMeta.toObject(values);
                if (row._value) {
                    fields.push(row._value);
                }
            }
        }
        catch (error) {
            // Ignore errors for empty measurements
        }
        return fields;
    }
    /**
     * Crawl InfluxDB instance and return all bucket metadata
     */
    async crawlInfluxDB(dbAlias) {
        this.logger.info({ dbAlias }, 'Starting InfluxDB bucket crawl');
        const metadata = [];
        try {
            const buckets = await this.getBuckets(dbAlias);
            for (const bucket of buckets) {
                try {
                    const bucketSchema = await this.extractBucketSchema(dbAlias, bucket.name);
                    // Generate human-readable description
                    const description = this.generateDescription(bucketSchema);
                    // Generate checksum for change detection
                    const checksum = this.generateChecksum(bucketSchema);
                    metadata.push({
                        id: `${dbAlias}.${bucket.name}`,
                        type: 'influxdb',
                        database: dbAlias,
                        objectName: bucket.name,
                        fullName: bucket.name,
                        description,
                        schema: bucketSchema,
                        lastScanned: new Date(),
                        checksum,
                    });
                    this.logger.debug({ bucketName: bucket.name }, 'Extracted bucket schema');
                }
                catch (error) {
                    this.logger.error({
                        bucketName: bucket.name,
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorStack: error instanceof Error ? error.stack : undefined,
                    }, 'Failed to extract bucket schema');
                }
            }
            this.logger.info({ dbAlias, bucketCount: metadata.length }, 'InfluxDB bucket crawl complete');
        }
        catch (error) {
            this.logger.error({
                dbAlias,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to crawl InfluxDB');
        }
        return metadata;
    }
    /**
     * Generate human-readable description for vectorization
     */
    generateDescription(schema) {
        const parts = [];
        parts.push(`InfluxDB bucket ${schema.bucketName} in ${schema.database} (org: ${schema.orgName})`);
        if (schema.retentionPeriod) {
            const days = Math.floor(schema.retentionPeriod / 86400);
            parts.push(`Retention: ${days} days`);
        }
        if (schema.measurements.length > 0) {
            const measurementDescriptions = schema.measurements.map(m => {
                let desc = `${m.name}`;
                if (m.tags.length > 0) {
                    desc += ` (tags: ${m.tags.join(', ')})`;
                }
                if (m.fields.length > 0) {
                    desc += ` (fields: ${m.fields.join(', ')})`;
                }
                return desc;
            });
            parts.push('Measurements: ' + measurementDescriptions.slice(0, 10).join('; '));
        }
        return parts.join('. ');
    }
    /**
     * Generate checksum for change detection
     */
    generateChecksum(schema) {
        const data = JSON.stringify({
            bucketName: schema.bucketName,
            measurements: schema.measurements,
            retentionPeriod: schema.retentionPeriod,
        });
        return createHash('sha256').update(data).digest('hex');
    }
    /**
     * Close all connections
     */
    async close() {
        // InfluxDB client doesn't require explicit close
        this.clients.clear();
        this.logger.info('Closed all InfluxDB connections');
    }
}
//# sourceMappingURL=influxdb-bucket-crawler.js.map