/**
 * Claude's layouts, run one after another (M3d, "Fixes from use"; ADR 0029's clarification of
 * 2026-10-30). Layout runs in the app (ADR 0015), so `lay_out_view` is guidance; but guidance used to
 * be answered at once, and each layout of a view asked for next opened that view before the one before
 * it was done, which then moved nothing. Now the session sends each layout with an id to answer by,
 * waits for the app's `layout/done`, and only then sends the next one, in a queue of its own beside
 * the session's work, since the app records each layout as a command through that work.
 *
 * Every open app is asked. The answer of the tab that ran it is taken; a tab that passes it over, as
 * every tab but the one the person used last does for another view, says so. When every tab passed,
 * when the apps asked are gone, or when the wait runs out, the layout ends without one. The wait is
 * bounded by ADR 0015's 20 s per layout, one per container named or one for the whole view, and a
 * margin for opening the view and recording the result; time in the queue comes on top.
 */
import type { Guidance, LayoutDoneMessage, LayoutPass, LayoutReport } from '@visual-anything/core';

/** How long the session waits for a layout: per layout it asks for, and once more for each. */
export interface LayoutWait {
  /** ADR 0015's bound on one layout, 20 s by default. */
  perLayout?: number;
  /** For opening the view, copying the input and recording the result; 10 s by default. */
  margin?: number;
}

export const LAYOUT_WAIT_PER_LAYOUT = 20_000;
export const LAYOUT_WAIT_MARGIN = 10_000;

/** Layout guidance, as `lay_out_view` sends it. */
export type LayoutGuidance = Extract<Guidance, { kind: 'layout' }>;

/** One app asked, as the queue sees it: something the session sent the layout to. */
export type AskedApp = object;

/** A layout sent and waited for. */
interface Waiting {
  pending: Set<AskedApp>;
  apps: number;
  passed: LayoutPass[];
  finish: (report: LayoutReport) => void;
}

export class LayoutWaits {
  readonly #send: (guidance: LayoutGuidance, answer: string) => Promise<readonly AskedApp[]>;
  readonly #perLayout: number;
  readonly #margin: number;
  #queue: Promise<unknown> = Promise.resolve();
  #count = 0;
  readonly #waiting = new Map<string, Waiting>();
  #closed = false;

  /**
   * `send` sends the guidance with its answer id to every open app, after the session's work asked for
   * before it, and resolves with the apps it reached.
   */
  constructor(
    send: (guidance: LayoutGuidance, answer: string) => Promise<readonly AskedApp[]>,
    wait: LayoutWait = {},
  ) {
    this.#send = send;
    this.#perLayout = wait.perLayout ?? LAYOUT_WAIT_PER_LAYOUT;
    this.#margin = wait.margin ?? LAYOUT_WAIT_MARGIN;
  }

  /** Lays a view out in the open apps after the layouts asked for before, and says how it went. */
  layOut(guidance: LayoutGuidance): Promise<LayoutReport> {
    const run = this.#queue.then(() => this.#run(guidance));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #run(guidance: LayoutGuidance): Promise<LayoutReport> {
    if (this.#closed) return { apps: 0 };
    this.#count += 1;
    const answer = `layout-${this.#count}`;
    let finish: (report: LayoutReport) => void = () => {};
    const done = new Promise<LayoutReport>((resolve) => (finish = resolve));
    // Waited for before it is sent, so that no answer comes before the wait.
    const waiting: Waiting = { pending: new Set(), apps: 0, passed: [], finish };
    this.#waiting.set(answer, waiting);
    const apps = await this.#send(guidance, answer);
    waiting.apps = apps.length;
    if (apps.length === 0 || this.#closed) {
      this.#waiting.delete(answer);
      return { apps: apps.length, ...(apps.length === 0 ? {} : { unanswered: 'gone' as const }) };
    }
    for (const app of apps) waiting.pending.add(app);
    const waited = this.#perLayout * (guidance.containers?.length ?? 1) + this.#margin;
    const timer = setTimeout(() => {
      this.#end(answer, { apps: waiting.apps, unanswered: 'timed-out', waited });
    }, waited);
    waiting.finish = (report) => {
      clearTimeout(timer);
      finish(report);
    };
    return done;
  }

  /** An app's answer: taken when that app was asked and the layout is still waited for. */
  answered(app: AskedApp, message: LayoutDoneMessage): void {
    const waiting = this.#waiting.get(message.requestId);
    if (waiting === undefined || !waiting.pending.delete(app)) return;
    if (message.layouts !== undefined) {
      this.#end(message.requestId, { apps: waiting.apps, layouts: message.layouts });
      return;
    }
    if (message.passed !== undefined) waiting.passed.push(message.passed);
    this.#settle(message.requestId, waiting);
  }

  /** An app went: no layout waits for it any more. */
  gone(app: AskedApp): void {
    for (const [answer, waiting] of [...this.#waiting]) {
      if (waiting.pending.delete(app)) this.#settle(answer, waiting);
    }
  }

  /** Ends every wait: the program is closing. */
  close(): void {
    this.#closed = true;
    for (const [answer, waiting] of [...this.#waiting]) {
      this.#end(answer, { apps: waiting.apps, unanswered: 'gone' });
    }
  }

  /** Ends a wait that no app is left to answer: every one passed it over, or went. */
  #settle(answer: string, waiting: Waiting): void {
    if (waiting.pending.size > 0) return;
    this.#end(
      answer,
      waiting.passed.length === waiting.apps
        ? { apps: waiting.apps, unanswered: 'passed', passed: waiting.passed }
        : { apps: waiting.apps, unanswered: 'gone' },
    );
  }

  #end(answer: string, report: LayoutReport): void {
    const waiting = this.#waiting.get(answer);
    if (waiting === undefined) return;
    this.#waiting.delete(answer);
    waiting.finish(report);
  }
}
