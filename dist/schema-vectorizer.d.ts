/**
 * Schema Vectorizer
 *
 * Vectorizes database schema information and stores in Qdrant for semantic search
 */
import { SchemaMetadata } from './types.js';
export interface SchemaVectorizerConfig {
    qdrantUrl: string;
    qdrantCollection: string;
    embeddingModel?: 'voyage' | 'openai' | 'anthropic' | 'simple';
    voyageApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
}
interface StoredSchemaPayload {
    schemaId: string;
    type: string;
    database: string;
    objectName: string;
    fullName: string;
    description: string;
    schema: unknown;
    lastScanned: string;
    checksum: string;
}
export declare class SchemaVectorizer {
    private logger;
    private qdrant;
    private config;
    constructor(config: SchemaVectorizerConfig);
    /**
     * Initialize Qdrant collection for schema vectors
     */
    initializeCollection(): Promise<void>;
    /**
     * Generate embedding for schema description
     */
    private generateEmbedding;
    /**
     * Generate Voyage AI embedding
     */
    private generateVoyageEmbedding;
    /**
     * Generate OpenAI embedding
     */
    private generateOpenAIEmbedding;
    /**
     * Simple embedding for testing (not for production)
     */
    private generateSimpleEmbedding;
    /**
     * Generate UUID from string ID (deterministic)
     */
    private generateUUID;
    /**
     * Vectorize and store a single schema
     */
    vectorizeSchema(metadata: SchemaMetadata): Promise<void>;
    /**
     * Vectorize and store multiple schemas in batch
     */
    vectorizeBatch(metadataList: SchemaMetadata[]): Promise<void>;
    /**
     * Search schemas by semantic query
     */
    searchSchemas(query: string, limit?: number, database?: string): Promise<Array<{
        id: string;
        score: number;
        metadata: StoredSchemaPayload;
    }>>;
    /**
     * Get schema by exact ID
     */
    getSchemaById(id: string): Promise<Record<string, unknown> | null>;
    /**
     * Delete schema from vector store
     */
    deleteSchema(id: string): Promise<void>;
    /**
     * Get all schemas for a specific database
     */
    getDatabaseSchemas(database: string): Promise<Record<string, unknown>[]>;
    /**
     * Get collection statistics
     */
    getStats(): Promise<{
        totalSchemas: number;
        databases: Record<string, number>;
    }>;
}
export {};
//# sourceMappingURL=schema-vectorizer.d.ts.map