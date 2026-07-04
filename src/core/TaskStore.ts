import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Task, TaskEvent, TaskPriority, TaskStatus, FixPattern } from './types.js';

const DB_SINGLETON: { db?: Database.Database } = {};

function getDb(path: string): Database.Database {
  if (!DB_SINGLETON.db) {
    DB_SINGLETON.db = new Database(path);
    DB_SINGLETON.db.pragma('journal_mode = WAL');
    DB_SINGLETON.db.pragma('foreign_keys = ON');
  }
  return DB_SINGLETON.db;
}

export class TaskStore {
  private readonly db: Database.Database;
  private readonly stmts: {
    createTask: Database.Statement;
    getTask: Database.Statement;
    updateTask: Database.Statement;
    listTasks: Database.Statement;
    addEvent: Database.Statement;
    getEvents: Database.Statement;
    upsertFixPattern: Database.Statement;
    getFixPatterns: Database.Statement;
  };

  constructor(dbPath: string) {
    this.db = getDb(dbPath);
    this.stmts = {
      createTask: this.db.prepare(
        `INSERT INTO tasks (
          id, repo, number, title, body, labels, priority, status, baseBranch, fixBranch,
          worktreePath, assignee, attempts, maxAttempts, createdAt, startedAt, finishedAt, error, metadata
        ) VALUES (
          @id, @repo, @number, @title, @body, @labels, @priority, @status, @baseBranch, @fixBranch,
          @worktreePath, @assignee, @attempts, @maxAttempts, @createdAt, @startedAt, @finishedAt, @error, @metadata
        )`,
      ),
      getTask: this.db.prepare(`SELECT * FROM tasks WHERE id = @id`),
      updateTask: this.db.prepare(
        `UPDATE tasks SET
          repo = @repo, number = @number, title = @title, body = @body, labels = @labels,
          priority = @priority, status = @status, baseBranch = @baseBranch, fixBranch = @fixBranch,
          worktreePath = @worktreePath, assignee = @assignee, attempts = @attempts, maxAttempts = @maxAttempts,
          createdAt = @createdAt, startedAt = @startedAt, finishedAt = @finishedAt, error = @error,
          metadata = @metadata
        WHERE id = @id`,
      ),
      listTasks: this.db.prepare(`SELECT * FROM tasks`),
      addEvent: this.db.prepare(
        `INSERT INTO task_events (id, taskId, type, data, timestamp) VALUES (@id, @taskId, @type, @data, @timestamp)`,
      ),
      getEvents: this.db.prepare(`SELECT * FROM task_events WHERE taskId = @taskId ORDER BY timestamp ASC`),
      upsertFixPattern: this.db.prepare(
        `INSERT INTO fix_patterns (id, pattern, repo, successCount, failureCount, lastUsed)
         VALUES (@id, @pattern, @repo, @successCount, @failureCount, @lastUsed)
         ON CONFLICT(pattern, repo) DO UPDATE SET
           successCount = successCount + @successCountIncrement,
           failureCount = failureCount + @failureCountIncrement,
           lastUsed = @lastUsed`,
      ),
      getFixPatterns: this.db.prepare(`SELECT * FROM fix_patterns`),
    };
  }

  init(): void {
    const tx = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          repo TEXT NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          labels TEXT NOT NULL,
          priority TEXT NOT NULL,
          status TEXT NOT NULL,
          baseBranch TEXT NOT NULL,
          fixBranch TEXT NOT NULL,
          worktreePath TEXT NOT NULL,
          assignee TEXT,
          attempts INTEGER NOT NULL,
          maxAttempts INTEGER NOT NULL,
          createdAt TEXT NOT NULL,
          startedAt TEXT,
          finishedAt TEXT,
          error TEXT,
          metadata TEXT NOT NULL
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS task_events (
          id TEXT PRIMARY KEY,
          taskId TEXT NOT NULL,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          timestamp TEXT NOT NULL
        )
      `);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS fix_patterns (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL,
          repo TEXT NOT NULL,
          successCount INTEGER NOT NULL DEFAULT 0,
          failureCount INTEGER NOT NULL DEFAULT 0,
          lastUsed TEXT NOT NULL,
          UNIQUE(pattern, repo)
        )
      `);
    });
    tx();
  }

  createTask(task: Omit<Task, 'id'>): Task {
    const now = new Date().toISOString();
    const full: Task = {
      ...task,
      id: randomUUID(),
      createdAt: now,
    };
    const labelsJson = JSON.stringify(full.labels);
    const metadataJson = JSON.stringify(full.metadata);

    const result = this.stmts.createTask.run({
      id: full.id,
      repo: full.repo,
      number: full.number,
      title: full.title,
      body: full.body,
      labels: labelsJson,
      priority: full.priority,
      status: full.status,
      baseBranch: full.baseBranch,
      fixBranch: full.fixBranch,
      worktreePath: full.worktreePath,
      assignee: full.assignee ?? null,
      attempts: full.attempts,
      maxAttempts: full.maxAttempts,
      createdAt: full.createdAt,
      startedAt: full.startedAt ?? null,
      finishedAt: full.finishedAt ?? null,
      error: full.error ?? null,
      metadata: metadataJson,
    });

    if (result.changes === 0) {
      throw new Error('Failed to create task');
    }
    return full;
  }

  getTask(id: string): Task | undefined {
    const row = this.stmts.getTask.get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToTask(row);
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    const existing = this.getTask(id);
    if (!existing) return undefined;

    const merged: Record<string, unknown> = { ...existing, ...updates };

    const labelsJson = JSON.stringify(merged.labels);
    const metadataJson = JSON.stringify(merged.metadata);

    const result = this.stmts.updateTask.run({
      id,
      repo: merged.repo,
      number: merged.number,
      title: merged.title,
      body: merged.body,
      labels: labelsJson,
      priority: merged.priority,
      status: merged.status,
      baseBranch: merged.baseBranch,
      fixBranch: merged.fixBranch,
      worktreePath: merged.worktreePath,
      assignee: merged.assignee ?? null,
      attempts: merged.attempts,
      maxAttempts: merged.maxAttempts,
      createdAt: merged.createdAt,
      startedAt: merged.startedAt ?? null,
      finishedAt: merged.finishedAt ?? null,
      error: merged.error ?? null,
      metadata: metadataJson,
    });

    if (result.changes === 0) return undefined;
    return { ...existing, ...updates };
  }

  listTasks(filter?: { status?: TaskStatus; repo?: string }): Task[] {
    let rows: Record<string, unknown>[];

    if (filter?.status && filter?.repo) {
      const stmt = this.db.prepare(`SELECT * FROM tasks WHERE status = @status AND repo = @repo`);
      rows = stmt.all({ status: filter.status, repo: filter.repo }) as Record<string, unknown>[];
    } else if (filter?.status) {
      const stmt = this.db.prepare(`SELECT * FROM tasks WHERE status = @status`);
      rows = stmt.all({ status: filter.status }) as Record<string, unknown>[];
    } else if (filter?.repo) {
      const stmt = this.db.prepare(`SELECT * FROM tasks WHERE repo = @repo`);
      rows = stmt.all({ repo: filter.repo }) as Record<string, unknown>[];
    } else {
      rows = this.stmts.listTasks.all() as Record<string, unknown>[];
    }

    return rows.map((row) => this.rowToTask(row));
  }

  addEvent(event: Omit<TaskEvent, 'id' | 'timestamp'>): TaskEvent {
    const now = new Date().toISOString();
    const full: TaskEvent = {
      ...event,
      id: randomUUID(),
      timestamp: now,
    };

    const result = this.stmts.addEvent.run({
      id: full.id,
      taskId: full.taskId,
      type: full.type,
      data: JSON.stringify(full.data),
      timestamp: full.timestamp,
    });

    if (result.changes === 0) {
      throw new Error('Failed to add event');
    }
    return full;
  }

  getEvents(taskId: string): TaskEvent[] {
    const rows = this.stmts.getEvents.all(taskId) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      taskId: row.taskId as string,
      type: row.type as string,
      data: JSON.parse(row.data as string) as Record<string, unknown>,
      timestamp: row.timestamp as string,
    }));
  }

  upsertFixPattern(
    pattern: Omit<FixPattern, 'id' | 'successCount' | 'failureCount' | 'lastUsed'>,
    options?: {
      successCountIncrement?: number;
      failureCountIncrement?: number;
    },
  ): FixPattern {
    const id = randomUUID();
    const now = new Date().toISOString();
    const successCountIncrement = options?.successCountIncrement ?? 1;
    const failureCountIncrement = options?.failureCountIncrement ?? 0;

    this.stmts.upsertFixPattern.run({
      id,
      pattern: pattern.pattern,
      repo: pattern.repo,
      successCount: successCountIncrement,
      failureCount: failureCountIncrement,
      lastUsed: now,
      successCountIncrement,
      failureCountIncrement,
    });

    const row = this.db
      .prepare(`SELECT * FROM fix_patterns WHERE pattern = @pattern AND repo = @repo`)
      .get(pattern.pattern, pattern.repo) as Record<string, unknown>;

    return {
      id: row.id as string,
      pattern: row.pattern as string,
      repo: row.repo as string,
      successCount: row.successCount as number,
      failureCount: row.failureCount as number,
      lastUsed: row.lastUsed as string,
    };
  }

  getFixPatterns(repo?: string): FixPattern[] {
    let rows: Record<string, unknown>[];
    if (repo) {
      const stmt = this.db.prepare(`SELECT * FROM fix_patterns WHERE repo = @repo`);
      rows = stmt.all({ repo }) as Record<string, unknown>[];
    } else {
      rows = this.stmts.getFixPatterns.all() as Record<string, unknown>[];
    }

    return rows.map((row) => ({
      id: row.id as string,
      pattern: row.pattern as string,
      repo: row.repo as string,
      successCount: row.successCount as number,
      failureCount: row.failureCount as number,
      lastUsed: row.lastUsed as string,
    }));
  }

  close(): void {
    if (DB_SINGLETON.db) {
      DB_SINGLETON.db.close();
      DB_SINGLETON.db = undefined;
    }
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      repo: row.repo as string,
      number: row.number as number,
      title: row.title as string,
      body: row.body as string,
      labels: JSON.parse(row.labels as string) as string[],
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      baseBranch: row.baseBranch as string,
      fixBranch: row.fixBranch as string,
      worktreePath: row.worktreePath as string,
      assignee: (row.assignee as string | undefined) ?? undefined,
      attempts: row.attempts as number,
      maxAttempts: row.maxAttempts as number,
      createdAt: row.createdAt as string,
      startedAt: (row.startedAt as string | undefined) ?? undefined,
      finishedAt: (row.finishedAt as string | undefined) ?? undefined,
      error: (row.error as string | undefined) ?? undefined,
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    };
  }
}
