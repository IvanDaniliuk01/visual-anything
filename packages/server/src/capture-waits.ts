/**
 * The pictures Claude asks the open apps for (ADR 0081). `capture_view` is a read, so the session
 * sends `capture/request` to every open app, after the work asked for before it, and waits for the
 * tab the person used last to answer with `capture/answer`: a picture, or why it took none. Every
 * other tab passes it over, saying so, so the wait ends at once when all of them did. It follows the
 * pattern of `layout/done` (`layout-waits.ts`), without a queue: a picture changes nothing, so
 * several can be waited for at once, each by its own id. The wait is bounded at 20 s.
 */
import {
  CAPTURE_WAIT,
  type CaptureAnswerMessage,
  type CaptureAsk,
  type CaptureReport,
} from '@visual-anything/core';

/** One app asked, as the waits see it: something the session sent the request to. */
export type AskedApp = object;

/** A picture asked for and waited for. */
interface Waiting {
  pending: Set<AskedApp>;
  apps: number;
  passed: number;
  finish: (report: CaptureReport) => void;
}

export class CaptureWaits {
  readonly #send: (ask: CaptureAsk, requestId: string) => Promise<readonly AskedApp[]>;
  readonly #wait: number;
  #count = 0;
  readonly #waiting = new Map<string, Waiting>();
  #closed = false;

  /**
   * `send` sends the request with its id to every open app, after the session's work asked for
   * before it, and resolves with the apps it reached; `wait` bounds each wait, 20 s by default.
   */
  constructor(
    send: (ask: CaptureAsk, requestId: string) => Promise<readonly AskedApp[]>,
    wait: number = CAPTURE_WAIT,
  ) {
    this.#send = send;
    this.#wait = wait;
  }

  /** Asks the open apps for a picture, and says what the tab that answered took. */
  async capture(ask: CaptureAsk): Promise<CaptureReport> {
    if (this.#closed) return { apps: 0 };
    this.#count += 1;
    const requestId = `capture-${this.#count}`;
    let finish: (report: CaptureReport) => void = () => {};
    const done = new Promise<CaptureReport>((resolve) => (finish = resolve));
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

  /** An app's answer: taken when that app was asked and the picture is still waited for. */
  answered(app: AskedApp, message: CaptureAnswerMessage): void {
    const waiting = this.#waiting.get(message.requestId);
    if (waiting === undefined || !waiting.pending.delete(app)) return;
    if ('picture' in message) {
      this.#end(message.requestId, { apps: waiting.apps, picture: message.picture });
      return;
    }
    if ('failed' in message) {
      const { failed, shows, bytes, why } = message;
      const failure = {
        failed,
        ...(shows === undefined ? {} : { shows }),
        ...(bytes === undefined ? {} : { bytes }),
        ...(why === undefined ? {} : { why }),
      };
      this.#end(message.requestId, { apps: waiting.apps, failure });
      return;
    }
    waiting.passed += 1;
    this.#settle(message.requestId, waiting);
  }

  /** An app went: no picture waits for it any more. */
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

  /** Ends a wait that no app is left to answer: every one passed it over, or went. */
  #settle(requestId: string, waiting: Waiting): void {
    if (waiting.pending.size > 0) return;
    this.#end(requestId, {
      apps: waiting.apps,
      unanswered: waiting.passed === waiting.apps ? 'passed' : 'gone',
    });
  }

  #end(requestId: string, report: CaptureReport): void {
    const waiting = this.#waiting.get(requestId);
    if (waiting === undefined) return;
    this.#waiting.delete(requestId);
    waiting.finish(report);
  }
}
