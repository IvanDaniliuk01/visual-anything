/**
 * The program's log (ADR-0016's clarification of W46): with `--log <file>`, one JSON line per event,
 * appended to the file, so that the path of a command can be read without the browser's frames:
 * - an action done, undone or redone, or a placement that joined one (ADR 0065), with its id, author,
 *   label, how many operations it applied and the ids it created;
 * - a command, an undo or a redo refused, with its problems' codes, never their words;
 * - an app or Claude attached or gone, with how many of each are attached then;
 * - files of the project changed on disk, by path, and whether the project was reloaded from them;
 * - Claude's proposal opened, joined, accepted, refused, withdrawn or dropped, with how many changes.
 *
 * It never writes a token, a launch code, a credential, a preference or anything a file holds: each
 * event is built here from the few fields above, never from a message or a file. Without the option
 * the program writes no log.
 */
import { createWriteStream, type WriteStream } from 'node:fs';
import type { Author, ProblemCode } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** One event the program logs. */
export type ProgramEvent =
  | {
      event: 'action';
      /** What happened to the action: done, undone, redone, or joined by a placement. */
      kind: 'done' | 'undone' | 'redone' | 'joined';
      /** The action's id, as the history lists it. */
      id: number;
      author: Author;
      label: string;
      /** How many operations this event applied. */
      operations: number;
      /** The ids of what it created. */
      created: Id[];
    }
  | {
      event: 'refused';
      /**
       * What was refused: a command, an undo, a redo, the person's decision about Claude's
       * proposal, or a message that was not one.
       */
      request: 'command' | 'undo' | 'redo' | 'proposal' | 'message';
      author: Author;
      /** The kind of command refused, as its `type` says. */
      command?: string;
      codes: ProblemCode[];
    }
  | {
      event: 'proposal';
      /**
       * What happened to Claude's proposal (ADR 0073): opened, joined by a change, accepted,
       * refused, withdrawn by Claude, or dropped, as when the program stops.
       */
      kind: 'opened' | 'joined' | 'accepted' | 'refused' | 'withdrawn' | 'dropped';
      /** How many changes it holds, or how many were accepted. */
      changes: number;
    }
  | { event: 'attached' | 'gone'; who: 'app' | 'claude'; apps: number; claudes: number }
  | { event: 'files-changed'; files: string[]; reloaded: boolean }
  | { event: 'started'; folder?: string; port: number }
  | { event: 'stopped' };

/** Where events go: a function the session and the command call. */
export type LogEvent = (event: ProgramEvent) => void;

/** The text of one event's line: its time first, then the event, as JSON, with a final newline. */
export function logLine(event: ProgramEvent, time: number): string {
  return `${JSON.stringify({ time: new Date(time).toISOString(), ...event })}\n`;
}

/** A log file, appended to one line per event. */
export class ProgramLog {
  readonly #stream: WriteStream;
  readonly #now: () => number;
  readonly #err: (line: string) => void;
  #failed = false;

  private constructor(stream: WriteStream, now: () => number, err: (line: string) => void) {
    this.#stream = stream;
    this.#now = now;
    this.#err = err;
    stream.on('error', (error) => this.#fail(error));
  }

  /** Opens a file to append the log to, creating it when it is not there; rejects when it cannot. */
  static open(
    path: string,
    options: { now?: () => number; err?: (line: string) => void } = {},
  ): Promise<ProgramLog> {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(path, { flags: 'a', encoding: 'utf8' });
      const failed = (error: Error) => reject(error);
      stream.once('error', failed);
      stream.once('open', () => {
        stream.off('error', failed);
        resolve(new ProgramLog(stream, options.now ?? Date.now, options.err ?? console.error));
      });
    });
  }

  /** Appends one event. A log that failed to write stops writing, and says so once. */
  readonly write: LogEvent = (event) => {
    if (this.#failed) return;
    this.#stream.write(logLine(event, this.#now()));
  };

  /** Resolves once every line written so far is in the file, and closes it. */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.#stream.closed || this.#stream.destroyed) {
        resolve();
        return;
      }
      this.#stream.end(() => resolve());
    });
  }

  #fail(error: Error): void {
    if (this.#failed) return;
    this.#failed = true;
    this.#err(`The log stops: it could not be written (${error.message}).`);
  }
}
