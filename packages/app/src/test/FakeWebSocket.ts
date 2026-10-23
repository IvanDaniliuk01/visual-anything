type Listener = (event: { data?: unknown }) => void;

/**
 * Stands in for the browser's `WebSocket`, so that tests play the local program's side of the live
 * connection. Like a real one, it reports a refused connection as an error followed by a close.
 */
export class FakeWebSocket {
  static created: FakeWebSocket[] = [];

  readonly url: string;
  /** Whether the app closed this socket itself. */
  closedByApp = false;
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

  send(): void {
    throw new Error('The app sends nothing in M0.');
  }

  close(): void {
    this.closedByApp = true;
  }

  /** The local program accepts the connection. */
  accept(): void {
    this.emit('open', {});
  }

  /** The local program sends a message. */
  receive(data: unknown): void {
    this.emit('message', { data });
  }

  /** The connection is refused, or drops once open. */
  drop(): void {
    this.emit('error', {});
    this.emit('close', {});
  }

  private emit(type: string, event: { data?: unknown }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}
