import { createInterface } from 'node:readline';
import { Writable, type Readable } from 'node:stream';
import { UsageError } from './types.js';

/** One entry of a numbered list: the value the program uses, the text shown, and an optional short note. */
export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * The questions the guided flows ask. Answers are read one line at a time. A closed input (for example a pipe that
 * ends early) stops the flow with an error, so nothing is changed by a half-answered question.
 */
export interface Prompter {
  /** A text answer. An empty answer takes the fallback when there is one. */
  ask(question: string, fallback?: string): Promise<string>;
  /** One choice from a numbered list. Accepts the number or the value. An empty answer takes the fallback. */
  choose<T extends string>(title: string, choices: readonly Choice<T>[], fallback?: T): Promise<T>;
  /** Several choices. Accepts numbers, values, or "all". An empty answer takes the defaults. */
  pick<T extends string>(title: string, choices: readonly Choice<T>[], defaults?: readonly T[]): Promise<T[]>;
  /** A yes or no answer. An empty answer takes the fallback. */
  confirm(question: string, fallback: boolean): Promise<boolean>;
  /** A secret, typed without echo. It is not printed and not kept. */
  secret(question: string): Promise<string>;
  /** A line of text for the user (never a question). */
  say(line: string): void;
  close(): void;
}

const NO_ANSWER = 'the input ended before the questions were answered. Nothing was changed.';

/**
 * Creates a prompter on the given streams. `terminal` says whether the input is a real terminal (typed characters are
 * echoed by readline then, and the prompter mirrors them in the non-terminal case so a log shows the answers).
 */
export function createPrompter(input: Readable, output: Writable, terminal: boolean): Prompter {
  // readline echoes typed characters through this stream. While a secret is typed, nothing is written.
  let muted = false;
  const echo = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) output.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input, output: echo, terminal });

  // Lines are queued, so a line that arrives before its question is not lost (piped input arrives all at once).
  const queue: string[] = [];
  const waiting: Array<(line: string | null) => void> = [];
  let closed = false;
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else queue.push(line);
  });
  const finish = () => {
    closed = true;
    for (const next of waiting.splice(0)) next(null);
  };
  rl.on('close', finish);
  // Ctrl+C ends the questions. The flow then stops with an error, and nothing is changed.
  rl.on('SIGINT', () => rl.close());

  const nextLine = (): Promise<string | null> => {
    const queued = queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (closed) return Promise.resolve(null);
    return new Promise((resolveLine) => waiting.push(resolveLine));
  };

  const readLine = async (prompt: string): Promise<string> => {
    output.write(prompt);
    const answer = await nextLine();
    if (answer === null) throw new UsageError(NO_ANSWER);
    if (!terminal) output.write(`${answer}\n`);
    return answer;
  };

  const say = (line: string): void => {
    output.write(`${line}\n`);
  };

  return {
    async ask(question, fallback) {
      const shown = fallback === undefined || fallback === '' ? '' : ` [${fallback}]`;
      const answer = (await readLine(`${question}${shown}: `)).trim();
      return answer === '' && fallback !== undefined ? fallback : answer;
    },

    async choose(title, choices, fallback) {
      say(title);
      choices.forEach((choice, index) => say(`  ${index + 1}. ${choice.label}${choice.hint ? `  (${choice.hint})` : ''}`));
      const fallbackNumber = fallback === undefined ? undefined : choices.findIndex((c) => c.value === fallback) + 1;
      for (;;) {
        const answer = (await readLine(`Choose 1-${choices.length}${fallbackNumber ? ` [${fallbackNumber}]` : ''}: `)).trim();
        if (answer === '' && fallback !== undefined) return fallback;
        const byNumber = /^\d+$/.test(answer) ? choices[Number(answer) - 1] : undefined;
        const byValue = choices.find((c) => c.value === answer.toLowerCase());
        const found = byNumber ?? byValue;
        if (found) return found.value;
        say(`Answer with a number from 1 to ${choices.length}, or one of: ${choices.map((c) => c.value).join(', ')}.`);
      }
    },

    async pick(title, choices, defaults) {
      say(title);
      choices.forEach((choice, index) => say(`  ${index + 1}. ${choice.label}${choice.hint ? `  (${choice.hint})` : ''}`));
      const defaultText = defaults && defaults.length > 0 ? defaults.join(',') : '';
      for (;;) {
        const answer = (await readLine(`Numbers or names, separated by commas, or "all"${defaultText ? ` [${defaultText}]` : ''}: `)).trim();
        if (answer === '' && defaults && defaults.length > 0) {
          return choices.filter((c) => defaults.includes(c.value)).map((c) => c.value);
        }
        if (answer.toLowerCase() === 'all') return choices.map((c) => c.value);
        const picked = new Set<string>();
        let bad: string | undefined;
        for (const token of answer.split(',').map((t) => t.trim()).filter((t) => t !== '')) {
          const found = /^\d+$/.test(token) ? choices[Number(token) - 1] : choices.find((c) => c.value === token.toLowerCase());
          if (!found) {
            bad = token;
            break;
          }
          picked.add(found.value);
        }
        if (bad === undefined && picked.size > 0) return choices.filter((c) => picked.has(c.value)).map((c) => c.value);
        say(`"${bad ?? answer}" is not one of the choices. Use numbers or names from the list, or "all".`);
      }
    },

    async confirm(question, fallback) {
      const hint = fallback ? 'Y/n' : 'y/N';
      for (;;) {
        const answer = (await readLine(`${question} [${hint}]: `)).trim().toLowerCase();
        if (answer === '') return fallback;
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
        say('Answer y or n.');
      }
    },

    async secret(question) {
      muted = true;
      output.write(`${question}: `);
      let answer: string | null;
      try {
        answer = await nextLine();
      } finally {
        muted = false;
      }
      output.write('\n');
      if (answer === null) throw new UsageError(NO_ANSWER);
      return answer.trim();
    },

    say,

    close() {
      rl.close();
    },
  };
}
