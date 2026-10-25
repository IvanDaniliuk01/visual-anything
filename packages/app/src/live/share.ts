/**
 * The tabs of one browser share the session (ADR-0043). A tab opened with neither a launch code nor a
 * token of its own, as when a view address is opened in a new tab, asks the project's other tabs for
 * the session token over this origin's `BroadcastChannel`; a tab whose live connection is open gives
 * it. The browser delivers the channel's messages only to pages of the same origin, which serves
 * nothing but this app, and keeps them in memory: the token goes into no address, no request, no
 * storage on disk and no log, and nothing outside this origin can hear it.
 */

/** The channel's name; one origin is one program, so the name needs nothing of the project's. */
export const SESSION_CHANNEL = 'visual-anything.session';

/** How long a tab waits for another to give it the token, in milliseconds. */
export const JOIN_WAIT = 1500;

/** What the tabs say on the channel: an ask, and the token given for it. */
export type SessionMessage =
  { type: 'session/ask'; ask: string } | { type: 'session/token'; ask: string; token: string };

/** What a `BroadcastChannel` offers that this needs; tests give their own. */
export interface SessionChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** Opens a channel to the other tabs; one each time it is asked. */
export type OpenSessionChannel = () => SessionChannel | undefined;

/** The longest ask id read; the ids made here are 32 hex digits. */
const MAX_ASK = 64;

/** A session token as the local program makes them: 32 random bytes in base64url, 43 characters. */
const TOKEN_FORM = /^[A-Za-z0-9_-]{32,64}$/;

/** This origin's session channel, or none where the browser has no `BroadcastChannel`. */
export const openSessionChannel: OpenSessionChannel = () =>
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(SESSION_CHANNEL) : undefined;

/**
 * Answers the asks of other tabs with the token `current` gives at that moment, which is the one this
 * tab's open live connection holds, or nothing while it holds none. Returns what stops answering;
 * the channel stays the caller's to close.
 */
export function shareSession(
  channel: SessionChannel,
  current: () => string | undefined,
): () => void {
  const listener = (event: MessageEvent) => {
    const message = readMessage(event.data);
    if (message?.type !== 'session/ask') return;
    const token = current();
    if (token === undefined || !TOKEN_FORM.test(token)) return;
    channel.postMessage({
      type: 'session/token',
      ask: message.ask,
      token,
    } satisfies SessionMessage);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/** An ask on its way: the token it gets, or null, and what ends it early. */
export interface SessionAsk {
  /** The first token given for this ask, or null when none came in time or it was cancelled. */
  token: Promise<string | null>;
  cancel(): void;
}

/** How long to wait; tests give their own. */
export interface AskOptions {
  wait?: number;
}

/**
 * Asks the other tabs on `channel` for the session token, and closes the channel once it has one,
 * once none came within the wait, or once cancelled.
 */
export function askForSession(channel: SessionChannel, options: AskOptions = {}): SessionAsk {
  const ask = askId();
  let finish: (token: string | null) => void = () => {};
  const token = new Promise<string | null>((resolve) => {
    const listener = (event: MessageEvent) => {
      const message = readMessage(event.data);
      if (message?.type === 'session/token' && message.ask === ask) finish(message.token);
    };
    const timer = setTimeout(() => finish(null), options.wait ?? JOIN_WAIT);
    finish = (given) => {
      clearTimeout(timer);
      channel.removeEventListener('message', listener);
      channel.close();
      finish = () => {};
      resolve(given);
    };
    channel.addEventListener('message', listener);
    channel.postMessage({ type: 'session/ask', ask } satisfies SessionMessage);
  });
  return { token, cancel: () => finish(null) };
}

/** A message on the channel, read strictly; anything else is passed over. */
function readMessage(data: unknown): SessionMessage | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { type, ask, token } = data as Record<string, unknown>;
  if (typeof ask !== 'string' || ask === '' || ask.length > MAX_ASK) return undefined;
  if (type === 'session/ask') return { type, ask };
  if (type === 'session/token' && typeof token === 'string' && TOKEN_FORM.test(token)) {
    return { type, ask, token };
  }
  return undefined;
}

/** A new ask's id: 16 random bytes in hex, so that a tab takes only the answer to its own ask. */
function askId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
