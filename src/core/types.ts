export type TaskStatus =
  | 'pending'
  | 'triaged'
  | 'planned'
  | 'running'
  | 'validating'
  | 'reviewing'
  | 'shipping'
  | 'done'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type PipelineStage = 'fetch' | 'triage' | 'plan' | 'implement' | 'validate' | 'review' | 'ship' | 'observe';

export interface Task {
  id: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  priority: TaskPriority;
  status: TaskStatus;
  baseBranch: string;
  fixBranch: string;
  worktreePath: string;
  assignee?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentResult {
  success: boolean;
  output?: string;
  error?: string;
  tokensUsed?: number;
  iterations?: number;
}

export interface FixPattern {
  id: string;
  pattern: string;
  repo: string;
  successCount: number;
  failureCount: number;
  lastUsed: string;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: string;
  payload: unknown;
  timestamp: string;
}
