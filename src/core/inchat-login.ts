import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { RuntimeConfig } from './config.js';

/**
 * Sign-in from inside the chat. A local (stdio) MCP server cannot run OAuth in the client, so its tools do the steps:
 * save the Desktop OAuth client (from a file path), then start `gsm login` for the group as a child process. The child
 * opens the browser, waits for Google's redirect on 127.0.0.1, and saves the token. The server then loads the tools.
 * The child runs the same CLI code as `gsm login` in a terminal: the scopes, PKCE and the recorded account are the same.
 */

/** Whether the Desktop OAuth client is saved in the token folder. */
export function clientFileReady(cfg: RuntimeConfig): boolean {
  return existsSync(cfg.clientSecretFile);
}

/** Runs one gsm command and returns its exit code and output. Used for setup-client and setup-admin. */
export function runGsmCommand(cliFile: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliFile, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', (err) => resolve({ code: 1, output: err.message }));
    child.on('exit', (code) => resolve({ code: code ?? 1, output: output.trim() }));
  });
}

export interface SignIn {
  /** Starts the browser sign-in. Resolves with the URL to approve, or with the reason it could not start. */
  start(profile: 'readonly' | 'readwrite'): Promise<string>;
  /** What the sign-in is doing now, for auth_status. */
  describe(): string;
  /** Stops a sign-in that is still waiting for the browser. */
  dispose(): void;
}

export interface SignInOptions {
  cliFile: string;
  group: string;
  /** The server name. The login covers this server's group, and its servers only. */
  server: string;
  cfg: RuntimeConfig;
  /** Called when the sign-in has saved a token, so the server can load its tools. */
  onSignedIn: () => void;
}

export function createSignIn(opts: SignInOptions): SignIn {
  let child: ChildProcess | undefined;
  let phase: 'idle' | 'waiting' | 'signed-in' | 'failed' = 'idle';
  let note = '';

  return {
    start(profile) {
      if (!clientFileReady(opts.cfg)) {
        return Promise.resolve(
          'No OAuth client is saved yet. Call auth_setup_client with the full path of the Desktop OAuth client JSON from Google Cloud console, then call auth_login again.',
        );
      }
      if (child && child.exitCode === null) {
        return Promise.resolve(`A sign-in is already waiting for approval in the browser. ${note}`);
      }
      const args = [opts.cliFile, 'login', opts.group, '--profile', profile, '--servers', opts.server];
      // Tests set GSM_NO_BROWSER=1, so no browser opens. Normal use opens the browser on this machine.
      if (process.env.GSM_NO_BROWSER === '1') args.push('--no-browser');
      const proc = spawn(process.execPath, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      child = proc;
      phase = 'waiting';
      note = '';

      return new Promise((resolve) => {
        let out = '';
        let err = '';
        let answered = false;
        const answer = (text: string): void => {
          if (answered) return;
          answered = true;
          clearTimeout(timer);
          resolve(text);
        };
        const timer = setTimeout(() => {
          answer(`The sign-in did not start: ${err.trim() || 'no URL was printed'}`);
          proc.kill();
        }, 20000);

        proc.stdout.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8');
          // The sign-in URL is the one on accounts.google.com. Earlier lines print scopes, which are https too.
          const url = /https:\/\/accounts\.google\.com\/\S+/.exec(out);
          if (url) {
            note = url[0];
            // The URL sits on its own line, so no punctuation can end up inside it when it is copied.
            answer(
              `Approve the sign-in in your browser. The sign-in address is:\n${url[0]}\nOnce Google redirects back, the tools of this server load. Then call auth_status.`,
            );
          }
        });
        proc.stderr.on('data', (chunk: Buffer) => {
          err += chunk.toString('utf8');
        });
        proc.on('exit', (code) => {
          if (code === 0) {
            phase = 'signed-in';
            note = 'Signed in.';
            opts.onSignedIn();
          } else {
            phase = 'failed';
            note = err.trim().split('\n').slice(-3).join(' ') || `the login exited with code ${code}`;
          }
          answer(`The sign-in ${phase === 'signed-in' ? 'finished' : 'failed'}: ${note}`);
        });
      });
    },

    describe() {
      if (phase === 'waiting') return `A sign-in is waiting for approval in the browser: ${note}`;
      if (phase === 'signed-in') return 'The last sign-in finished.';
      if (phase === 'failed') return `The last sign-in failed: ${note}`;
      return 'No sign-in was started in this session.';
    },

    dispose() {
      if (child && child.exitCode === null) child.kill();
    },
  };
}
