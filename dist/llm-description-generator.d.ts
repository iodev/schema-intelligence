/**
 * LLM Description Generator
 *
 * Provides LLM-powered semantic descriptions for database schemas,
 * replacing the template-based generateDescription() methods in each crawler.
 */
import type { SchemaMetadata, LLMConfig } from './types.js';
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
/**
 * Preserves the existing template-based description behavior.
 * No external API calls are made.
 */
export declare class TemplateLLMProvider implements LLMProvider {
    readonly name = "template";
    generateCompletion(_systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
    private generateTemplateDescription;
    private describeTable;
    private describeMongoDB;
    private describeRedis;
    private describeInfluxDB;
}
export declare class OpenAILLMProvider implements LLMProvider {
    readonly name = "openai";
    private model;
    private apiKey;
    constructor(apiKey: string, model?: string);
    generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
}
export declare class AnthropicLLMProvider implements LLMProvider {
    readonly name = "anthropic";
    private model;
    private apiKey;
    constructor(apiKey: string, model?: string);
    generateCompletion(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
}
export interface LLMDescriptionGeneratorOptions {
    provider: LLMProvider;
    concurrency?: number;
    cacheEnabled?: boolean;
}
export declare class LLMDescriptionGenerator {
    private provider;
    private semaphore;
    private cacheEnabled;
    private cache;
    constructor(options: LLMDescriptionGeneratorOptions);
    /**
     * Generate a rich, human-readable description for a single schema.
     */
    generateDescription(metadata: SchemaMetadata): Promise<string>;
    /**
     * Generate descriptions for a batch of schemas with concurrency control.
     */
    generateBatchDescriptions(metadatas: SchemaMetadata[]): Promise<Map<string, string>>;
    /**
     * Clear the internal description cache
     */
    clearCache(): void;
    /**
     * Get the current cache size
     */
    get cacheSize(): number;
    /** Visible for testing */
    buildSystemPrompt(): string;
    /** Visible for testing */
    buildUserPrompt(metadata: SchemaMetadata): string;
    private buildPostgresPrompt;
    private buildMySQLPrompt;
    private buildMongoPrompt;
    private buildRedisPrompt;
    private buildInfluxDBPrompt;
    private wrapSchemaPrompt;
    private serializeTableSchema;
    private buildRelationalContext;
    private buildMongoFieldTypeDistribution;
    private buildMongoIndexStrategy;
    private buildRedisKeyPatternSemantics;
    private buildInfluxMeasurementSemantics;
}
/**
 * Create an LLMDescriptionGenerator from the config's llm section.
 * Returns undefined if no LLM config is present.
 */
export declare function createLLMDescriptionGenerator(llmConfig: LLMConfig | undefined): LLMDescriptionGenerator | undefined;
/**
 * Compute a checksum for a schema metadata's content (used externally when
 * the caller needs a cache key independent of the metadata.checksum field).
 */
export declare function computeSchemaChecksum(metadata: SchemaMetadata): string;
//# sourceMappingURL=llm-description-generator.d.ts.map