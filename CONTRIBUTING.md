# Contributing to Schema Intelligence

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/iodev/schema-intelligence.git
   cd schema-intelligence
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Run examples:**
   ```bash
   cp .env.example .env
   # Edit .env with your database connections
   node dist/examples/basic-usage.js
   ```

## Project Structure

```
schema-intelligence/
├── src/
│   ├── index.ts                          # Main exports
│   ├── types.ts                          # TypeScript interfaces
│   ├── postgres-schema-crawler.ts        # PostgreSQL crawler
│   ├── mongodb-schema-crawler.ts         # MongoDB crawler
│   ├── redis-pattern-crawler.ts          # Redis crawler
│   ├── influxdb-bucket-crawler.ts        # InfluxDB crawler
│   ├── schema-vectorizer.ts              # Vectorization logic
│   └── schema-intelligence-service.ts    # Main service
├── examples/                              # Usage examples
├── tests/                                 # Test files
├── docs/                                  # Additional documentation
└── dist/                                  # Compiled output
```

## Development Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

3. **Test your changes:**
   ```bash
   npm run build
   npm test
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

5. **Push and create a pull request:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Format

We follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Build process or auxiliary tool changes

## Adding a New Database Type

To add support for a new database type:

1. **Create a new crawler** in `src/`:
   ```typescript
   export class YourDBCrawler {
       async connect(connectionString: string, alias: string): Promise<void> {}
       async crawlDatabase(dbAlias: string): Promise<SchemaMetadata[]> {}
       async close(): Promise<void> {}
   }
   ```

2. **Update `types.ts`:**
   - Add your database type to the union types
   - Add any custom schema interfaces

3. **Update `schema-intelligence-service.ts`:**
   - Import your crawler
   - Add crawler map
   - Add connection logic in `initialize()`
   - Add scanning logic in `scanAllDatabases()`
   - Add close logic in `shutdown()`

4. **Create an example:**
   - Add usage example in `examples/`

5. **Update documentation:**
   - Add to README.md
   - Document connection string format
   - Add configuration examples

## Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Use async/await for asynchronous operations
- Handle errors gracefully with try/catch
- Log important events using pino

## Testing

- Write unit tests for new features
- Ensure all tests pass before submitting PR
- Test with real database connections when possible
- Add integration tests for end-to-end flows

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Create examples for new features
- Update CHANGELOG.md

## Questions?

Open an issue or start a discussion on GitHub!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
