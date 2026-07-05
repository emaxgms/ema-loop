# EMA-LOOP

**Autonomous Dev Workflow Agent System** — TypeScript-based pipeline that automates GitHub issue resolution from triage to deployment.

## Overview

EMA-LOOP v0.2 transforms the original bash-based automation into a robust, type-safe TypeScript system with:
- **RUG loops** (Repeat-Until-Good) for iterative self-correction
- **Pattern memory** to learn from successful fixes
- **Structured orchestration** with SQLite persistence
- **Full CLI** for manual and automated operation

## Architecture

```
┌─────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Task DB   │←→│  Pipeline Engine │←→│  Agent Memory   │
│  (SQLite)   │   │  (Orchestrator) │   │  (Patterns)     └─────────────┘   └─────────────────┘   └─────────────────┘
```

## Pipeline Stages

| Stage | Description |
|-------|-------------|
| **Fetch** | Pull GitHub issues via REST/GraphQL API |
| **Triage** | Filter, prioritize, estimate complexity |
| **Plan** | Decompose fix into actionable steps |
| **Implement** | RUG loop with `agy` agent until tests pass |
| **Validate** | Run test suite, linting, type checks |
| **Review** | AI code review (security, style, patterns) |
| **Ship** | Commit, push, create PR, deploy Firebase preview |

## Quick Start

```bash
# Clone & install
git clone <repo-url> ema-loop
cd ema-loop
npm ci

# Configure
cp .env.example .env
# Edit .env with GITHUB_TOKEN, etc.

# Build (compile TypeScript to dist/)
npm run build

# Initialize tasks directory
npm run init

# Fetch issues (after build)
npx ema-loop fetch --repos "owner/repo"

# Or run via tsx during development (no build needed)
npm run dev -- fetch --repos "owner/repo"

# Run daemon (continuous)
npx ema-loop daemon --repos "owner/repo" --interval 60000
```

## CLI Commands

```bash
# Task lifecycle
npx ema-loop fetch --repos "owner/repo"     # Pull new issues
npx ema-loop triage                          # Prioritize pending
npx ema-loop run <taskId>                    # Full pipeline
npx ema-loop ship <taskId>                   # Commit + PR + preview

# Single stages
npx ema-loop plan <taskId>
npx ema-loop implement <taskId>
npx ema-loop validate <taskId>
npx ema-loop review <taskId>

# Monitoring
npx ema-loop list                            # All tasks
npx ema-loop status <taskId>                 # Task detail + events
npx ema-loop patterns --repo owner/repo      # Learned patterns

# Daemon
npx ema-loop daemon --repos "owner/repo1,owner/repo2" --interval 60000

# Reset database
npm run reset
```

Use `npm run dev -- <command>` as an alternative during development to skip rebuilding.

## Configuration

`.env` (from `.env.example`):

```bash
# Required
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_DEFAULT_REPOS=owner/repo1,owner/repo2
GITHUB_BASE_BRANCH=main

# Optional
FIREBASE_PROJECT_ID=my-project
EMA_LOOP_DB=tasks/ema-loop.db
MAX_CONCURRENT_TASKS=3
RUG_MAX_ITERATIONS=5
LOG_LEVEL=info
AGY_CMD=agy
```

## How It Works

### RUG Loop (Implement Stage)

The core innovation — the agent iterates until validation passes:

```
┌──────────────┐
│  Build Prompt │  ← Includes task + relevant patterns
└──────┬───────┘
       ▼
┌──────────────┐
│  Run agy CLI  │  ← In isolated git worktree
└──────┬───────┘
       ▼
┌──────────────┐
│ Validate     │──No──▶ Retry (max 5 iterations)
│ (tests/lint) │
└──────┬───────┘
       │Yes
       ▼
┌──────────────┐
│  Review      │──Changes needed──▶ Retry
│  (AI review) │
└──────┬───────┘
       │Approved
       ▼
    SHIP
```

### Pattern Memory

After each successful fix, the system extracts and stores patterns:
- **What worked**: file types, error types, fix strategies
- **Success tracking**: `successCount` / `failureCount` per pattern
- **Relevance scoring**: auto-suggests patterns for similar new issues

### Concurrency Control

File-based locks prevent conflicts:
- Per-repo lock: only one task modifies a repo at a time
- Worktree isolation: each task gets `worktrees/fix/{taskId}-{random}/`
- Automatic cleanup on completion/failure

## Project Structure

```
ema-loop/
├── src/
│   ├── core/           # Engine, TaskStore, EventBus, types
│   ├── agents/         # BaseAgent, GlueAgent (RUG loop)
│   ├── stages/         # Fetch, Triage, Plan, Implement, Validate, Review, Ship
│   ├── infra/          # WorktreeManager, FirebasePreview
│   ├── learning/       # FixMemory (pattern storage)
│   ├── daemon/         # CronRunner (scheduled execution)
│   ├── cli/            # Commander.js CLI
│   └── utils/          # Logger, retry, lock
├── tasks/              # SQLite database (gitignored)
├── memory/             # Pattern exports (gitignored)
├── package.json
├── tsconfig.json
├── ARCHITECTURE-v0.2.md
├── WALKTHROUGH.md
└── README.md
```

## Requirements

- Node.js 18+
- Git
- GitHub PAT with `repo` scope
- `agy` CLI installed and in PATH
- Firebase CLI (optional, for previews)

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Dev mode (tsx, skip rebuild)
npm run dev -- <command>
```

## License

MIT — see LICENSE for details.
