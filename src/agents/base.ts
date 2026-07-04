import type { Task } from '../core/types.js';

export type AgentContext = {
  task: Task;
  worktreePath: string;
  repo: string;
  baseBranch: string;
  eventBus: any;
  store: any;
};

export interface IAgent {
  name: string;
  run(context: AgentContext): Promise<any>;
  cleanup?(): Promise<void>;
}

export abstract class BaseAgent implements IAgent {
  abstract name: string;
  context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  abstract run(context: AgentContext): Promise<any>;

  log(message: string): void {
    this.context.eventBus?.emit('agent:log', {
      agent: this.name,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  getTask(): Task {
    return this.context.task;
  }
}