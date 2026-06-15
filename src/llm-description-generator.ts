/**
 * LLM Description Generator
 *
 * Provides LLM-powered semantic descriptions for database schemas,
 * replacing the template-based generateDescription() methods in each crawler.
 */

import { createHash } from 'crypto';
import type {
    SchemaMetadata,
    PostgresSchemaMetadata,
    MongoSchemaMetadata,
    MySQLSchemaMetadata,
    RedisSchemaMetadata,
    InfluxDBSchemaMetadata,
    TableSchema,
    MongoCollectionSchema,
    RedisPatternSchema,
    InfluxBucketSchema,
    LLMConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// LLM Provider Interface
// ---------------------------------------------------------------------------

/**
 * Response shape returned by all LLM providers
 */
export interface LLMResponse {
    text: string;
    tokensUsed?: number;
}

/**
 * Abstraction for LLM completion providers
 */
export interface LLMProvider {
    /**
     * Generate a completion given a system prompt and user prompt
     */
    generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;

    /**
     * Name of the provider (for logging)
     */
    readonly name: string;
}

// ---------------------------------------------------------------------------
// Template LLM Provider (fallback — no API calls)
// ---------------------------------------------------------------------------

/**
 * Preserves the existing template-based description behavior.
 * No external API calls are made.
 */
export class TemplateLLMProvider implements LLMProvider {
    readonly name = 'template';

    async generateCompletion(_systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
        // The user prompt already contains the schema details.
        // We parse it and produce a template description matching the
        // original crawler behavior.
        return { text: this.generateTemplateDescription(userPrompt) };
    }

    private generateTemplateDescription(prompt: string): string {
        // Extract the JSON schema block between the fences
        const jsonMatch = prompt.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            return 'Database schema object.';
        }

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        } catch {
            return 'Database schema object.';
        }

        const schemaType = parsed['schemaType'] as string | undefined;

        switch (schemaType) {
            case 'postgresql':
            case 'mysql':
                return this.describeTable(parsed);
            case 'mongodb':
                return this.describeMongoDB(parsed);
            case 'redis':
                return this.describeRedis(parsed);
            case 'influxdb':
                return this.describeInfluxDB(parsed);
            default:
                return 'Database schema object.';
        }
    }

    private describeTable(parsed: Record<string, unknown>): string {
        const schema = parsed['schema'] as Record<string, unknown> | undefined;
        if (!schema) return 'Database table.';

        const parts: string[] = [];
        const schemaName = schema['schema'] as string | undefined;
        const tableName = schema['tableName'] as string | undefined;
        const database = schema['database'] as string | undefined;

        parts.push(`Table ${schemaName}.${tableName} in ${database} database`);

        const description = schema['description'] as string | undefined;
        if (description) {
            parts.push(description);
        }

        const columns = schema['columns'] as Array<Record<string, unknown>> | undefined;
        if (columns && columns.length > 0) {
            const colDescs = columns.map(col => {
                let desc = `${col['name']} (${col['type']}`;
                if (col['isPrimaryKey']) desc += ', PRIMARY KEY';
                if (col['isForeignKey']) {
                    const fk = col['foreignKeyTarget'] as Record<string, unknown> | undefined;
                    desc += `, FOREIGN KEY to ${fk?.['table']}`;
                }
                if (!col['nullable']) desc += ', NOT NULL';
                desc += ')';
                const colDesc = col['description'] as string | undefined;
                if (colDesc) desc += ` - ${colDesc}`;
                return desc;
            });
            parts.push('Columns: ' + colDescs.join(', '));
        }

        const indexes = schema['indexes'] as Array<Record<string, unknown>> | undefined;
        if (indexes && indexes.length > 0) {
            const idxDescs = indexes
                .filter(idx => !idx['isPrimary'])
                .map(idx => {
                    const cols = Array.isArray(idx['columns'])
                        ? (idx['columns'] as string[]).join(', ')
                        : String(idx['columns']).replace(/[{}]/g, '');
                    return `${idx['name']} on (${cols})`;
                });
            if (idxDescs.length > 0) {
                parts.push('Indexes: ' + idxDescs.join(', '));
            }
        }

        const rowCount = schema['rowCount'] as number | undefined;
        if (rowCount != null) {
            parts.push(`Row count: ${rowCount.toLocaleString()}`);
        }

        return parts.join('. ');
    }

    private describeMongoDB(parsed: Record<string, unknown>): string {
        const schema = parsed['schema'] as Record<string, unknown> | undefined;
        if (!schema) return 'MongoDB collection.';

        const parts: string[] = [];
        parts.push(
            `MongoDB collection ${schema['collectionName']} in ${schema['database']} database`
        );

        const fields = schema['fields'] as Array<Record<string, unknown>> | undefined;
        if (fields && fields.length > 0) {
            const fieldDescs = fields.map(field => {
                const types = field['types'] as string[];
                let desc = `${field['name']} (${types.join('|')})`;
                if (field['nullable']) desc += ', nullable';
                return desc;
            });
            parts.push('Fields: ' + fieldDescs.slice(0, 20).join(', '));
        }

        const indexes = schema['indexes'] as Array<Record<string, unknown>> | undefined;
        if (indexes && indexes.length > 0) {
            const idxDescs = indexes
                .filter(idx => idx['name'] !== '_id_')
                .map(idx => {
                    const keys = Object.keys(idx['keys'] as Record<string, unknown>).join(', ');
                    return `${idx['name']} on (${keys})`;
                });
            if (idxDescs.length > 0) {
                parts.push('Indexes: ' + idxDescs.join(', '));
            }
        }

        const docCount = schema['documentCount'] as number | undefined;
        if (docCount != null) {
            parts.push(`Document count: ${docCount.toLocaleString()}`);
        }

        return parts.join('. ');
    }

    private describeRedis(parsed: Record<string, unknown>): string {
        const schema = parsed['schema'] as Record<string, unknown> | undefined;
        if (!schema) return 'Redis instance.';

        const parts: string[] = [];
        parts.push(`Redis instance ${schema['database']} with ${schema['totalKeys']} keys`);

        const patterns = schema['patterns'] as Array<Record<string, unknown>> | undefined;
        if (patterns && patterns.length > 0) {
            const patDescs = patterns.slice(0, 10).map(p => {
                let desc = `${p['pattern']} (${p['type']}, ${p['count']} keys)`;
                if (p['ttl']) {
                    desc += `, TTL: ${p['ttl']}s`;
                }
                return desc;
            });
            parts.push('Key patterns: ' + patDescs.join(', '));
        }

        return parts.join('. ');
    }

    private describeInfluxDB(parsed: Record<string, unknown>): string {
        const schema = parsed['schema'] as Record<string, unknown> | undefined;
        if (!schema) return 'InfluxDB bucket.';

        const parts: string[] = [];
        parts.push(
            `InfluxDB bucket ${schema['bucketName']} in ${schema['database']} (org: ${schema['orgName']})`
        );

        const retentionPeriod = schema['retentionPeriod'] as number | undefined;
        if (retentionPeriod) {
            const days = Math.floor(retentionPeriod / 86400);
            parts.push(`Retention: ${days} days`);
        }

        const measurements = schema['measurements'] as Array<Record<string, unknown>> | undefined;
        if (measurements && measurements.length > 0) {
            const mDescs = measurements.map(m => {
                let desc = `${m['name']}`;
                const tags = m['tags'] as string[];
                const fields = m['fields'] as string[];
                if (tags.length > 0) {
                    desc += ` (tags: ${tags.join(', ')})`;
                }
                if (fields.length > 0) {
                    desc += ` (fields: ${fields.join(', ')})`;
                }
                return desc;
            });
            parts.push('Measurements: ' + mDescs.slice(0, 10).join('; '));
        }

        return parts.join('. ');
    }
}

// ---------------------------------------------------------------------------
// OpenAI LLM Provider
// ---------------------------------------------------------------------------

export class OpenAILLMProvider implements LLMProvider {
    readonly name = 'openai';
    private model: string;
    private apiKey: string;

    constructor(apiKey: string, model: string = 'gpt-4o-mini') {
        this.apiKey = apiKey;
        this.model = model;
    }

    async generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
        // Dynamic import so the dependency is truly optional at runtime
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: this.apiKey });

        const response = await client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1024,
        });

        const text = response.choices[0]?.message?.content ?? '';
        const tokensUsed = response.usage?.total_tokens;

        return { text, tokensUsed };
    }
}

// ---------------------------------------------------------------------------
// Anthropic LLM Provider
// ---------------------------------------------------------------------------

export class AnthropicLLMProvider implements LLMProvider {
    readonly name = 'anthropic';
    private model: string;
    private apiKey: string;

    constructor(apiKey: string, model: string = 'claude-3-5-haiku-latest') {
        this.apiKey = apiKey;
        this.model = model;
    }

    async generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: this.apiKey });

        const response = await client.messages.create({
            model: this.model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt },
            ],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        const tokensUsed = response.usage
            ? response.usage.input_tokens + response.usage.output_tokens
            : undefined;

        return { text, tokensUsed };
    }
}

// ---------------------------------------------------------------------------
// Semaphore (concurrency limiter)
// ---------------------------------------------------------------------------

class Semaphore {
    private queue: Array<() => void> = [];
    private active = 0;

    constructor(private readonly maxConcurrency: number) {}

    async acquire(): Promise<void> {
        if (this.active < this.maxConcurrency) {
            this.active++;
            return;
        }
        return new Promise<void>(resolve => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        this.active--;
        const next = this.queue.shift();
        if (next) {
            this.active++;
            next();
        }
    }
}

// ---------------------------------------------------------------------------
// LLM Description Generator Options
// ---------------------------------------------------------------------------

export interface LLMDescriptionGeneratorOptions {
    provider: LLMProvider;
    concurrency?: number;
    cacheEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// LLM Description Generator
// ---------------------------------------------------------------------------

export class LLMDescriptionGenerator {
    private provider: LLMProvider;
    private semaphore: Semaphore;
    private cacheEnabled: boolean;
    private cache: Map<string, string> = new Map();

    constructor(options: LLMDescriptionGeneratorOptions) {
        this.provider = options.provider;
        this.semaphore = new Semaphore(options.concurrency ?? 5);
        this.cacheEnabled = options.cacheEnabled ?? true;
    }

    /**
     * Generate a rich, human-readable description for a single schema.
     */
    async generateDescription(metadata: SchemaMetadata): Promise<string> {
        // Check cache before acquiring semaphore
        if (this.cacheEnabled) {
            const cached = this.cache.get(metadata.checksum);
            if (cached !== undefined) {
                return cached;
            }
        }

        await this.semaphore.acquire();
        try {
            // Double-check cache after acquiring semaphore to avoid duplicate LLM calls
            if (this.cacheEnabled) {
                const cached = this.cache.get(metadata.checksum);
                if (cached !== undefined) {
                    return cached;
                }
            }

            const systemPrompt = this.buildSystemPrompt();
            const userPrompt = this.buildUserPrompt(metadata);

            const response = await this.provider.generateCompletion(systemPrompt, userPrompt);
            const description = response.text.trim() || metadata.description;

            if (this.cacheEnabled) {
                this.cache.set(metadata.checksum, description);
            }

            return description;
        } finally {
            this.semaphore.release();
        }
    }

    /**
     * Generate descriptions for a batch of schemas with concurrency control.
     */
    async generateBatchDescriptions(
        metadatas: SchemaMetadata[]
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        const tasks = metadatas.map(async (metadata) => {
            const description = await this.generateDescription(metadata);
            results.set(metadata.id, description);
        });

        await Promise.all(tasks);
        return results;
    }

    /**
     * Clear the internal description cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get the current cache size
     */
    get cacheSize(): number {
        return this.cache.size;
    }

    // ---------------------------------------------------------------------------
    // Prompt Building
    // ---------------------------------------------------------------------------

    /** Visible for testing */
    buildSystemPrompt(): string {
        return [
            'You are a database documentation expert. Given a database schema, produce a clear,',
            'human-readable description that explains:',
            '1. The likely purpose of the table/collection/key-pattern/bucket.',
            '2. Notable design patterns (e.g., soft-delete flags, polymorphic columns, audit timestamps).',
            '3. What kinds of queries or workloads this schema likely serves.',
            '',
            'Format your response as:',
            '- A 1-2 sentence summary.',
            '- Then bullet points for notable details (columns, relationships, indexes, patterns).',
            '',
            'Be concise but thorough. Keep descriptions under 200 words.',
            'Return plain text only — no markdown formatting, fences, or headings.',
        ].join('\n');
    }

    /** Visible for testing */
    buildUserPrompt(metadata: SchemaMetadata): string {
        switch (metadata.type) {
            case 'postgresql':
                return this.buildPostgresPrompt(metadata);
            case 'mysql':
                return this.buildMySQLPrompt(metadata);
            case 'mongodb':
                return this.buildMongoPrompt(metadata);
            case 'redis':
                return this.buildRedisPrompt(metadata);
            case 'influxdb':
                return this.buildInfluxDBPrompt(metadata);
            default: {
                const _exhaustive: never = metadata;
                throw new Error(`Unknown schema type: ${(_exhaustive as SchemaMetadata).type}`);
            }
        }
    }

    private buildPostgresPrompt(metadata: PostgresSchemaMetadata): string {
        const s = metadata.schema;
        const payload = {
            schemaType: 'postgresql' as const,
            schema: this.serializeTableSchema(s),
        };
        return this.wrapSchemaPrompt(
            `PostgreSQL table "${s.schema}.${s.tableName}" in database "${s.database}".`,
            payload,
            this.buildRelationalContext(s),
        );
    }

    private buildMySQLPrompt(metadata: MySQLSchemaMetadata): string {
        const s = metadata.schema;
        const payload = {
            schemaType: 'mysql' as const,
            schema: this.serializeTableSchema(s),
        };
        return this.wrapSchemaPrompt(
            `MySQL table "${s.schema}.${s.tableName}" in database "${s.database}".`,
            payload,
            this.buildRelationalContext(s),
        );
    }

    private buildMongoPrompt(metadata: MongoSchemaMetadata): string {
        const s = metadata.schema;
        const typeDist = this.buildMongoFieldTypeDistribution(s);
        const indexStrategy = this.buildMongoIndexStrategy(s);
        const payload = {
            schemaType: 'mongodb' as const,
            schema: s,
        };
        return this.wrapSchemaPrompt(
            `MongoDB collection "${s.collectionName}" in database "${s.database}".`,
            payload,
            [
                `Field type distribution: ${typeDist}`,
                `Index strategy: ${indexStrategy}`,
            ].join('\n'),
        );
    }

    private buildRedisPrompt(metadata: RedisSchemaMetadata): string {
        const s = metadata.schema;
        const keySemantics = this.buildRedisKeyPatternSemantics(s);
        const payload = {
            schemaType: 'redis' as const,
            schema: s,
        };
        return this.wrapSchemaPrompt(
            `Redis instance "${s.database}" with ${s.totalKeys} keys.`,
            payload,
            `Key pattern semantics:\n${keySemantics}`,
        );
    }

    private buildInfluxDBPrompt(metadata: InfluxDBSchemaMetadata): string {
        const s = metadata.schema;
        const measurementSemantics = this.buildInfluxMeasurementSemantics(s);
        const payload = {
            schemaType: 'influxdb' as const,
            schema: s,
        };
        return this.wrapSchemaPrompt(
            `InfluxDB bucket "${s.bucketName}" in org "${s.orgName}" (database alias: "${s.database}").`,
            payload,
            `Measurement/tag/field semantics:\n${measurementSemantics}`,
        );
    }

    // ---------------------------------------------------------------------------
    // Prompt helpers
    // ---------------------------------------------------------------------------

    private wrapSchemaPrompt(
        intro: string,
        payload: Record<string, unknown>,
        extraContext: string,
    ): string {
        const lines: string[] = [
            `Describe the following database schema object.`,
            '',
            intro,
            '',
            '```json',
            JSON.stringify(payload, null, 2),
            '```',
        ];
        if (extraContext) {
            lines.push('', 'Additional context:', extraContext);
        }
        return lines.join('\n');
    }

    private serializeTableSchema(s: TableSchema): Record<string, unknown> {
        return {
            database: s.database,
            schema: s.schema,
            tableName: s.tableName,
            columns: s.columns,
            indexes: s.indexes,
            constraints: s.constraints,
            rowCount: s.rowCount,
            sizeBytes: s.sizeBytes,
            description: s.description,
        };
    }

    private buildRelationalContext(s: TableSchema): string {
        const fkCols = s.columns.filter(c => c.isForeignKey && c.foreignKeyTarget);
        if (fkCols.length === 0) return 'No foreign key relationships.';
        const lines = fkCols.map(c =>
            `- ${c.name} -> ${c.foreignKeyTarget!.table}.${c.foreignKeyTarget!.column}`
        );
        return `Foreign key relationships:\n${lines.join('\n')}`;
    }

    private buildMongoFieldTypeDistribution(s: MongoCollectionSchema): string {
        const typeCounts = new Map<string, number>();
        for (const field of s.fields) {
            for (const t of field.types) {
                typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
            }
        }
        const entries = Array.from(typeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([t, c]) => `${t}: ${c}`)
            .join(', ');
        return entries || 'no fields';
    }

    private buildMongoIndexStrategy(s: MongoCollectionSchema): string {
        if (s.indexes.length === 0) return 'No indexes defined.';
        return s.indexes
            .map(idx => {
                const keys = Object.entries(idx.keys)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(', ');
                return `${idx.name} (${keys})${idx.unique ? ' [unique]' : ''}`;
            })
            .join('; ');
    }

    private buildRedisKeyPatternSemantics(s: RedisPatternSchema): string {
        if (s.patterns.length === 0) return 'No key patterns found.';
        return s.patterns
            .slice(0, 15)
            .map(p => {
                let line = `- "${p.pattern}" type=${p.type} count=${p.count}`;
                if (p.ttl) line += ` ttl=${p.ttl}s`;
                if (p.exampleKeys.length > 0) line += ` examples=[${p.exampleKeys.slice(0, 2).join(', ')}]`;
                return line;
            })
            .join('\n');
    }

    private buildInfluxMeasurementSemantics(s: InfluxBucketSchema): string {
        if (s.measurements.length === 0) return 'No measurements found.';
        const lines: string[] = [];
        if (s.retentionPeriod) {
            lines.push(`Retention period: ${Math.floor(s.retentionPeriod / 86400)} days`);
        }
        for (const m of s.measurements.slice(0, 15)) {
            let line = `- Measurement "${m.name}"`;
            if (m.tags.length > 0) line += ` tags=[${m.tags.join(', ')}]`;
            if (m.fields.length > 0) line += ` fields=[${m.fields.join(', ')}]`;
            lines.push(line);
        }
        return lines.join('\n');
    }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Create an LLMDescriptionGenerator from the config's llm section.
 * Returns undefined if no LLM config is present.
 */
export function createLLMDescriptionGenerator(
    llmConfig: LLMConfig | undefined
): LLMDescriptionGenerator | undefined {
    if (!llmConfig) return undefined;

    let provider: LLMProvider;

    switch (llmConfig.provider) {
        case 'openai':
            if (!llmConfig.apiKey) {
                throw new Error('OpenAI API key is required when provider is "openai". Set llm.apiKey in config.');
            }
            provider = new OpenAILLMProvider(
                llmConfig.apiKey,
                llmConfig.model
            );
            break;
        case 'anthropic':
            if (!llmConfig.apiKey) {
                throw new Error('Anthropic API key is required when provider is "anthropic". Set llm.apiKey in config.');
            }
            provider = new AnthropicLLMProvider(
                llmConfig.apiKey,
                llmConfig.model
            );
            break;
        case 'template':
        default:
            provider = new TemplateLLMProvider();
            break;
    }

    return new LLMDescriptionGenerator({
        provider,
        concurrency: llmConfig.maxConcurrency,
        cacheEnabled: llmConfig.cacheDescriptions,
    });
}

/**
 * Compute a checksum for a schema metadata's content (used externally when
 * the caller needs a cache key independent of the metadata.checksum field).
 */
export function computeSchemaChecksum(metadata: SchemaMetadata): string {
    const data = JSON.stringify({ type: metadata.type, schema: metadata.schema });
    return createHash('sha256').update(data).digest('hex');
}
