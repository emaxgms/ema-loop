import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

export class FirebasePreview {
  constructor(private projectId?: string) {}

  async deployPreview(channelName: string, cwd: string): Promise<string | null> {
    const firebaseJsonPath = `${cwd}/firebase.json`;

    if (!existsSync(firebaseJsonPath)) {
      return null;
    }

    try {
      const output = await this.runFirebaseCommand(cwd, channelName);
      return this.extractPreviewUrl(output);
    } catch {
      return null;
    }
  }

  formatUrl(url: string | null): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `https://${url}`;
  }

  private runFirebaseCommand(cwd: string, channelName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['hosting:channel:deploy', channelName, '--json'];

      if (this.projectId) {
        args.push('--project', this.projectId);
      }

      const child = spawn('firebase', args, {
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
        if (code !== 0) {
          reject(new Error(`firebase deploy failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      child.on('error', reject);
    });
  }

  private extractPreviewUrl(output: string): string | null {
    try {
      const result = JSON.parse(output);
      const url = result?.result?.[0]?.hostingPage?.previewUrl ||
                   result?.hostingPage?.previewUrl ||
                   result?.previewUrl;
      return url ?? null;
    } catch {
      return null;
    }
  }
}