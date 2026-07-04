## EMA-LOOP Dev Workflow Architecture v0.2

A TypeScript-based autonomous dev workflow system with advanced features like RUG loops, memory-augmented agents, and structured orchestration.

### Key Improvements Over v0.1
1. TypeScript foundation with type safety
2. Persistent task queue (SQLite)
3. Repeat-Until-Good (RUG) loop for iterative fixes
4. Agent memory for learning patterns
5. File-level concurrency control
6. Enhanced error handling with retries

### Core Components
- **Engine**: Coordinates pipeline stages
- **TaskStore**: SQLite-backed task persistence
- **Agents**: Specialized handlers (Triage, Fix, Review)
- **Pipeline**: Multi-stage workflow (Fetch -> Ship)
- **Memory**: Stores successful fix patterns

### Pipeline Stages
1. Fetch: GitHub issue retrieval
2. Triage: Issue prioritization
3. Plan: Decompose into actionable steps
4. Implement: RUG loop with AI agent
5. Validate: Tests & linting
6. Review: Code quality assessment
7. Ship: Commit, PR, preview

### Orchestration
- Event-driven architecture
- Circuit breaker pattern
- Exponential backoff
- Parallel task execution with conflict detection

### Libraries & Tools
- better-sqlite3 for task persistence
- Class hierarchy for agent composition
- CLI interface with command routing
- Structural logging

### Security & Best Practices
- Idempotent operations
- Type-safe interfaces
- Security-focused patterns
- Configuration via .env file

### Architecture Diagram
```
[Task Queue] -> [Engine] -> [Agents] -> [Stages] -> [Task Store]

              |                                      |
              v                                      v
           [Monitoring]          [Memory System]

```
