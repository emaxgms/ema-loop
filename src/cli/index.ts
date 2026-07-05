#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

import { Engine, createEngine } from '../core/Engine.js';
import { TaskStore } from '../core/TaskStore.js';
import { EventBus } from '../core/EventBus.js';
import {
  Fetcher,
  TriageStage,
  PlanStage,
  ImplementStage,
  ValidateStage,
  ReviewStage,
  ShipStage,
} from '../stages/index.js';
import { CronRunner, createCronRunner } from '../daemon/CronRunner.js';
import { WorktreeManager } from '../infra/worktree.js';
import { FirebasePreview } from '../infra/firebase.js';
import { createLogger, type Logger } from '../utils/logger.js';

dotenv.config();

const DEFAULT_DB_PATH = 'tasks/ema-loop.db';

type CliContext = {
  store: TaskStore;
  eventBus: EventBus;
  engine: Engine;
  logger: Logger;
};

function createContext(
  options: { db?: string } = {},
): CliContext {
  const dbPath = options.db ?? process.env.EMA_LOOP_DB ?? DEFAULT_DB_PATH;
  const logger = createLogger('cli');

  const store = new TaskStore(dbPath);

  const eventBus = new EventBus();
  eventBus.on('task:event', (event) => {
    logger.info({ event }, 'task event');
  });

  eventBus.on('stage:complete', (result) => {
    logger.info({ result }, 'stage complete');
  });

  const engine = createEngine(dbPath, eventBus);

  return { store, eventBus, engine, logger };
}

function formatTask(task: {
  id: string;
  repo: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  error?: string;
}): string {
  const lines = [
    `ID:          ${task.id}`,
    `Repo:        ${task.repo}`,
    `Title:       ${task.title}`,
    `Status:      ${task.status}`,
    `Priority:    ${task.priority}`,
  ];

  if (task.assignee) {
    lines.push(`Assignee:    ${task.assignee}`);
  }

  if (task.error) {
    lines.push(`Error:       ${task.error}`);
  }

  return lines.join('\n');
}

async function runStage(
  taskId: string,
  stage: 'fetch' | 'triage' | 'plan' | 'implement' | 'validate' | 'review' | 'ship',
  ctx: CliContext,
  description: string,
): Promise<void> {
  const { store, engine, logger } = ctx;

  const task = store.getTask(taskId);
  if (!task) {
    logger.error({ taskId }, 'Task not found');
    process.exitCode = 1;
    return;
  }

  logger.info({ taskId, stage }, `Starting ${description}`);
  const start = Date.now();

  try {
    const updated = await engine.runPipeline(task, [stage]);
    logger.info(
      { taskId: updated.id, status: updated.status, durationMs: Date.now() - start },
      `${description} completed`,
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ taskId, error: err.message }, `${description} failed`);
    process.exitCode = 1;
  }
}

async function runFullPipeline(
  taskId: string,
  ctx: CliContext,
): Promise<void> {
  const { engine, logger } = ctx;

  logger.info({ taskId }, 'Starting full pipeline');
  const start = Date.now();

  try {
    const task = await engine.run(taskId);
    logger.info(
      { taskId: task.id, status: task.status, durationMs: Date.now() - start },
      'Full pipeline completed',
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ taskId, error: err.message }, 'Full pipeline failed');
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('ema-loop')
  .description('Autonomous dev workflow agent system')
  .version('0.2.0')
  .option('--db <path>', 'Path to task database', DEFAULT_DB_PATH)
  .option('--verbose, -v', 'Enable verbose logging')
  .option('--config <path>', 'Path to config file');

program
  .command('run <taskId>')
  .description('Run full pipeline for a specific task')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    await runStage(taskId, 'fetch', ctx, 'Full pipeline');
  });

program
  .command('fetch')
  .description('Fetch issues from repos')
  .option('--repos <repos>', 'Comma-separated list of repos')
  .action(async (options) => {
    const ctx = createContext(options);
    const { logger } = ctx;

    if (!options.repos) {
      logger.error('Missing required option --repos');
      process.exitCode = 1;
      return;
    }

    const fetcher = new Fetcher(ctx.eventBus);
    const repos = options.repos.split(',').map((r: string) => r.trim()).filter(Boolean);

    logger.info({ repos }, 'Fetching issues');

    let totalCreated = 0;
    for (const repo of repos) {
      const task = ctx.store.createTask({
        repo,
        number: 0,
        title: `Fetched from ${repo}`,
        body: '',
        labels: [],
        priority: 'medium',
        status: 'pending',
        baseBranch: 'main',
        fixBranch: `fix/${randomUUID()}`,
        worktreePath: '',
        assignee: undefined,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        metadata: {},
      });

      const result = await fetcher.run(task);

      if (result.success) {
        totalCreated++;
      }
    }

    logger.info({ totalCreated, repos: repos.length }, 'Fetch completed');
  });

program
  .command('triage')
  .description('Triage pending tasks')
  .action(async (options) => {
    const ctx = createContext(options);
    const { store, logger } = ctx;

    const pending = store.listTasks({ status: 'pending' });
    const triageStage = new TriageStage(ctx.eventBus);

    logger.info({ count: pending.length }, 'Triaging pending tasks');

    for (const task of pending) {
      const result = await triageStage.run(task);
      if (result.success) {
        const updated = store.updateTask(task.id, {
          status: 'triaged',
          priority: task.priority,
        });
        if (updated) {
          logger.info({ taskId: task.id, status: updated.status }, 'Task triaged');
        }
      }
    }

    logger.info('Triage completed');
  });

program
  .command('plan <taskId>')
  .description('Plan a fix')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    await runStage(taskId, 'plan', ctx, 'Planning');
  });

program
  .command('implement <taskId>')
  .description('Run RUG loop for a task')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    await runStage(taskId, 'implement', ctx, 'Implementation');
  });

program
  .command('validate <taskId>')
  .description('Validate changes')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    await runStage(taskId, 'validate', ctx, 'Validation');
  });

program
  .command('review <taskId>')
  .description('Review code')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    await runStage(taskId, 'review', ctx, 'Review');
  });

program
  .command('ship <taskId>')
  .description('Commit + PR + preview')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    const { store, logger } = ctx;

    const task = store.getTask(taskId);
    if (!task) {
      logger.error({ taskId }, 'Task not found');
      process.exitCode = 1;
      return;
    }

    const firebase = new FirebasePreview();
    const worktree = new WorktreeManager('/tmp/ema-loop-worktrees');

    logger.info({ taskId }, 'Starting ship stage');

    const shipStage = new ShipStage(ctx.eventBus);
    const result = await shipStage.run(task);

    if (result.success) {
      logger.info({ taskId, preview: result.output }, 'Ship completed');
    } else {
      logger.error({ taskId, error: result.error }, 'Ship failed');
      process.exitCode = 1;
    }
  });

program
  .command('status [taskId]')
  .description('Show task status')
  .action(async (taskId: string | undefined, options) => {
    const ctx = createContext(options);
    const { store, logger } = ctx;

    if (taskId) {
      const task = store.getTask(taskId);
      if (!task) {
        logger.error({ taskId }, 'Task not found');
        process.exitCode = 1;
        return;
      }

      console.log(formatTask(task));
      console.log('\nEvents:');
      const events = store.getEvents(taskId);
      for (const event of events) {
        console.log(`  [${event.timestamp}] ${event.type}: ${JSON.stringify(event.data)}`);
      }
    } else {
      const tasks = store.listTasks();
      console.log(`Total tasks: ${tasks.length}\n`);
      for (const task of tasks) {
        console.log(formatTask(task));
        console.log('');
      }
    }
  });

program
  .command('list')
  .description('List all tasks')
  .action(async (options) => {
    const ctx = createContext(options);
    const { store, logger } = ctx;

    const tasks = store.listTasks();
    logger.info({ count: tasks.length }, 'Task list');

    console.log(`Total: ${tasks.length}\n`);
    for (const task of tasks) {
      console.log(`- ${task.id} | ${task.status} | ${task.repo} | ${task.title}`);
    }
  });

program
  .command('cancel <taskId>')
  .description('Cancel a running task')
  .action(async (taskId: string, options) => {
    const ctx = createContext(options);
    const { engine, logger } = ctx;

    logger.info({ taskId }, 'Cancelling task');
    await engine.cancelTask(taskId);
    logger.info({ taskId }, 'Task cancelled');
  });

program
  .command('daemon')
  .description('Start cron daemon')
  .option('--interval <ms>', 'Polling interval in ms', '60000')
  .option('--repos <repos>', 'Comma-separated list of repos to watch')
  .action(async (options) => {
    const ctx = createContext(options);
    const { store, logger } = ctx;

    const intervalMs = parseInt(options.interval, 10);
    const repos = options.repos ? options.repos.split(',').map((r: string) => r.trim()).filter(Boolean) : [];

    const cron = createCronRunner(store, ctx.eventBus, {
      intervalMs: Number.isFinite(intervalMs) ? intervalMs : 60000,
      repos,
    });

    logger.info({ intervalMs, repos }, 'Starting daemon');

    process.on('SIGINT', () => {
      logger.info('Stopping daemon');
      cron.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Stopping daemon');
      cron.stop();
      process.exit(0);
    });

    cron.start();
  });

program
  .command('patterns')
  .description('Show learned fix patterns')
  .option('--repo <repo>', 'Filter by repo')
  .option('--limit <n>', 'Max patterns to show', '10')
  .action(async (options) => {
    const ctx = createContext(options);
    const { logger } = ctx;

    const { FixMemory } = await import('../learning/Memory.js');
    const memory = new FixMemory(ctx.store);

    const limit = parseInt(options.limit, 10);
    const patterns = await memory.getTopPatterns(options.repo, Number.isFinite(limit) ? limit : 10);

    if (patterns.length === 0) {
      logger.info('No patterns learned yet');
      return;
    }

    logger.info({ count: patterns.length }, 'Learned patterns');
    console.log(JSON.stringify(patterns, null, 2));
  });

program
  .command('reset')
  .description('Reset task database (with confirmation)')
  .action(async (options) => {
    const ctx = createContext(options);
    const { logger } = ctx;

    console.log('This will delete all tasks, events, and patterns.');
    console.log('Type "yes" to confirm:');

    process.stdin.setEncoding('utf8');
    process.stdin.once('data', async (input) => {
      const answer = String(input).trim().toLowerCase();
      if (answer === 'yes') {
        ctx.store.close();
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(options.db ?? DEFAULT_DB_PATH);
        db.exec('DROP TABLE IF EXISTS tasks');
        db.exec('DROP TABLE IF EXISTS task_events');
        db.exec('DROP TABLE IF EXISTS fix_patterns');
        db.close();

        logger.info('Database reset complete');
      } else {
        logger.info('Reset cancelled');
      }
      process.exit(0);
    });
  });

program.parse();
