import { spawn } from 'node:child_process';
import type { Runner } from './types.js';

/**
 * Production runner: spawn with an argument array and shell: false, so no
 * argument is ever interpreted by a shell. stdin is closed so an interactive
 * prompt fails fast instead of hanging. A missing program rejects with ENOENT.
 */
export const spawnRunner: Runner = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

/** Quotes one argument for display only. The real call never goes through a shell. */
export function displayCommand(command: string, args: readonly string[]): string {
  const quote = (a: string): string => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return [command, ...args].map(quote).join(' ');
}
