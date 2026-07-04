import { spawn } from 'node:child_process';
import type { AgentContext } from './base.js';
import { BaseAgent } from './base.js';
import type { Task, FixPattern } from '../core/types.js';

type GlueAgentOptions = {
  maxIterations?: number;
  promptBuilder?: (task: Task) => string;
  beforeAction?: (prompt: string) => Promise<void>;
};

export class GlueAgent extends BaseAgent {
  name = 'glue-agent';
  private options: GlueAgentOptions;

  constructor(context: AgentContext, options: GlueAgentOptions = {}) {
    super(context);
    this.options = {
      maxIterations: 5,
      ...options,
    };
  }

  async run(context: AgentContext): Promise<{
    success: boolean;
    iterations: number;
    changes: string[];
    output: string;
  }> {
    const { maxIterations = 5 } = this.options;
    const changes: string[] = [];
    let output = '';
    let iterations = 0;

    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1;

      const prompt = this.buildPrompt(context.task);
      this.log(`Starting iteration ${iterations}`);
      this.emitIteration(i + 1, prompt);

      if (this.options.beforeAction) {
        await this.options.beforeAction(prompt);
      }

      const result = await this.executeAgy(prompt, context.worktreePath);
      output += result;

      const hasChanges = await this.checkForChanges(context.worktreePath);
      if (!hasChanges && i > 0) {
        this.log('No changes detected, stopping iterations');
        break;
      }

      if (hasChanges) {
        changes.push(`iteration-${i + 1}`);
      }
    }

    return {
      success: changes.length > 0 || iterations >= maxIterations,
      iterations,
      changes,
      output,
    };
  }

  private emitIteration(iteration: number, prompt: string): void {
    this.context.eventBus?.emit('agent.iteration', {
      agent: this.name,
      iteration,
      prompt,
      timestamp: new Date().toISOString(),
    });
  }

  private async executeAgy(prompt: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(-child.pid);
          } catch {
            // process may already be dead
          }
        }
        reject(new Error('agy command timed out'));
      }, 10 * 60 * 1000);

      const child = spawn('agy', [prompt], {
        cwd,
        shell: true,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`agy failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private async checkForChanges(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('git', ['diff', '--quiet'], {
        cwd: path,
        shell: true,
      });

      child.on('close', (code) => {
        resolve(code !== 0);
      });

      child.on('error', () => {
        resolve(false);
      });
    });
  }

  private buildPrompt(task: Task): string {
    const { title, body, labels, priority } = task;
    const patterns = this.getFixPatterns(task.repo);

    let prompt = `Task: ${title}\n\n`;
    prompt += `Description: ${body}\n\n`;
    prompt += `Labels: ${labels.join(', ')}\n\n`;
    prompt += `Priority: ${priority}\n\n`;

    if (patterns.length > 0) {
      prompt += `Fix Patterns:\n${patterns.map(p => `- ${p.pattern}`).join('\n')}\n\n`;
    }

    prompt += `Validation Criteria:\n`;
    prompt += `- Run tests with npm test or appropriate test command\n`;
    prompt += `- Do not modify configuration or lock files\n`;
    prompt += `- Ensure the code compiles\n\n`;

    prompt += `Commit Message Convention:\n`;
    prompt += `Use conventional commit format: fix(scope): description\n\n`;

    return prompt;
  }

  private getFixPatterns(repo: string): FixPattern[] {
    return this.context.store?.getFixPatterns?.(repo) ?? [];
  }
}