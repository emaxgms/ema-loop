import type { Task, StageResult, PipelineStage } from '../core/types.js';
import { EventBus } from '../core/EventBus.js';

export abstract class BaseStage {
  constructor(protected readonly eventBus: EventBus) {}

  abstract run(task: Task): Promise<StageResult>;

  protected emitComplete(stage: PipelineStage, result: Omit<StageResult, 'stage'>): void {
    this.eventBus.emit('stage:complete', {
      stage,
      ...result,
    } as StageResult);
  }
}

export class Fetcher extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'fetch',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class TriageStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'triage',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class PlanStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'plan',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class ImplementStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'implement',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class ValidateStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'validate',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class ReviewStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'review',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}

export class ShipStage extends BaseStage {
  run(task: Task): Promise<StageResult> {
    const start = Date.now();
    return Promise.resolve({
      stage: 'ship',
      success: true,
      output: task,
      durationMs: Date.now() - start,
    });
  }
}
