/**
 * Tabs of one browser sharing the session (ADR-0043): a tab opened with no launch code and no token,
 * such as one a view address opened, asks the project's other tabs over this origin's channel, and a
 * tab whose live connection is open gives it the token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeChannels } from '../test/FakeChannels';
import { JOIN_WAIT, askForSession, openSessionChannel, shareSession } from './share';

const TOKEN = 'u2Fs7bGqL0bW1n8kX9vC3pYd5eRt6yHj4kMn2oPq1rS';

let channels: FakeChannels;

beforeEach(() => {
  channels = new FakeChannels();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sharing the session between tabs', () => {
  it('gives the token of an open tab to a tab that asks', async () => {
    const open = channels.open();
    shareSession(open, () => TOKEN);
    const asking = askForSession(channels.open());
    await expect(asking.token).resolves.toBe(TOKEN);
  });

  it('asks without saying anything secret, and answers only the ask it was sent', async () => {
    const open = channels.open();
    shareSession(open, () => TOKEN);
    const listener = channels.open();
    const heard: unknown[] = [];
    listener.addEventListener('message', (event) => heard.push(event.data));
    await askForSession(channels.open()).token;
    const [ask, answer] = heard as [Record<string, unknown>, Record<string, unknown>];
    expect(ask).toEqual({ type: 'session/ask', ask: expect.any(String) as string });
    expect(answer).toEqual({ type: 'session/token', ask: ask.ask, token: TOKEN });
    expect(heard).toHaveLength(2);
  });

  it('is not answered by a tab that holds no token now, as one not yet connected', async () => {
    vi.useFakeTimers();
    shareSession(channels.open(), () => undefined);
    const asking = askForSession(channels.open());
    let token: string | null | undefined;
    void asking.token.then((given) => (token = given));
    await vi.advanceTimersByTimeAsync(JOIN_WAIT - 1);
    expect(token).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(token).toBeNull();
  });

  it('takes the first token given, and lets go of the channel', async () => {
    const asking = channels.open();
    shareSession(channels.open(), () => TOKEN);
    shareSession(channels.open(), () => TOKEN);
    await expect(askForSession(asking).token).resolves.toBe(TOKEN);
    expect(asking.closed).toBe(true);
  });

  it('closes the channel when no tab answers in time', async () => {
    vi.useFakeTimers();
    const asking = channels.open();
    const { token } = askForSession(asking, { wait: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(token).resolves.toBeNull();
    expect(asking.closed).toBe(true);
  });

  it('ignores answers to other asks, malformed answers and tokens that cannot be one', async () => {
    vi.useFakeTimers();
    const stranger = channels.open();
    const asking = channels.open();
    let token: string | null | undefined;
    void askForSession(asking, { wait: 100 }).token.then((given) => (token = given));
    for (const message of [
      { type: 'session/token', ask: 'another-ask', token: TOKEN },
      { type: 'session/token', token: TOKEN },
      { type: 'session/token', ask: 1, token: TOKEN },
      'session/token',
      null,
    ]) {
      stranger.postMessage(message);
    }
    await vi.advanceTimersByTimeAsync(10);
    expect(token).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(token).toBeNull();
  });

  it('refuses a token that is not one the program makes', async () => {
    vi.useFakeTimers();
    for (const bad of [
      '',
      'short',
      'has spaces in it and is long enough to pass',
      'x'.repeat(200),
    ]) {
      const shared = channels.open();
      const stop = shareSession(shared, () => bad);
      let token: string | null | undefined;
      void askForSession(channels.open(), { wait: 20 }).token.then((given) => (token = given));
      await vi.advanceTimersByTimeAsync(20);
      expect(token).toBeNull();
      stop();
    }
  });

  it('answers only asks: never an answer, nor anything else', async () => {
    const open = channels.open();
    shareSession(open, () => TOKEN);
    const other = channels.open();
    const heard: unknown[] = [];
    other.addEventListener('message', (event) => heard.push(event.data));
    const stranger = channels.open();
    stranger.postMessage({ type: 'session/token', ask: 'a', token: TOKEN });
    stranger.postMessage({ type: 'session/ask' });
    stranger.postMessage({ type: 'session/ask', ask: 'x'.repeat(200) });
    stranger.postMessage({ type: 'hello' });
    await channels.delivered();
    expect(heard).toHaveLength(4);
  });

  it('stops answering once stopped', async () => {
    vi.useFakeTimers();
    const stop = shareSession(channels.open(), () => TOKEN);
    stop();
    let token: string | null | undefined;
    void askForSession(channels.open(), { wait: 20 }).token.then((given) => (token = given));
    await vi.advanceTimersByTimeAsync(20);
    expect(token).toBeNull();
  });

  it('cancels an ask: it resolves with nothing and closes the channel', async () => {
    const asking = channels.open();
    const ask = askForSession(asking);
    ask.cancel();
    await expect(ask.token).resolves.toBeNull();
    expect(asking.closed).toBe(true);
  });

  it('opens no channel where the browser has none', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(openSessionChannel()).toBeUndefined();
  });
});
