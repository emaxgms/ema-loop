import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

type WorktreeStatus = {
  branch: string;
  clean: boolean;
  hasChanges: boolean;
};

export class WorktreeManager {
  constructor(private basePath: string) {}

  async createWorktree(repo: string, taskId: string, baseBranch: string): Promise<{ path: string; branch: string }> {
    const repoPath = `${this.basePath}/${this.sanitizeRepoName(repo)}`;
    const randomSuffix = randomBytes(4).toString('hex');
    const branch = `fix/${taskId}-${randomSuffix}`;
    const worktreePath = `${repoPath}/worktrees/${branch}`;

    await this.ensureRepoExists(repoPath, repo);
    await this.createWorktreeDir(worktreePath, branch, baseBranch, repoPath);

    return { path: worktreePath, branch };
  }

  async removeWorktree(path: string): Promise<void> {
    const repoPath = path.split('/worktrees/')[0];
    const branch = path.split('/worktrees/')[1];

    if (repoPath && branch) {
      await this.runGit(repoPath, ['worktree', 'remove', '--force', path]);
      await this.runGit(repoPath, ['branch', '-D', branch]);
    }
  }

  async getWorktreeStatus(path: string): Promise<WorktreeStatus> {
    const branch = await this.getCurrentBranch(path);
    const clean = await this.isClean(path);
    const hasChanges = !(await this.getChanges(path));

    return { branch, clean, hasChanges };
  }

  async commitChanges(path: string, message: string): Promise<string> {
    await this.runGit(path, ['add', '-A']);
    await this.runGit(path, ['commit', '-m', message]);
    return await this.getCommitSha(path);
  }

  async pushBranch(path: string, branch: string): Promise<void> {
    await this.runGit(path, ['push', '-u', 'origin', branch]);
  }

  private sanitizeRepoName(repo: string): string {
    return repo.replace(/[:/]/g, '-');
  }

  private async ensureRepoExists(repoPath: string, repoUrl: string): Promise<void> {
    try {
      await spawnCapture('git', ['rev-parse'], { cwd: repoPath });
    } catch {
      await spawnAsync('git', ['clone', repoUrl, repoPath]);
    }
  }

  private async createWorktreeDir(worktreePath: string, branch: string, baseBranch: string, repoPath: string): Promise<void> {
    const parentDir = worktreePath.substring(0, worktreePath.lastIndexOf('/'));
    await spawnAsync('mkdir', ['-p', parentDir], { shell: true });
    await this.runGit(repoPath, ['worktree', 'add', worktreePath, baseBranch], true);
  }

  private runGit(cwd: string, args: string[], allowFailure = false): Promise<void> {
    return spawnPromise('git', args, { cwd, allowFailure });
  }

  private getCurrentBranch(cwd: string): Promise<string> {
    return spawnCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  }

  private isClean(cwd: string): Promise<boolean> {
    return spawnPromise('git', ['diff', '--quiet'], { cwd, checkReturn: false })
      .then(() => true)
      .catch(() => false);
  }

  private getChanges(cwd: string): Promise<string> {
    return spawnCapture('git', ['diff', '--name-only'], { cwd });
  }

  private getCommitSha(cwd: string): Promise<string> {
    return spawnCapture('git', ['rev-parse', 'HEAD'], { cwd });
  }
}

function spawnAsync(command: string, args: string[], options: { cwd?: string; shell?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell,
      windowsHide: true,
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with code ${code}`));
    });

    child.on('error', reject);
  });
}

function spawnPromise(command: string, args: string[], options: { cwd?: string; allowFailure?: boolean; checkReturn?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
    });

    child.on('close', (code) => {
      if (options.allowFailure || code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function spawnCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${command} failed with code ${code}`));
    });

    child.on('error', reject);
  });
}