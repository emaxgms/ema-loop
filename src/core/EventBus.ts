import EventEmitter from 'node:events';
import type { TaskEvent, StageResult } from './types.js';

export class EventBus extends EventEmitter {
  override on(event: string, handler: (...args: unknown[]) => void): this {
    super.on(event, handler);
    return this;
  }

  override emit(event: string, data: unknown): boolean {
    return super.emit(event, data);
  }

  onTaskEvent(handler: (event: TaskEvent) => void): void {
    this.on('task:event', handler as (...args: unknown[]) => void);
  }

  onStageComplete(handler: (result: StageResult) => void): void {
    this.on('stage:complete', handler as (...args: unknown[]) => void);
  }
}
