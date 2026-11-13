/**
 * The app's side of a frame (ADR 0107): one hello, on the frame's first load, with one port; every
 * message from the frame checked by the core; data again at most once a frame; pings every second;
 * a frame silent for 3 s, or never loaded within 10 s, stopped; and a frame that loads another page
 * stopped as having left it, with no second hello.
 */
import type { VaData } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FRAME_LOAD_MS,
  FrameHost,
  selectableIds,
  type FrameEnd,
  type FrameHostClock,
} from './host';

const DATA: VaData = {
  api: 1,
  parameters: {},
  theme: 'light',
  language: 'en',
  size: { width: 100, height: 100 },
};

const element = (id: string) => ({ id, name: id, component: 'pump-type', attributes: [] });
/** Data that shows the pump, which holds a valve and feeds a tank. */
const PUMP: VaData = {
  ...DATA,
  element: element('pump'),
  contents: [element('valve')],
  relations: [{ id: 'feeds', type: 'flows', direction: 'out', other: element('tank') }],
};

class FakeClock implements FrameHostClock {
  time = 0;
  #every: { ms: number; next: number; callback: () => void }[] = [];
  #frames: (() => void)[] = [];
  now = () => this.time;
  every = (ms: number, callback: () => void) => {
    const entry = { ms, next: this.time + ms, callback };
    this.#every.push(entry);
    return () => {
      this.#every = this.#every.filter((each) => each !== entry);
    };
  };
  nextFrame = (callback: () => void) => {
    this.#frames.push(callback);
    return () => {
      this.#frames = this.#frames.filter((each) => each !== callback);
    };
  };
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = this.#every.filter((each) => each.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.time = due.next;
      due.next += due.ms;
      due.callback();
    }
    this.time = end;
  }
  drawFrame() {
    const frames = this.#frames.splice(0);
    for (const each of frames) each();
  }
}

class FakeFrame {
  hellos: { message: unknown; target: string; ports: MessagePort[] }[] = [];
  #load: (() => void) | undefined;
  contentWindow = {
    postMessage: ((message: unknown, target: string, ports: MessagePort[] = []) => {
      this.hellos.push({ message, target, ports });
    }) as Window['postMessage'],
  };
  addEventListener(_type: 'load', listener: () => void) {
    this.#load = listener;
  }
  removeEventListener() {
    this.#load = undefined;
  }
  load() {
    this.#load?.();
  }
}

const ports: MessagePort[] = [];
afterEach(() => {
  for (const port of ports.splice(0)) port.close();
});

function hosted(data: VaData = DATA) {
  const clock = new FakeClock();
  const frame = new FakeFrame();
  const stopped: FrameEnd[] = [];
  const selected: string[] = [];
  const errors: string[] = [];
  const host = new FrameHost(
    frame,
    data,
    {
      stopped: (end) => stopped.push(end),
      select: (id) => selected.push(id),
      error: (message) => errors.push(message),
    },
    clock,
  );
  /** The frame's end of the port, with what it heard. */
  const frameEnd = () => {
    const port = frame.hellos[0]!.ports[0]!;
    ports.push(port);
    const heard: unknown[] = [];
    port.onmessage = (event: MessageEvent) => heard.push(event.data);
    return { port, heard };
  };
  return { clock, frame, host, stopped, selected, errors, frameEnd };
}

describe('the frame host', () => {
  it('says hello once, on the first load, to any origin, with one port and the data', () => {
    const { frame, host } = hosted();
    expect(frame.hellos).toEqual([]);
    frame.load();
    expect(frame.hellos).toHaveLength(1);
    expect(frame.hellos[0]).toMatchObject({
      message: { kind: 'va/hello', api: 1, data: DATA },
      target: '*',
    });
    expect(frame.hellos[0]!.ports).toHaveLength(1);
    host.dispose();
  });

  it('never says hello to a page the frame loads after: it stops it as having left', () => {
    const { frame, stopped, host } = hosted();
    frame.load();
    frame.load();
    expect(frame.hellos).toHaveLength(1);
    expect(stopped).toEqual(['left']);
    host.dispose();
  });

  it('hears only checked messages, pings every second, and stops a frame silent for 3 s', async () => {
    const { clock, frame, host, stopped, selected, errors, frameEnd } = hosted(PUMP);
    frame.load();
    const { port, heard } = frameEnd();
    port.postMessage({ kind: 'va/select', id: 'pump' });
    port.postMessage({ kind: 'va/select', id: 'pump', extra: true });
    port.postMessage({ kind: 'va/error', message: 'Oops' });
    await vi.waitFor(() => expect(errors).toEqual(['Oops']));
    expect(selected).toEqual(['pump']);
    expect(host.answered).toBe(true);
    clock.advance(1000);
    await vi.waitFor(() => expect(heard).toEqual([{ kind: 'va/ping', at: 1000 }]));
    clock.advance(3000);
    expect(stopped).toEqual(['silent']);
  });

  it('stops a frame that never loads within 10 s, and one that never answers its hello', () => {
    const first = hosted();
    first.clock.advance(FRAME_LOAD_MS);
    expect(first.stopped).toEqual(['never-answered']);
    const second = hosted();
    second.frame.load();
    second.clock.advance(3000);
    expect(second.stopped).toEqual(['never-answered']);
  });

  it('sends changed data at the next frame, once for changes made together', async () => {
    const { clock, frame, host, frameEnd } = hosted();
    frame.load();
    const { heard } = frameEnd();
    host.setData({ ...DATA, parameters: { a: 1 } });
    host.setData({ ...DATA, parameters: { a: 2 } });
    clock.drawFrame();
    await vi.waitFor(() => expect(heard).toHaveLength(1));
    expect(heard[0]).toEqual({ kind: 'va/data', data: { ...DATA, parameters: { a: 2 } } });
    host.dispose();
  });

  it('passes on a select only for an element the data last sent holds', async () => {
    const { clock, frame, host, selected, errors, frameEnd } = hosted(PUMP);
    frame.load();
    const { port } = frameEnd();
    for (const id of ['pump', 'valve', 'tank', 'secret-element', 'feeds', 'pump-type'])
      port.postMessage({ kind: 'va/select', id });
    port.postMessage({ kind: 'va/error', message: 'done' });
    await vi.waitFor(() => expect(errors).toEqual(['done']));
    expect(selected).toEqual(['pump', 'valve', 'tank']);
    // New data counts once it is sent, not before: the frame selects what it was given.
    host.setData({ ...DATA, element: element('boiler') });
    port.postMessage({ kind: 'va/select', id: 'boiler' });
    port.postMessage({ kind: 'va/error', message: 'before' });
    await vi.waitFor(() => expect(errors).toEqual(['done', 'before']));
    expect(selected).toEqual(['pump', 'valve', 'tank']);
    clock.drawFrame();
    port.postMessage({ kind: 'va/select', id: 'boiler' });
    port.postMessage({ kind: 'va/select', id: 'pump' });
    port.postMessage({ kind: 'va/error', message: 'after' });
    await vi.waitFor(() => expect(errors).toEqual(['done', 'before', 'after']));
    expect(selected).toEqual(['pump', 'valve', 'tank', 'boiler']);
    host.dispose();
  });

  it('a tour step or a loose shape bound to nothing sends no element, so selects nothing', () => {
    expect([...selectableIds(DATA)]).toEqual([]);
    expect([...selectableIds(PUMP)].sort()).toEqual(['pump', 'tank', 'valve']);
  });
});
