import type { Task, PipelineStage, StageResult, TaskEvent } from './types.js';
import { EventBus } from './EventBus.js';
import { TaskStore } from './TaskStore.js';

const PIPELINE_ORDER: PipelineStage[] = [
  'fetch',
  'triage',
  'plan',
  'implement',
  'validate',
  'review',
  'ship',
];

export class Engine {
  private running = false;
  private activeTasks: Map<string, Task> = new Map();

  constructor(private readonly store: TaskStore, private readonly eventBus: EventBus) {}

  async run(taskId: string): Promise<Task> {
    if (this.running) {
      throw new Error('Engine is already running');
    }
    this.running = true;

    const task = this.store.getTask(taskId);
    if (!task) {
      this.running = false;
      throw new Error(`Task ${taskId} not found`);
    }

    this.activeTasks.set(task.id, task);
    this.emitTaskEvent(task.id, 'started', { taskId: task.id });

    try {
      const updated = await this.runPipeline(task, PIPELINE_ORDER);
      this.activeTasks.delete(task.id);
      this.emitTaskEvent(updated.id, 'completed', { taskId: updated.id });
      return updated;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const failed = this.store.updateTask(task.id, {
        status: 'failed',
        error: err.message,
        finishedAt: new Date().toISOString(),
      });
      if (failed) {
        this.activeTasks.delete(task.id);
        this.emitTaskEvent(task.id, 'failed', { taskId: task.id, error: err.message });
      }
      throw error;
    } finally {
      this.running = false;
    }
  }

  async runPipeline(task: Task, stages: PipelineStage[]): Promise<Task> {
    let current = task;

    const started = this.store.updateTask(current.id, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    if (started) current = started;

    for (const stage of stages) {
      if (current.status === 'cancelled') {
        break;
      }
      const result = await this.runStage(current, stage);
      this.eventBus.emit('stage:complete', result);

      if (!result.success) {
        current = this.store.updateTask(current.id, {
          status: 'failed',
          error: result.error,
          finishedAt: new Date().toISOString(),
        }) ?? current;
        throw new Error(`Stage ${stage} failed: ${result.error}`);
      }

      current = this.store.updateTask(current.id, {
        status: mapStageToStatus(stage),
      }) ?? current;
    }

    const done = this.store.updateTask(current.id, {
      status: 'done',
      finishedAt: new Date().toISOString(),
    });
    return done ?? current;
  }

  async runStage(_task: Task, _stage: PipelineStage): Promise<StageResult> {
    const start = Date.now();
    try {
      const output = undefined;
      const durationMs = Date.now() - start;
      return {
        stage: _stage,
        success: true,
        output,
        durationMs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        stage: _stage,
        success: false,
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    this.store.updateTask(taskId, {
      status: 'cancelled',
      finishedAt: new Date().toISOString(),
    });
    this.activeTasks.delete(taskId);
    this.emitTaskEvent(taskId, 'cancelled', { taskId });
  }

  getActiveTasks(): Task[] {
    return Array.from(this.activeTasks.values());
  }

  shutdown(): void {
    this.activeTasks.clear();
    this.running = false;
    this.store.close();
  }

  private emitTaskEvent(taskId: string, type: string, data: Record<string, unknown>): void {
    const event: Omit<TaskEvent, 'id' | 'timestamp'> = {
      taskId,
      type,
      data,
    };
    const saved = this.store.addEvent(event);
    this.eventBus.emit('task:event', saved);
  }
}

function mapStageToStatus(stage: PipelineStage): Task['status'] {
  switch (stage) {
    case 'fetch':
      return 'pending';
    case 'triage':
      return 'triaged';
    case 'plan':
      return 'planned';
    case 'implement':
      return 'running';
    case 'validate':
      return 'validating';
    case 'review':
      return 'reviewing';
    case 'ship':
      return 'shipping';
    case 'observe':
      return 'done';
  }
}

export function createEngine(dbPath: string, eventBus: EventBus): Engine {
  const store = new TaskStore(dbPath);
  store.init();
  return new Engine(store, eventBus);
}
