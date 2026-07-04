import type { FixPattern, Task } from '../core/types.js';
import { TaskStore } from '../core/TaskStore.js';
import { retry } from '../utils/retry.js';

export class FixMemory {
  constructor(private readonly store: TaskStore) {}

  async learn(taskId: string, pattern: string): Promise<void> {
    const task = this.store.getTask(taskId);
    if (!task || task.status !== 'done') {
      return;
    }

    await retry(
      () =>
        Promise.resolve(
          this.store.upsertFixPattern({
            pattern,
            repo: task.repo,
          }),
        ),
      { maxRetries: 2, minDelay: 50 },
    );
  }

  async getRelevantPatterns(task: Task): Promise<FixPattern[]> {
    const all = this.store.getFixPatterns(task.repo);
    return all
      .filter((p) => p.repo === task.repo)
      .sort((a, b) => {
        const aRate = a.successCount / (a.successCount + a.failureCount || 1);
        const bRate = b.successCount / (b.successCount + b.failureCount || 1);
        return bRate - aRate;
      });
  }

  async recordPatternUsage(patternId: string, success: boolean): Promise<void> {
    const all = this.store.getFixPatterns();
    const pattern = all.find((p) => p.id === patternId);
    if (!pattern) return;

    // Re-upsert the pattern to increment counters
    await retry(
      () =>
        Promise.resolve(
          this.store.upsertFixPattern({
            pattern: pattern.pattern,
            repo: pattern.repo,
          }),
        ),
      { maxRetries: 2, minDelay: 50 },
    );
  }

  async getTopPatterns(repo?: string, limit: number = 10): Promise<FixPattern[]> {
    const all = this.store.getFixPatterns();
    const repoFiltered = repo ? all.filter((p) => p.repo === repo) : all;
    return repoFiltered
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, Math.max(1, limit));
  }

  async exportPatterns(): Promise<string> {
    const all = this.store.getFixPatterns();
    return JSON.stringify(all, null, 2);
  }

  async importPatterns(json: string): Promise<void> {
    const patterns: FixPattern[] = JSON.parse(json);
    for (const pattern of patterns) {
      await retry(
        () =>
          Promise.resolve(
            this.store.upsertFixPattern({
              pattern: pattern.pattern,
              repo: pattern.repo,
            }),
          ),
        { maxRetries: 2, minDelay: 50 },
      );
    }
  }
}