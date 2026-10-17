import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { findGcloud, GCLOUD_DEFAULT_SCOPES, readAdcState, saveAdcRecord } from './adc.js';
import type { RuntimeConfig } from './config.js';
import { secretFileExists } from './secret-files.js';

/**
 * Sign-in from inside the chat. A local (stdio) MCP server cannot run OAuth in the client, so its tools do the steps:
 * save the Desktop OAuth client (from a file path), then start `gsm login` for the group as a child process. The child
 * opens the browser, waits for Google's redirect on 127.0.0.1, and saves the token. The server then loads the tools.
 * The child runs the same CLI code as `gsm login` in a terminal: the scopes, PKCE and the recorded account are the same.
 *
 * The ADC route runs `gcloud auth application-default login` instead. For every group except cloud it passes our own
 * client file and the group's scopes, so the ADC login can read the group's APIs. The cloud group uses gcloud's built-in
 * client and its default scopes. The suite then records which group and scopes the ADC login holds (see adc.ts).
 */

export type SignInMethod = 'oauth' | 'adc';

/** Whether the Desktop OAuth client is saved in the token folder. */
export function clientFileReady(cfg: RuntimeConfig): boolean {
  return secretFileExists(cfg, cfg.clientSecretFile);
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
  start(profile: 'readonly' | 'readwrite', method?: SignInMethod): Promise<string>;
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
  /** The scopes an ADC login for this server asks for, per profile (the tools' scopes, resolved as the login does). */
  adcScopes: (profile: 'readonly' | 'readwrite') => string[];
  /** Called when the sign-in has saved a token, so the server can load its tools. */
  onSignedIn: () => void;
}

const URL_PATTERN = /https:\/\/accounts\.google\.com\/\S+/;
const NO_CLIENT_MESSAGE =
  'No OAuth client is saved yet. Call auth_setup_client with the full path of the Desktop OAuth client JSON from Google Cloud console, then call auth_login again.';

/** On Windows the gcloud CLI is a .cmd file, and Node cannot start those directly. A value with a space is quoted. */
function winArg(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/** Starts gcloud the way a terminal would: through cmd.exe on Windows, directly elsewhere. */
function launchGcloud(program: string, args: string[]): ChildProcess {
  const stdio: StdioOptions = ['ignore', 'pipe', 'pipe'];
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', `"${program}" ${args.map(winArg).join(' ')}`], {
      env: process.env,
      stdio,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(program, args, { env: process.env, stdio });
}

export function createSignIn(opts: SignInOptions): SignIn {
  let child: ChildProcess | undefined;
  let phase: 'idle' | 'waiting' | 'signed-in' | 'failed' = 'idle';
  let note = '';

  /**
   * Waits for a sign-in child to print its URL, or to exit. The first answer goes back to the caller; the exit then
   * settles the phase and runs onExit, which may store the result.
   */
  const waitFor = (proc: ChildProcess, onExit: (code: number | null) => string): Promise<string> =>
    new Promise((resolve) => {
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

      const onOutput = (): void => {
        // The sign-in URL is the one on accounts.google.com. Earlier lines print scopes, which are https too.
        const url = URL_PATTERN.exec(out + err);
        if (url) {
          note = url[0];
          // The URL sits on its own line, so no punctuation can end up inside it when it is copied.
          answer(
            `Approve the sign-in in your browser. The sign-in address is:\n${url[0]}\nOnce Google redirects back, the tools of this server load. Then call auth_status.`,
          );
        }
      };
      proc.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
        onOutput();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        err += chunk.toString('utf8');
        onOutput();
      });
      proc.on('exit', (code) => {
        const result = onExit(code);
        answer(result);
      });
    });

  const startOAuth = (profile: 'readonly' | 'readwrite'): Promise<string> => {
    const args = [opts.cliFile, 'login', opts.group, '--profile', profile, '--servers', opts.server];
    // Tests set GSM_NO_BROWSER=1, so no browser opens. Normal use opens the browser on this machine.
    if (process.env.GSM_NO_BROWSER === '1') args.push('--no-browser');
    const proc = spawn(process.execPath, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child = proc;
    phase = 'waiting';
    note = '';
    return waitFor(proc, (code) => {
      if (code === 0) {
        phase = 'signed-in';
        note = 'Signed in.';
        opts.onSignedIn();
      } else {
        phase = 'failed';
        note = `the login exited with code ${code}`;
      }
      return `The sign-in ${phase === 'signed-in' ? 'finished' : 'failed'}: ${note}`;
    });
  };

  const startAdc = (profile: 'readonly' | 'readwrite'): Promise<string> => {
    const gcloud = findGcloud();
    if (!gcloud) {
      return Promise.resolve(
        'The gcloud CLI is not installed, so the ADC sign-in cannot run. Install it from https://cloud.google.com/sdk/docs/install, then call auth_login with method "adc" again. Or call auth_login with method "oauth" to sign in here.',
      );
    }
    const ownClient = opts.group !== 'cloud';
    if (ownClient && !clientFileReady(opts.cfg)) return Promise.resolve(NO_CLIENT_MESSAGE);

    const scopes = ownClient ? opts.adcScopes(profile) : [...GCLOUD_DEFAULT_SCOPES];
    const args = ['auth', 'application-default', 'login'];
    if (ownClient) args.push(`--client-id-file=${opts.cfg.clientSecretFile}`, `--scopes=${scopes.join(',')}`);

    const proc = launchGcloud(gcloud, args);
    child = proc;
    phase = 'waiting';
    note = '';
    return waitFor(proc, (code) => {
      if (code !== 0) {
        phase = 'failed';
        note = `gcloud exited with code ${code}`;
        return `The ADC sign-in failed: ${note}`;
      }
      // gcloud wrote the ADC file. Record which group and scopes it holds, so the suite can use it for that group only.
      const state = readAdcState(opts.cfg);
      if (!state.fingerprint || !state.type) {
        phase = 'failed';
        note = 'gcloud finished, but no ADC login was found';
        return `The ADC sign-in failed: ${note}`;
      }
      saveAdcRecord(opts.cfg, { group: opts.group, scopes, fingerprint: state.fingerprint });
      phase = 'signed-in';
      note = 'Signed in with Application Default Credentials.';
      opts.onSignedIn();
      return `The ADC sign-in finished: ${note}`;
    });
  };

  return {
    start(profile, method = 'oauth') {
      if (!clientFileReady(opts.cfg) && (method === 'oauth' || opts.group !== 'cloud')) {
        return Promise.resolve(NO_CLIENT_MESSAGE);
      }
      if (child && child.exitCode === null) {
        return Promise.resolve(`A sign-in is already waiting for approval in the browser. ${note}`);
      }
      return method === 'adc' ? startAdc(profile) : startOAuth(profile);
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
