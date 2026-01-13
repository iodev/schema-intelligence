/**
 * Schema Vectorizer
 *
 * Vectorizes database schema information and stores in Qdrant for semantic search
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import pino from 'pino';
import { createHash } from 'crypto';
import { SchemaMetadata } from './types.js';

export interface SchemaVectorizerConfig {
    qdrantUrl: string;
    qdrantCollection: string;
    embeddingModel?: 'voyage' | 'openai' | 'anthropic';
    voyageApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
}

export class SchemaVectorizer {
    private logger: pino.Logger;
    private qdrant: QdrantClient;
    private config: SchemaVectorizerConfig;

    constructor(config: SchemaVectorizerConfig) {
        this.logger = pino({ name: 'schema-vectorizer' });
        this.config = config;
        this.qdrant = new QdrantClient({ url: config.qdrantUrl });
    }

    /**
     * Initialize Qdrant collection for schema vectors
     */
    async initializeCollection(): Promise<void> {
        try {
            // Check if collection exists
            const collections = await this.qdrant.getCollections();
            const exists = collections.collections.some(
                c => c.name === this.config.qdrantCollection
            );

            if (!exists) {
                // Create collection with 1024 dimensions (Voyage AI embedding size)
                await this.qdrant.createCollection(
                    this.config.qdrantCollection,
                    {
                        vectors: {
                            size: 1024,
                            distance: 'Cosine',
                        },
                        optimizers_config: {
                            default_segment_number: 2,
                        },
                    }
                );

                this.logger.info(
                    { collection: this.config.qdrantCollection },
                    'Created Qdrant collection for schemas'
                );
            } else {
                this.logger.info(
                    { collection: this.config.qdrantCollection },
                    'Qdrant collection already exists'
                );
            }
        } catch (error) {
            this.logger.error(
                { error, collection: this.config.qdrantCollection },
                'Failed to initialize Qdrant collection'
            );
            throw error;
        }
    }

    /**
     * Generate embedding for schema description
     */
    private async generateEmbedding(text: string): Promise<number[]> {
        if (this.config.embeddingModel === 'voyage' && this.config.voyageApiKey) {
            return this.generateVoyageEmbedding(text);
        } else if (
            this.config.embeddingModel === 'openai' &&
            this.config.openaiApiKey
        ) {
            return this.generateOpenAIEmbedding(text);
        } else {
            // Default: Simple hash-based embedding (for testing)
            // In production, you'd use a real embedding model
            return this.generateSimpleEmbedding(text);
        }
    }

    /**
     * Generate Voyage AI embedding
     */
    private async generateVoyageEmbedding(text: string): Promise<number[]> {
        const response = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.voyageApiKey}`,
            },
            body: JSON.stringify({
                input: text,
                model: 'voyage-2',
            }),
        });

        const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding;
    }

    /**
     * Generate OpenAI embedding
     */
    private async generateOpenAIEmbedding(text: string): Promise<number[]> {
        const response = await fetch(
            'https://api.openai.com/v1/embeddings',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.openaiApiKey}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-3-small',
                    dimensions: 1024,
                }),
            }
        );

        const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
        return data.data[0].embedding;
    }

    /**
     * Simple embedding for testing (not for production)
     */
    private generateSimpleEmbedding(text: string): number[] {
        // Generate deterministic pseudo-random embedding from text
        const embedding = new Array(1024).fill(0);
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            embedding[i % 1024] += charCode / 1000;
        }
        // Normalize
        const magnitude = Math.sqrt(
            embedding.reduce((sum, val) => sum + val * val, 0)
        );
        return embedding.map(val => val / magnitude);
    }

    /**
     * Generate UUID from string ID (deterministic)
     */
    private generateUUID(id: string): string {
        // Create deterministic UUID from string using hash
        const hash = createHash('md5').update(id).digest('hex');
        // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    }

    /**
     * Vectorize and store a single schema
     */
    async vectorizeSchema(metadata: SchemaMetadata): Promise<void> {
        try {
            // Generate embedding from description
            const embedding = await this.generateEmbedding(metadata.description);

            // Generate UUID from string ID
            const uuid = this.generateUUID(metadata.id);

            // Store in Qdrant
            await this.qdrant.upsert(this.config.qdrantCollection, {
                wait: true,
                points: [
                    {
                        id: uuid,
                        vector: embedding,
                        payload: {
                            schemaId: metadata.id, // Store original ID in payload
                            type: metadata.type,
                            database: metadata.database,
                            objectName: metadata.objectName,
                            fullName: metadata.fullName,
                            description: metadata.description,
                            schema: metadata.schema,
                            lastScanned: metadata.lastScanned.toISOString(),
                            checksum: metadata.checksum,
                        },
                    },
                ],
            });

            this.logger.debug(
                { id: metadata.id, uuid },
                'Vectorized and stored schema'
            );
        } catch (error) {
            this.logger.error(
                { error, id: metadata.id },
                'Failed to vectorize schema'
            );
            throw error;
        }
    }

    /**
     * Vectorize and store multiple schemas in batch
     */
    async vectorizeBatch(metadataList: SchemaMetadata[]): Promise<void> {
        this.logger.info(
            { count: metadataList.length },
            'Vectorizing schema batch'
        );

        const batchSize = 10;
        for (let i = 0; i < metadataList.length; i += batchSize) {
            const batch = metadataList.slice(i, i + batchSize);

            // Process batch in parallel
            await Promise.all(
                batch.map(metadata => this.vectorizeSchema(metadata))
            );

            this.logger.info(
                { processed: Math.min(i + batchSize, metadataList.length), total: metadataList.length },
                'Batch vectorization progress'
            );
        }

        this.logger.info('Batch vectorization complete');
    }

    /**
     * Search schemas by semantic query
     */
    async searchSchemas(
        query: string,
        limit: number = 5
    ): Promise<Array<{
        id: string;
        score: number;
        metadata: any;
    }>> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search Qdrant
            const results = await this.qdrant.search(
                this.config.qdrantCollection,
                {
                    vector: queryEmbedding,
                    limit,
                    with_payload: true,
                }
            );

            return results.map(result => ({
                id: (result.payload as any).schemaId || (result.id as string), // Use schemaId from payload
                score: result.score,
                metadata: result.payload,
            }));
        } catch (error) {
            this.logger.error({ error, query }, 'Schema search failed');
            throw error;
        }
    }

    /**
     * Get schema by exact ID
     */
    async getSchemaById(id: string): Promise<any | null> {
        try {
            const uuid = this.generateUUID(id);
            const result = await this.qdrant.retrieve(
                this.config.qdrantCollection,
                {
                    ids: [uuid],
                    with_payload: true,
                    with_vector: false,
                }
            );

            return result.length > 0 ? result[0].payload : null;
        } catch (error) {
            this.logger.error({ error, id }, 'Failed to retrieve schema');
            return null;
        }
    }

    /**
     * Delete schema from vector store
     */
    async deleteSchema(id: string): Promise<void> {
        try {
            const uuid = this.generateUUID(id);
            await this.qdrant.delete(this.config.qdrantCollection, {
                wait: true,
                points: [uuid],
            });

            this.logger.debug({ id, uuid }, 'Deleted schema from vector store');
        } catch (error) {
            this.logger.error({ error, id }, 'Failed to delete schema');
            throw error;
        }
    }

    /**
     * Get all schemas for a specific database
     */
    async getDatabaseSchemas(database: string): Promise<any[]> {
        try {
            const results = await this.qdrant.scroll(
                this.config.qdrantCollection,
                {
                    filter: {
                        must: [
                            {
                                key: 'database',
                                match: { value: database },
                            },
                        ],
                    },
                    limit: 1000,
                    with_payload: true,
                    with_vector: false,
                }
            );

            return results.points.map(point => point.payload);
        } catch (error) {
            this.logger.error({ error, database }, 'Failed to get database schemas');
            throw error;
        }
    }

    /**
     * Get collection statistics
     */
    async getStats(): Promise<{
        totalSchemas: number;
        databases: Record<string, number>;
    }> {
        try {
            const collectionInfo = await this.qdrant.getCollection(
                this.config.qdrantCollection
            );

            // Get counts by database
            const allSchemas = await this.qdrant.scroll(
                this.config.qdrantCollection,
                {
                    limit: 10000,
                    with_payload: true,
                    with_vector: false,
                }
            );

            const databases: Record<string, number> = {};
            for (const point of allSchemas.points) {
                const db = (point.payload as any).database;
                databases[db] = (databases[db] || 0) + 1;
            }

            return {
                totalSchemas: collectionInfo.points_count || 0,
                databases,
            };
        } catch (error) {
            this.logger.error({ error }, 'Failed to get stats');
            throw error;
        }
    }
}
