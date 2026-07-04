import { EventBus } from '../core/EventBus.js';
import { Engine } from '../core/Engine.js';
import { TaskStore } from '../core/TaskStore.js';
import { WorktreeManager } from '../infra/worktree.js';
import { FirebasePreview } from '../infra/firebase.js';
import type { Task } from '../core/types.js';

export interface CronConfig {
  intervalMs: number;
  repos: string[];
}

export class CronRunner {
  private running = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: CronConfig,
    private readonly engine: Engine,
    private readonly eventBus: EventBus,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.eventBus.emit('daemon:started', { intervalMs: this.config.intervalMs });
    this.tick();
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.eventBus.emit('daemon:stopped', {});
  }

  private async tick(): Promise<void> {
    this.eventBus.emit('daemon:tick', { timestamp: new Date().toISOString() });
  }

  getStatus(): { running: boolean; intervalMs: number } {
    return {
      running: this.running,
      intervalMs: this.config.intervalMs,
    };
  }
}

export function createCronRunner(
  store: TaskStore,
  eventBus: EventBus,
  config: CronConfig,
): CronRunner {
  const engine = new Engine(store, eventBus);
  return new CronRunner(config, engine, eventBus);
}
