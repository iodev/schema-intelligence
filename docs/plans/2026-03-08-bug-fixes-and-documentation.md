# Design: Bug Fixes and Comprehensive Documentation

**Date:** 2026-03-08  
**Author:** Schema Intelligence Team  
**Status:** Approved

## Overview

This design document outlines comprehensive bug fixes identified through multi-LLM code review and the creation of comprehensive documentation for the Schema Intelligence project. The work is divided into two major phases: (1) fixing all identified bugs using a strategy pattern refactor, and (2) creating comprehensive documentation reflecting the fixed codebase.

## Background

A multi-LLM code review (using Ollama/Qwen3-Coder and xAI/Grok-3-mini) identified critical bugs and architectural issues in the `SchemaIntelligenceService`:

### Critical Issues
- MongoDB, Redis, and InfluxDB crawlers are initialized but never scanned
- Only PostgreSQL connections are closed in shutdown (MySQL, MongoDB, Redis, InfluxDB leak resources)
- Missing `detectChanges()` implementation referenced but not defined

### Security Issues
- Connection strings logged without sanitization (credential exposure)
- No configuration validation
- Sensitive schema data potentially sent to external LLM APIs

### Performance Issues
- Sequential database connections (blocking)
- Sequential scanning (inefficient)
- Unbounded in-memory metadata growth
- No protection against overlapping scans

## Goals

1. **Fix all identified bugs** comprehensively using structural refactoring
2. **Eliminate root causes** of bugs through better architecture
3. **Improve security** with credential sanitization and validation
4. **Improve performance** with parallelization and memory management
5. **Create comprehensive documentation** for users and developers

## Design

### Phase 1: Bug Fixes via Strategy Pattern Refactor

#### 1.1 Database Crawler Strategy Pattern

**Problem:** Five separate crawler maps with repetitive if-else chains in `initialize()`, `scanAllDatabases()`, and `shutdown()` led to bugs where database types were handled inconsistently.

**Solution:** Introduce a unified strategy pattern.

**Interface Definition** (in `types.ts`):
```typescript
export interface DatabaseCrawlerStrategy {
    type: DatabaseType;
    connect(connectionString: string, alias: string): Promise<void>;
    crawl(alias: string): Promise<SchemaMetadata[]>;
    close(): Promise<void>;
}
```

**Adapter Implementations:** Create adapter classes for each existing crawler:

```typescript
// PostgreSQL Adapter
export class PostgresCrawlerAdapter implements DatabaseCrawlerStrategy {
    type: DatabaseType = 'postgresql';
    private crawler = new PostgreschemaCrawler();
    
    async connect(connectionString: string, alias: string): Promise<void> {
        await this.crawler.connect(connectionString, alias);
    }
    
    async crawl(alias: string): Promise<SchemaMetadata[]> {
        return this.crawler.crawlDatabase(alias);
    }
    
    async close(): Promise<void> {
        await this.crawler.close();
    }
}

// Similar adapters for MySQL, MongoDB, Redis, InfluxDB...
```

**Factory Function:**
```typescript
function createCrawlerStrategy(type: DatabaseType): DatabaseCrawlerStrategy {
    switch (type) {
        case 'postgresql': return new PostgresCrawlerAdapter();
        case 'mysql': return new MySQLCrawlerAdapter();
        case 'mongodb': return new MongoDBCrawlerAdapter();
        case 'redis': return new RedisCrawlerAdapter();
        case 'influxdb': return new InfluxDBCrawlerAdapter();
        default: throw new Error(`Unknown database type: ${type}`);
    }
}
```

**Service Refactor:** Replace five crawler maps with one:

```typescript
export class SchemaIntelligenceService {
    private crawlers: Map<string, DatabaseCrawlerStrategy> = new Map();
    
    // Remove: postgresCrawlers, mysqlCrawlers, mongoCrawlers, redisCrawlers, influxCrawlers
}
```

**Benefits:**
- Single loop handles all database types uniformly in all methods
- Impossible to forget a database type
- Easy to add new database types
- Eliminates ~200 lines of repetitive code

#### 1.2 Security Improvements

**Connection String Sanitization:**
```typescript
private sanitizeConnectionString(connectionString: string): string {
    // Replace user:pass with ***:***
    return connectionString
        .replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
        .replace(/\?.*token=([^&]+)/, '?...token=***'); // InfluxDB tokens
}
```

Apply to all logging that includes connection information.

**Configuration Validation:**
```typescript
constructor(config: SchemaCrawlerConfig) {
    this.validateConfig(config);
    // ... rest of constructor
}

private validateConfig(config: SchemaCrawlerConfig): void {
    if (!config.databases?.length) {
        throw new Error('At least one database must be configured');
    }
    if (!config.qdrantUrl) {
        throw new Error('qdrantUrl is required');
    }
    if (!config.qdrantCollection) {
        throw new Error('qdrantCollection is required');
    }
    
    for (const db of config.databases) {
        if (!db.type) {
            throw new Error('Database type is required');
        }
        if (!db.connectionString) {
            throw new Error('Database connectionString is required');
        }
        const validTypes: DatabaseType[] = ['postgresql', 'mysql', 'mongodb', 'redis', 'influxdb'];
        if (!validTypes.includes(db.type)) {
            throw new Error(`Invalid database type: ${db.type}`);
        }
    }
}
```

**LLM Data Safety:**
Add clear documentation warnings about LLM enrichment sending schema metadata to external APIs.

#### 1.3 Performance Improvements

**Parallel Database Connections:**
```typescript
async initialize(): Promise<void> {
    this.logger.info('Initializing Schema Intelligence Service');
    
    await this.vectorizer.initializeCollection();
    
    // Connect to all databases in parallel
    const connectionPromises = this.config.databases.map(async (dbConfig) => {
        try {
            const crawler = createCrawlerStrategy(dbConfig.type);
            const alias = this.extractDbName(dbConfig.connectionString);
            await crawler.connect(dbConfig.connectionString, alias);
            this.crawlers.set(alias, crawler);
            this.logger.info(
                { database: this.sanitizeConnectionString(alias), type: dbConfig.type },
                'Connected to database'
            );
        } catch (error) {
            this.logger.error(
                { error, type: dbConfig.type },
                'Failed to connect to database'
            );
        }
    });
    
    await Promise.allSettled(connectionPromises);
    
    // ... rest of initialize
}
```

**Memory Management:**
```typescript
private readonly MAX_METADATA_HISTORY = 10000; // Make configurable via config

// In scanAllDatabases(), after storing metadata:
if (this.latestMetadata.length > this.MAX_METADATA_HISTORY) {
    const excess = this.latestMetadata.length - this.MAX_METADATA_HISTORY;
    this.latestMetadata.splice(0, excess);
    this.logger.warn(
        { evicted: excess },
        'Evicted old metadata to stay within memory limits'
    );
}
```

**Scan Overlap Protection:**
```typescript
private isScanning: boolean = false;

async scanAllDatabases(): Promise<void> {
    if (this.isScanning) {
        this.logger.warn('Scan already in progress, skipping');
        return;
    }
    
    this.isScanning = true;
    try {
        // ... existing scan logic
    } finally {
        this.isScanning = false;
    }
}
```

#### 1.4 Error Handling Improvements

**Graceful Degradation:**
```typescript
async scanAllDatabases(): Promise<void> {
    this.logger.info('Starting full database scan');
    const allMetadata: SchemaMetadata[] = [];
    const errors: Array<{ alias: string; error: Error }> = [];

    // Scan all databases in parallel with graceful degradation
    const scanPromises = Array.from(this.crawlers.entries()).map(async ([alias, crawler]) => {
        try {
            const metadata = await crawler.crawl(alias);
            return { alias, metadata, success: true };
        } catch (error) {
            this.logger.error({ error, database: alias }, 'Failed to crawl database');
            errors.push({ alias, error: error as Error });
            return { alias, metadata: [], success: false };
        }
    });

    const results = await Promise.allSettled(scanPromises);
    
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
            allMetadata.push(...result.value.metadata);
        }
    }

    if (errors.length > 0) {
        this.logger.warn(
            { failedDatabases: errors.map(e => e.alias), totalErrors: errors.length },
            'Some databases failed to scan'
        );
    }
    
    // ... rest of scan logic
}
```

**Sanitized Error Logging:**
```typescript
catch (error) {
    const sanitizedError = {
        message: error.message,
        code: error.code,
        // Don't include full stack traces or sensitive data
    };
    this.logger.error(
        { error: sanitizedError, database: alias, type: crawler.type },
        'Database operation failed'
    );
}
```

### Phase 2: Comprehensive Documentation

#### 2.1 Documentation Structure

Create the following documentation files:

1. **`docs/architecture.md`** (~500-800 words)
   - System overview with component diagram
   - Database crawler architecture (strategy pattern)
   - Vectorization pipeline flow
   - Change detection mechanism
   - Data flow diagrams (ASCII or Mermaid)

2. **`docs/api.md`** (~800-1200 words)
   - HTTP API endpoints (from `http-router.ts`)
   - MCP Server tools, resources, and prompts (from `mcp-server.ts`)
   - Request/response examples with curl commands
   - Error codes and handling
   - Authentication (if applicable)

3. **`docs/development.md`** (~600-900 words)
   - Development environment setup (prerequisites, dependencies)
   - Running tests (unit, integration, with Docker)
   - Debugging tips (logging, breakpoints, common issues)
   - Code style guidelines (TypeScript, ESLint, Prettier)
   - How to add new database types (step-by-step)
   - Git workflow and branching strategy

4. **`docs/deployment.md`** (~700-1000 words)
   - Docker deployment instructions (Dockerfile, docker-compose)
   - Configuration options (all environment variables)
   - Production best practices (resource limits, health checks)
   - Monitoring and logging setup (Prometheus, Grafana)
   - Security considerations (secrets, network, access control)
   - Kubernetes deployment examples

5. **`CHANGELOG.md`** (at root level)
   - Version 0.1.0 entry documenting:
     - MySQL support addition
     - MCP server integration
     - HTTP API server
     - CLI interface (`si` command)
     - Schema relationship graph
     - LLM description generator
     - Schema change tracker

6. **`docs/plans/`** directory
   - Create directory structure
   - Store this design doc as first entry

#### 2.2 Updates to Existing Documentation

**`README.md` Updates:**
- Add MySQL to supported databases list
- Add links to new documentation files
- Add CLI usage examples
- Add MCP server setup instructions
- Update architecture diagram

**`CONTRIBUTING.md` Updates:**
- Reference `docs/development.md` for detailed setup
- Add testing guidelines referencing new tests
- Update project structure to reflect new files

## Testing Strategy

### Unit Tests to Add/Update

1. **Strategy Pattern Tests:**
   - Test each crawler adapter implements interface correctly
   - Test factory creates correct crawler instances
   - Test unified crawler map operations

2. **Configuration Validation Tests:**
   - Test validation catches missing required fields
   - Test validation catches invalid database types
   - Test validation allows valid configurations
   - Test edge cases (empty arrays, null values)

3. **Connection String Sanitization Tests:**
   - Test PostgreSQL connection strings sanitized
   - Test MySQL connection strings sanitized
   - Test MongoDB connection strings sanitized
   - Test InfluxDB token sanitization
   - Test Redis connection strings sanitized

4. **Error Handling Tests:**
   - Test graceful degradation when databases fail
   - Test service continues with partial failures
   - Test error aggregation and reporting
   - Test scan overlap prevention

5. **Performance Tests:**
   - Test parallel connections complete correctly
   - Test memory limits enforced
   - Test metadata eviction works

### Integration Tests to Update

- Ensure `integration.test.ts` tests all database types
- Test complete scan cycle with all five database types
- Test shutdown cleanup for all database types
- Test change detection across databases

### Test Coverage Goals

- Maintain >80% code coverage
- 100% coverage for critical paths (initialization, scanning, shutdown)
- All error paths must have tests

## Implementation Plan

### Phase 1: Bug Fixes (3-4 hours)

1. Add `DatabaseCrawlerStrategy` interface to `types.ts`
2. Create adapter classes for each crawler
3. Implement factory function
4. Refactor `SchemaIntelligenceService`:
   - Replace five crawler maps with single map
   - Refactor `initialize()` to use strategy pattern
   - Refactor `scanAllDatabases()` to use strategy pattern
   - Refactor `shutdown()` to use strategy pattern
5. Add configuration validation
6. Add connection string sanitization
7. Add parallel connections with `Promise.allSettled()`
8. Add memory management for metadata
9. Add scan overlap protection
10. Improve error handling and logging
11. Write/update unit tests
12. Run all tests and ensure they pass
13. Commit bug fixes

### Phase 2: Documentation (2-3 hours)

1. Create `docs/plans/` directory
2. Create `docs/architecture.md`
3. Create `docs/api.md`
4. Create `docs/development.md`
5. Create `docs/deployment.md`
6. Create `CHANGELOG.md`
7. Update `README.md`
8. Update `CONTRIBUTING.md`
9. Review all documentation for consistency
10. Commit documentation

### Phase 3: Final Review (30 minutes)

1. Run full test suite
2. Run linter
3. Build project
4. Review all changes
5. Create final commit if needed

## Success Criteria

1. **All bugs fixed:**
   - All database types scanned correctly
   - All database connections closed properly
   - No resource leaks
   - No credential exposure in logs
   - Configuration validated properly

2. **Performance improved:**
   - Database connections parallelized
   - Memory usage bounded
   - No scan overlaps possible

3. **Documentation complete:**
   - All six documentation files created
   - Documentation accurate to fixed codebase
   - Examples work correctly
   - No broken links

4. **Tests passing:**
   - All existing tests pass
   - New tests added for bug fixes
   - >80% code coverage maintained

5. **Code quality:**
   - Linter passes
   - Build succeeds
   - No TypeScript errors
   - Clean git history

## Risks and Mitigations

**Risk:** Strategy pattern refactor breaks existing functionality  
**Mitigation:** Comprehensive test coverage, run all tests after each change

**Risk:** Documentation becomes outdated quickly  
**Mitigation:** Link docs to code comments, use automated API doc generation where possible

**Risk:** Time estimates too optimistic  
**Mitigation:** Break work into small commits, prioritize critical bugs first

## Future Considerations

- Consider auto-generating API documentation from OpenAPI spec
- Consider adding Prometheus metrics for monitoring
- Consider adding rate limiting for LLM enrichment
- Consider adding caching layer for frequently accessed schemas

## Conclusion

This design addresses all bugs identified in the multi-LLM code review through structural refactoring using the strategy pattern, which eliminates the root cause of most bugs. The comprehensive documentation will make the project more accessible to users and contributors. The implementation is straightforward, low-risk, and provides immediate value.
