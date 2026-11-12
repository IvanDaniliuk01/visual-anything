/**
 * The stills of explorables Claude asks the open apps for (ADR 0107, A10.3), as pictures of views
 * are asked for (ADR 0081, `capture-waits.ts`): the session sends `explorable-capture/request` to
 * every open app, after the work asked for before it, and waits for the tab the person used last to
 * answer with `explorable-capture/answer`: a still, or why it took none. Every other tab passes it
 * over, saying so, so the wait ends at once when all of them did. A still changes nothing, so several
 * can be waited for at once, each by its own id. The wait is bounded at 20 s.
 */
import {
  CAPTURE_WAIT,
  type ExplorableCaptureAnswerMessage,
  type ExplorableCaptureAsk,
  type ExplorableCaptureReport,
} from '@visual-anything/core';
import type { AskedApp } from '../capture-waits';

interface Waiting {
  pending: Set<AskedApp>;
  apps: number;
  passed: number;
  finish: (report: ExplorableCaptureReport) => void;
}

export class ExplorableCaptureWaits {
  readonly #send: (ask: ExplorableCaptureAsk, requestId: string) => Promise<readonly AskedApp[]>;
  readonly #wait: number;
  #count = 0;
  readonly #waiting = new Map<string, Waiting>();
  #closed = false;

  constructor(
    send: (ask: ExplorableCaptureAsk, requestId: string) => Promise<readonly AskedApp[]>,
    wait: number = CAPTURE_WAIT,
  ) {
    this.#send = send;
    this.#wait = wait;
  }

  /** Asks the open apps for a still, and says what the tab that answered took. */
  async capture(ask: ExplorableCaptureAsk): Promise<ExplorableCaptureReport> {
    if (this.#closed) return { apps: 0 };
    this.#count += 1;
    const requestId = `explorable-capture-${this.#count}`;
    let finish: (report: ExplorableCaptureReport) => void = () => {};
    const done = new Promise<ExplorableCaptureReport>((resolve) => (finish = resolve));
    // Waited for before it is sent, so that no answer comes before the wait.
    const waiting: Waiting = { pending: new Set(), apps: 0, passed: 0, finish };
    this.#waiting.set(requestId, waiting);
    const apps = await this.#send(ask, requestId);
    waiting.apps = apps.length;
    if (apps.length === 0 || this.#closed) {
      this.#waiting.delete(requestId);
      return { apps: apps.length, ...(apps.length === 0 ? {} : { unanswered: 'gone' as const }) };
    }
    for (const app of apps) waiting.pending.add(app);
    const timer = setTimeout(() => {
      this.#end(requestId, { apps: waiting.apps, unanswered: 'timed-out', waited: this.#wait });
    }, this.#wait);
    waiting.finish = (report) => {
      clearTimeout(timer);
      finish(report);
    };
    return done;
  }

  /** An app's answer: taken when that app was asked and the still is still waited for. */
  answered(app: AskedApp, message: ExplorableCaptureAnswerMessage): void {
    const waiting = this.#waiting.get(message.requestId);
    if (waiting === undefined || !waiting.pending.delete(app)) return;
    if ('still' in message) {
      this.#end(message.requestId, {
        apps: waiting.apps,
        still: message.still,
        errors: message.errors,
        ready: message.ready,
      });
      return;
    }
    if ('failed' in message) {
      this.#end(message.requestId, {
        apps: waiting.apps,
        failure: {
          reason: message.failed,
          ...(message.why === undefined ? {} : { message: message.why }),
        },
        ...(message.errors === undefined ? {} : { errors: message.errors }),
      });
      return;
    }
    waiting.passed += 1;
    this.#settle(message.requestId, waiting);
  }

  /** An app went: no still waits for it any more. */
  gone(app: AskedApp): void {
    for (const [requestId, waiting] of [...this.#waiting]) {
      if (waiting.pending.delete(app)) this.#settle(requestId, waiting);
    }
  }

  /** Ends every wait: the program is closing. */
  close(): void {
    this.#closed = true;
    for (const [requestId, waiting] of [...this.#waiting]) {
      this.#end(requestId, { apps: waiting.apps, unanswered: 'gone' });
    }
  }

  #settle(requestId: string, waiting: Waiting): void {
    if (waiting.pending.size > 0) return;
    this.#end(requestId, {
      apps: waiting.apps,
      unanswered: waiting.passed === waiting.apps ? 'passed' : 'gone',
    });
  }

  #end(requestId: string, report: ExplorableCaptureReport): void {
    const waiting = this.#waiting.get(requestId);
    if (waiting === undefined) return;
    this.#waiting.delete(requestId);
    waiting.finish(report);
  }
}
