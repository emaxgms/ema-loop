import { openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class FileLock {
  private static locks = new Map<string, number>();

  async acquire(filePath: string, timeout: number = 30000): Promise<void> {
    const lockPath = `${filePath}.lock`;
    const startTime = Date.now();
    const initialDelay = 100;

    while (Date.now() - startTime < timeout) {
      try {
        const fd = openSync(lockPath, 'wx');
        FileLock.locks.set(filePath, fd);
        return;
      } catch {
        await this.sleep(initialDelay);
      }
    }

    throw new Error(`Failed to acquire lock for ${filePath} within ${timeout}ms`);
  }

  release(filePath: string): void {
    const lockPath = `${filePath}.lock`;
    const fd = FileLock.locks.get(filePath);

    if (fd !== undefined) {
      try {
        closeSync(fd);
        if (existsSync(lockPath)) {
          unlinkSync(lockPath);
        }
      } catch {
        // ignore cleanup errors
      }
      FileLock.locks.delete(filePath);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}