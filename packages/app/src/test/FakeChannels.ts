import type { SessionChannel } from '../live/share';

type Listener = (event: MessageEvent) => void;

/**
 * Stands in for the browser's `BroadcastChannel` of one origin, so that tests play several tabs: a
 * message posted on one channel reaches every other channel open, a moment later, and never the one
 * that posted it, as in a browser.
 */
export class FakeChannels {
  readonly #open = new Set<FakeChannel>();
  #pending = 0;

  /** Opens a channel, as one tab does. */
  open(): FakeChannel {
    const channel = new FakeChannel(this);
    this.#open.add(channel);
    return channel;
  }

  /** How many channels are open. */
  get count(): number {
    return this.#open.size;
  }

  /** Resolves once every message posted so far has reached its listeners. */
  async delivered(): Promise<void> {
    for (let turns = 0; this.#pending > 0 && turns < 100; turns++) await Promise.resolve();
  }

  /** @internal */
  post(from: FakeChannel, data: unknown): void {
    for (const channel of this.#open) {
      if (channel === from) continue;
      this.#pending += 1;
      queueMicrotask(() => {
        this.#pending -= 1;
        // A clone, as the browser's structured clone gives.
        channel.deliver(structuredClone(data));
      });
    }
  }

  /** @internal */
  forget(channel: FakeChannel): void {
    this.#open.delete(channel);
  }
}

export class FakeChannel implements SessionChannel {
  closed = false;
  readonly #listeners = new Set<Listener>();

  constructor(private readonly channels: FakeChannels) {}

  postMessage(message: unknown): void {
    if (this.closed) throw new Error('The channel is closed.');
    this.channels.post(this, message);
  }

  addEventListener(_type: 'message', listener: Listener): void {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener): void {
    this.#listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.#listeners.clear();
    this.channels.forget(this);
  }

  /** @internal */
  deliver(data: unknown): void {
    if (this.closed) return;
    for (const listener of [...this.#listeners]) listener(new MessageEvent('message', { data }));
  }
}
