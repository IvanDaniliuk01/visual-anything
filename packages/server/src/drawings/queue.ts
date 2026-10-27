/**
 * The drawings the local program makes for the apps and the command line (ADR 0068), one at a time:
 * each worker may hold 256 MiB, so a tab asking for many at once makes them in turn, and past a few
 * waiting, the next is refused. Making a drawing changes nothing, so it never waits behind the
 * project's own work, and the project's work never waits behind it.
 */
import type { Problem } from '@visual-anything/core';
import { errorReason } from '../errors';
import { makeDrawing, type MadeDrawing } from './make';

/** Makes a drawing of HTML laid out at a width. */
export type DrawingMaker = (html: string, width: number) => Promise<MadeDrawing>;

/** The most drawings that wait for their turn, the one being made included. */
export const MAX_WAITING_DRAWINGS = 4;

export class DrawingQueue {
  readonly #maker: DrawingMaker;
  #last: Promise<unknown> = Promise.resolve();
  #waiting = 0;

  constructor(maker: DrawingMaker = makeDrawing) {
    this.#maker = maker;
  }

  /** Makes a drawing once those asked for before it are made. */
  make(html: string, width: number): Promise<MadeDrawing> {
    if (this.#waiting >= MAX_WAITING_DRAWINGS) {
      return Promise.resolve(
        refused(
          `Visual Anything is making ${MAX_WAITING_DRAWINGS} drawings already: ask again once they are made.`,
        ),
      );
    }
    this.#waiting += 1;
    const turn = this.#last
      .then(() => this.#maker(html, width))
      .catch((error: unknown) => refused(`The drawing could not be made: ${errorReason(error)}`))
      .finally(() => {
        this.#waiting -= 1;
      });
    this.#last = turn;
    return turn;
  }
}

function refused(message: string): { ok: false; problems: Problem[] } {
  return { ok: false, problems: [{ code: 'program-failed', message }] };
}
