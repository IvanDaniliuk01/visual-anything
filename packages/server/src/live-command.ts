/**
 * The command that pipes live values in (ADR 0057):
 *
 *   visual-anything live <folder> [--fresh-for <seconds>] < values.jsonl
 *
 * It reads standard input as JSON lines, one live value a line, and sends them to the Visual Anything
 * running on the project in the folder, through the endpoint Claude attaches to, as the command
 * line's: the program keeps them in memory while the project is open, and never in a file or the
 * history. It sends at most twenty messages a second, a thousand values each, and says on standard
 * error which lines it skipped and why. It never starts a program: values with no app to show them in
 * would only be forgotten.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LIVE_LIMITS, checkLiveValue, type ProjectSnapshot } from '@visual-anything/core';
import {
  NoProgramRunningError,
  OtherBuildError,
  ProgramBridge,
  ProgramUnavailableError,
  type LiveSetOptions,
} from './claude/bridge';
import { toForwardSlashes } from './paths';
import type { LiveKept } from './live';

export const LIVE_USAGE = `Usage: visual-anything live <folder> [--fresh-for <seconds>]

Reads live values from standard input, one JSON object a line, and shows them in the Visual Anything
running on the project in folder, over the attributes they name:

  {"target": "api", "attribute": "latency", "value": 120}
  {"target": "queue", "attribute": "depth", "value": 42, "measuredAt": "2026-10-25T14:03:00Z"}

A target is the id of an element or a relation; a value is JSON of at most 1 KiB; measuredAt, when
given, is an ISO 8601 date-time or milliseconds since 1970, and the age of the value counts from it.
Live values are never saved: they show while the project is open, with a live mark and their age, and
go when Visual Anything stops. Start Visual Anything on the project first.

  --fresh-for <s>  How many seconds the values stay fresh before they fade; 60 by default.
  -h, --help       Show this help.`;

/** The longest line read; a longer one is skipped without being kept whole. */
export const MAX_LINE = 64 * 1024;

/** The fewest milliseconds between two messages, so that at most twenty go a second. */
const BETWEEN_MESSAGES = Math.ceil(1000 / LIVE_LIMITS.messagesPerSecond);

/** The most lines skipped that are named one by one; the rest are counted. */
const MOST_NAMED = 20;

/** What the live command needs from the program it sends to: Claude's bridge, or a test's own. */
export interface LiveTarget {
  project(): Promise<ProjectSnapshot>;
  setLive(values: readonly unknown[], options?: LiveSetOptions): Promise<LiveKept>;
  close(): void;
}

/** Everything the live command uses from the world around it. */
export interface LiveCommandEnvironment {
  /** The folder relative paths are resolved against. */
  cwd: string;
  /** Standard input, chunk by chunk. */
  input: AsyncIterable<string | Uint8Array>;
  out(line: string): void;
  err(line: string): void;
  /** The runtime folder where running programs leave their records; null when there is none. */
  runtimeFolder: string | null;
  /** Attaches to the program running on a folder; Claude's bridge by default. */
  attach?: (folder: string) => LiveTarget;
  /** Waits; `setTimeout` by default. */
  wait?: (ms: number) => Promise<void>;
  /** The time now, in milliseconds; `Date.now` by default. */
  now?: () => number;
}

type Parsed =
  | { ok: true; help: true }
  | { ok: true; help: false; folder: string; freshFor?: number }
  | { ok: false; message: string };

/** Reads the command line: `<folder> [--fresh-for <seconds>]`. */
export function parseLiveCommandLine(argv: readonly string[]): Parsed {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: { 'fresh-for': { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { ok: true, help: true };
  if (positionals.length !== 1) {
    return {
      ok: false,
      message:
        positionals.length === 0
          ? 'Give the project folder whose Visual Anything shows the values.'
          : `Give one project folder, not ${positionals.length}.`,
    };
  }
  const folder = positionals[0] as string;
  const text = values['fresh-for'];
  if (text === undefined) return { ok: true, help: false, folder };
  const seconds = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
  const ms = Math.round(seconds * 1000);
  if (!(ms >= LIVE_LIMITS.freshForMin && ms <= LIVE_LIMITS.freshForMax)) {
    return {
      ok: false,
      message: `--fresh-for takes seconds, from 1 to ${LIVE_LIMITS.freshForMax / 1000}, not ${JSON.stringify(text)}.`,
    };
  }
  return { ok: true, help: false, folder, freshFor: ms };
}

/** A value read from a line, with the line it came from. */
interface Line {
  number: number;
  value: unknown;
}

/** Runs the live command and resolves with its exit code: 0 once its input ends, 1, or 2 for arguments. */
export async function runLive(
  argv: readonly string[],
  environment: LiveCommandEnvironment,
): Promise<number> {
  const parsed = parseLiveCommandLine(argv);
  if (!parsed.ok) {
    environment.err(parsed.message);
    environment.err(LIVE_USAGE);
    return 2;
  }
  if (parsed.help) {
    environment.out(LIVE_USAGE);
    return 0;
  }
  const folder = resolve(environment.cwd, parsed.folder);
  const runtime = environment.runtimeFolder;
  if (runtime === null) {
    environment.err(
      'Visual Anything keeps no record of the programs that run here, so it cannot find one.',
    );
    return 1;
  }
  const target =
    environment.attach?.(folder) ?? new ProgramBridge({ folder, runtime, attachOnly: true });
  const wait = environment.wait ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const now = environment.now ?? Date.now;
  const skipped: string[] = [];
  const skip = (line: number, why: string) => skipped.push(`Line ${line} ${why}.`);
  let sent = 0;
  let waiting = 0;
  let dropped = 0;
  try {
    let project: ProjectSnapshot;
    try {
      project = await target.project();
    } catch (error) {
      environment.err(attachFailure(error, folder));
      return 1;
    }
    let lastSent = Number.NEGATIVE_INFINITY;
    const send = async (batch: Line[]) => {
      if (batch.length === 0) return;
      const pause = lastSent + BETWEEN_MESSAGES - now();
      if (pause > 0) await wait(pause);
      lastSent = now();
      const kept = await target.setLive(
        batch.map((each) => each.value),
        {
          ...(parsed.freshFor === undefined ? {} : { freshFor: parsed.freshFor }),
          from: 'command-line',
        },
      );
      sent += kept.kept;
      waiting = kept.waiting;
      dropped += kept.dropped;
      const unknown = new Set(kept.unknown);
      for (const each of batch) {
        const id = (each.value as { target: string }).target;
        if (unknown.has(id)) {
          skip(
            each.number,
            `is of "${id}", which is neither an element nor a relation of "${project.project.name}"`,
          );
        }
      }
      for (const refused of kept.refused) {
        const line = batch[refused.at];
        if (line !== undefined) skip(line.number, refused.reason);
      }
    };
    let batch: Line[] = [];
    let flushing: Promise<void> = Promise.resolve();
    const flush = () => {
      const going = batch;
      batch = [];
      flushing = flushing.then(() => send(going));
      return flushing;
    };
    for await (const value of readLines(environment.input, skip)) {
      batch.push(value);
      if (batch.length >= LIVE_LIMITS.valuesPerMessage) await flush();
      else if (value.last) await flush();
    }
    await flush();
  } catch (error) {
    if (!(error instanceof ProgramUnavailableError)) throw error;
    environment.err(`Visual Anything stopped taking the values: ${error.message}`);
    return 1;
  } finally {
    target.close();
  }
  for (const line of skipped.slice(0, MOST_NAMED)) environment.err(line);
  if (skipped.length > MOST_NAMED) {
    environment.err(`${skipped.length - MOST_NAMED} more lines were skipped.`);
  }
  environment.out(
    `Sent ${sent} live value${sent === 1 ? '' : 's'}${waiting > 0 ? `, and ${waiting} more wait for their turn` : ''}.${dropped > 0 ? ` ${dropped} older values were dropped, past twenty messages a second.` : ''}`,
  );
  return 0;
}

/**
 * The live values of standard input, line by line: each line is one JSON object, checked as the
 * program checks it, its time written as a date-time read as milliseconds. A line too long, not JSON
 * or not a live value is skipped and said. `last` marks the last line of a chunk, after which the
 * input may pause: what was read is sent then rather than held.
 */
async function* readLines(
  input: AsyncIterable<string | Uint8Array>,
  skip: (line: number, why: string) => void,
): AsyncGenerator<Line & { last: boolean }> {
  const decoder = new TextDecoder('utf-8');
  let pending = '';
  let number = 0;
  // Set while a line past MAX_LINE is skipped, up to its end.
  let tooLong = false;
  const take = (text: string): (Line & { last: boolean }) | undefined => {
    number += 1;
    const line = text.endsWith('\r') ? text.slice(0, -1) : text;
    if (line.trim() === '') return undefined;
    const value = valueOf(line);
    if (typeof value === 'string') {
      skip(number, value);
      return undefined;
    }
    return { number, value, last: false };
  };
  for await (const chunk of input) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const read: (Line & { last: boolean })[] = [];
    let start = 0;
    for (let end = text.indexOf('\n'); end >= 0; end = text.indexOf('\n', start)) {
      const piece = text.slice(start, end);
      start = end + 1;
      if (tooLong) {
        tooLong = false;
        number += 1;
        skip(number, `is longer than ${MAX_LINE / 1024} KiB`);
        pending = '';
        continue;
      }
      const whole = pending + piece;
      pending = '';
      if (whole.length > MAX_LINE) {
        number += 1;
        skip(number, `is longer than ${MAX_LINE / 1024} KiB`);
        continue;
      }
      const taken = take(whole);
      if (taken !== undefined) read.push(taken);
    }
    if (!tooLong) {
      pending += text.slice(start);
      if (pending.length > MAX_LINE) {
        tooLong = true;
        pending = '';
      }
    }
    const last = read.at(-1);
    if (last !== undefined) last.last = true;
    yield* read;
  }
  const rest = pending + decoder.decode();
  if (tooLong) {
    number += 1;
    skip(number, `is longer than ${MAX_LINE / 1024} KiB`);
  } else if (rest !== '') {
    const taken = take(rest);
    if (taken !== undefined) yield { ...taken, last: true };
  }
}

/** A line as a live value for the program, or why it is not one. */
function valueOf(line: string): unknown {
  let read: unknown;
  try {
    read = JSON.parse(line);
  } catch {
    return 'is not JSON';
  }
  if (typeof read !== 'object' || read === null || Array.isArray(read)) {
    return 'is not a JSON object';
  }
  const record = read as Record<string, unknown>;
  const measured = Object.hasOwn(record, 'measuredAt') ? record.measuredAt : undefined;
  let measuredAt: number | undefined;
  if (typeof measured === 'string') {
    const time = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(
      measured,
    )
      ? Date.parse(measured)
      : Number.NaN;
    if (!Number.isFinite(time) || time < 0) {
      return 'has a measuredAt that is neither an ISO 8601 date-time nor milliseconds since 1970';
    }
    measuredAt = time;
  } else if (measured !== undefined) {
    measuredAt = measured as number;
  }
  const value = {
    target: record.target,
    attribute: record.attribute,
    ...(Object.hasOwn(record, 'value') ? { value: record.value } : {}),
    ...(measuredAt === undefined ? {} : { measuredAt }),
  };
  return checkLiveValue(value);
}

function attachFailure(error: unknown, folder: string): string {
  if (error instanceof NoProgramRunningError) {
    return `Visual Anything is not running on ${toForwardSlashes(folder)}. Start it with: visual-anything ${toForwardSlashes(folder)}, then send the values again.`;
  }
  if (error instanceof OtherBuildError) return error.message;
  if (error instanceof ProgramUnavailableError) return error.message;
  return `Could not reach Visual Anything: ${error instanceof Error ? error.message : String(error)}`;
}
