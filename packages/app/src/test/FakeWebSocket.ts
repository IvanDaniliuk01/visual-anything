import { decodeAppMessage, type AppMessage } from '@visual-anything/core';

type Listener = (event: { data?: unknown; code?: number }) => void;

/**
 * Stands in for the browser's `WebSocket`, so that tests play the local program's side of the live
 * connection. Like a real one, it reports a refused connection as an error followed by a close.
 */
export class FakeWebSocket {
  static created: FakeWebSocket[] = [];

  readonly url: string;
  /** Whether the app closed this socket itself. */
  closedByApp = false;
  /** What the app sent, in order, read as the local program reads it. */
  readonly sent: AppMessage[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.created.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Takes a message from the app. It must be one the local program can read. */
  send(data: unknown): void {
    if (this.closedByApp) throw new Error('The app sent a message on a socket it had closed.');
    if (typeof data !== 'string') throw new Error('The app sends text messages only.');
    this.sent.push(decodeAppMessage(data));
  }

  close(): void {
    this.closedByApp = true;
  }

  /** The last message the app sent. */
  lastSent(): AppMessage {
    const message = this.sent.at(-1);
    if (!message) throw new Error('The app has sent nothing.');
    return message;
  }

  /** How many listeners the app has on this socket; none once it has let go of it. */
  listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  /** The local program accepts the connection. */
  accept(): void {
    this.emit('open', {});
  }

  /** The local program sends a message. */
  receive(data: unknown): void {
    this.emit('message', { data });
  }

  /** The connection is refused, or drops once open, with a close code when one is given. */
  drop(code?: number): void {
    this.emit('error', {});
    this.emit('close', code === undefined ? {} : { code });
  }

  private emit(type: string, event: { data?: unknown; code?: number }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}
