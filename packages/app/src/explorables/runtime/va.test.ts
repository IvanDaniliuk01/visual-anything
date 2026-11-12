/**
 * The `va` runtime's side of the frame (ADR 0107): it hears only the app's hello from its parent,
 * then only the port the hello brought; it checks every message with the core; it answers pings,
 * gives the page its data and the theme's variables, says when the page is ready and what it
 * selects, and sends at most 50 of its errors.
 */
import { MAX_CONSOLE_ERRORS, MAX_FRAME_ERROR, type VaData } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startVa, themeVariables, type Va, type VaWindow } from './va';

const DATA: VaData = {
  api: 1,
  parameters: { a: 1 },
  theme: 'dark',
  language: 'en',
  size: { width: 300, height: 200 },
  element: { id: 'pump', name: 'Pump', component: 'plant.pump', attributes: [] },
  contents: [{ id: 'valve', name: 'Valve', component: 'plant.valve', attributes: [] }],
};

interface Frame {
  va: Va;
  parent: object;
  listeners: Map<string, ((event: unknown) => void)[]>;
  errors: string[];
  root: HTMLElement;
  fire(type: string, event: unknown): void;
}

const channels: MessageChannel[] = [];

afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

function frame(): Frame {
  const parent = {};
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const errors: string[] = [];
  const root = document.createElement('html');
  const win: VaWindow = {
    parent,
    document: { documentElement: root } as unknown as Document,
    console: { error: (...args: unknown[]) => errors.push(args.join(' ')) },
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
  };
  const va = startVa(win);
  return {
    va,
    parent,
    listeners,
    errors,
    root,
    fire: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

/** Posts the hello to a frame, and gives the app's end of the port with what it heard. */
function hello(each: Frame, data: unknown = DATA, source: unknown = each.parent) {
  const channel = new MessageChannel();
  channels.push(channel);
  const heard: unknown[] = [];
  channel.port1.onmessage = (event: MessageEvent) => heard.push(event.data);
  each.fire('message', {
    source,
    data: { kind: 'va/hello', api: 1, data },
    ports: [channel.port2],
  });
  return { port: channel.port1, heard };
}

describe('the va runtime', () => {
  it('waits for its parent’s hello, gives the page its data and answers pings on the port', async () => {
    const each = frame();
    const changes: VaData[] = [];
    each.va.on('change', (data) => changes.push(data));
    expect(each.va.data).toBeUndefined();
    // From anyone but the parent, or with anything but one port, the hello is not heard.
    hello(each, DATA, {});
    expect(each.va.data).toBeUndefined();
    const { port, heard } = hello(each);
    expect(each.va.data).toEqual(DATA);
    expect(changes).toEqual([DATA]);
    port.postMessage({ kind: 'va/ping', at: 5 });
    await vi.waitFor(() => expect(heard).toEqual([{ kind: 'va/pong', at: 5 }]));
    // A second hello, on another port, is not heard.
    const other = hello(each, { ...DATA, theme: 'light' });
    other.port.postMessage({ kind: 'va/ping', at: 6 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(other.heard).toEqual([]);
    expect(each.va.data?.theme).toBe('dark');
  });

  it('drops a message that fails the core’s check, and gives changes at most once a frame', async () => {
    const each = frame();
    const changes: VaData[] = [];
    each.va.on('change', (data) => changes.push(data));
    const { port, heard } = hello(each);
    port.postMessage({ kind: 'va/data', data: { ...DATA, extra: 1 } });
    port.postMessage({ kind: 'va/ping', at: -1 });
    port.postMessage({ kind: 'va/data', data: { ...DATA, parameters: { a: 2 } } });
    port.postMessage({ kind: 'va/data', data: { ...DATA, parameters: { a: 3 } } });
    await vi.waitFor(() => expect(changes).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(changes.map((data) => data.parameters.a)).toEqual([1, 3]);
    expect(heard).toEqual([]);
  });

  it('sets the theme’s colors as --va- variables, and changes them with the theme', () => {
    const each = frame();
    const light = new Map(themeVariables('light'));
    expect(each.root.style.getPropertyValue('--va-text')).toBe(light.get('--va-text'));
    hello(each);
    const dark = new Map(themeVariables('dark'));
    expect(each.root.style.getPropertyValue('--va-text')).toBe(dark.get('--va-text'));
    expect(each.root.style.getPropertyValue('--va-surface')).toBe(dark.get('--va-surface'));
    expect(each.root.style.getPropertyValue('--va-accent')).toBe(dark.get('--va-accent'));
  });

  it('says ready once, and selects only the elements it received', async () => {
    const each = frame();
    each.va.ready();
    const { heard } = hello(each);
    each.va.ready();
    each.va.select('valve');
    each.va.select('elsewhere');
    await vi.waitFor(() => expect(heard).toHaveLength(3));
    expect(heard).toEqual([
      { kind: 'va/ready' },
      { kind: 'va/select', id: 'valve' },
      {
        kind: 'va/error',
        message: 'va.select takes the id of an element the page received in va.data.',
      },
    ]);
  });

  it('sends the page’s errors, at most 50, each cut to 2,000 characters, even those before the hello', async () => {
    const each = frame();
    each.fire('error', { message: 'Early', error: undefined });
    const { heard } = hello(each);
    each.fire('error', { error: new TypeError('x'.repeat(5000)) });
    each.fire('unhandledrejection', { reason: 'nobody' });
    each.fire('securitypolicyviolation', {
      effectiveDirective: 'connect-src',
      blockedURI: 'https://example.com',
    });
    for (let i = 0; i < 60; i += 1) each.fire('error', { message: `Error ${i}` });
    await vi.waitFor(() => expect(heard).toHaveLength(MAX_CONSOLE_ERRORS));
    const messages = heard.map((each) => (each as { message: string }).message);
    expect(messages[0]).toBe('Early');
    expect(messages[1]).toHaveLength(MAX_FRAME_ERROR);
    expect(messages[2]).toBe('A promise was rejected and nothing caught it: nobody');
    expect(messages[3]).toBe("The frame's policy blocked connect-src: https://example.com");
  });

  it('gives a listener added after the data came the data once, by itself', async () => {
    const each = frame();
    const first: VaData[] = [];
    each.va.on('change', (data) => first.push(data));
    hello(each);
    const later: VaData[] = [];
    each.va.on('change', (data) => later.push(data));
    await vi.waitFor(() => expect(later).toEqual([DATA]));
    expect(first).toEqual([DATA]);
  });
});
