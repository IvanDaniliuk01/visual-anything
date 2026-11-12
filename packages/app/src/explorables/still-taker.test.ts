// @vitest-environment node
// In Node: jsdom gives the bytes a port carries another realm's Uint8Array, which the core's check refuses.
/**
 * Taking a still (ADR 0107, A10.3): one hidden frame, the hello, `va.ready()` or two frames, the
 * still asked for at its width, its PNG read again by the core's bitmap reader, and giving up after
 * 5 s; the frame removed whatever came of it.
 */
import type { VaData } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { FrameHostClock } from './host';
import { takeStill, type StillFrames, type StillOutcome } from './still-taker';

const DATA: VaData = {
  api: 1,
  parameters: {},
  theme: 'light',
  language: 'en',
  size: { width: 320, height: 240 },
};

// ——— A PNG of 8-bit RGBA pixels, stored without compression ———

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const be32 = (value: number) => [
  value >>> 24,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((char) => char.charCodeAt(0)).concat(data);
  return [...be32(data.length), ...body, ...be32(crc32(Uint8Array.from(body)))];
}
function adler32(bytes: number[]): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
function png(width: number, height: number, extra: number[] = []): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y += 1) raw.push(0, ...new Array<number>(width * 4).fill(128));
  const stored = [0x78, 0x01, 1, raw.length & 255, raw.length >>> 8];
  stored.push(~raw.length & 255, (~raw.length >>> 8) & 255, ...raw, ...be32(adler32(raw)));
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...extra,
    ...chunk('IDAT', stored),
    ...chunk('IEND', []),
  ]);
}

// ——— A frame, its clock and its timers ———

class Frames implements StillFrames {
  frames: (() => void)[] = [];
  timers: { at: number; callback: () => void }[] = [];
  time = 0;
  made: FakeFrame[] = [];
  clock: FrameHostClock = {
    now: () => this.time,
    every: () => () => {},
    nextFrame: (callback) => {
      this.frames.push(callback);
      return () => {
        this.frames = this.frames.filter((each) => each !== callback);
      };
    },
  };
  later = (ms: number, callback: () => void) => {
    const timer = { at: this.time + ms, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((each) => each !== timer);
    };
  };
  make = (address: string, width: number, height: number) => {
    const frame = new FakeFrame(address, width, height);
    this.made.push(frame);
    return frame;
  };
  draw() {
    for (const each of this.frames.splice(0)) each();
  }
  advance(ms: number) {
    this.time += ms;
    for (const timer of this.timers.filter((each) => each.at <= this.time)) timer.callback();
  }
}

class FakeFrame {
  port: MessagePort | undefined;
  removed = false;
  asked: unknown[] = [];
  readonly #loads: (() => void)[] = [];
  constructor(
    readonly address: string,
    readonly width: number,
    readonly height: number,
  ) {}
  contentWindow = {
    postMessage: ((_message: unknown, _target: string, ports: MessagePort[] = []) => {
      this.port = ports[0];
      if (this.port) {
        this.port.onmessage = (event: MessageEvent) => this.asked.push(event.data);
        opened.push(this.port);
      }
    }) as Window['postMessage'],
  };
  addEventListener(_type: 'load', listener: () => void) {
    this.#loads.push(listener);
  }
  removeEventListener(_type: 'load', listener: () => void) {
    const at = this.#loads.indexOf(listener);
    if (at >= 0) this.#loads.splice(at, 1);
  }
  load() {
    for (const each of [...this.#loads]) each();
  }
  remove() {
    this.removed = true;
  }
  post(message: unknown) {
    this.port?.postMessage(message);
  }
}

const opened: MessagePort[] = [];
afterEach(() => {
  for (const port of opened.splice(0)) port.close();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function until(check: () => boolean) {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await tick();
}

describe('taking a still', () => {
  it('asks for it once the page says it is ready, and keeps its PNG cleaned', async () => {
    const frames = new Frames();
    const outcome = takeStill(
      { address: 'http://a.localhost:1/n/frame/p.e/h', data: DATA, width: 256 },
      frames,
    );
    const [frame] = frames.made;
    expect(frame).toMatchObject({ width: 320, height: 240 });
    frame?.load();
    frame?.post({ kind: 'va/ready' });
    await until(() =>
      (frame?.asked ?? []).some((each) => (each as { kind: string }).kind === 'va/still'),
    );
    expect(frame?.asked).toContainEqual({ kind: 'va/still', width: 256 });
    frame?.post({ kind: 'va/error', message: 'Error: once' });
    // A text chunk the reader drops: only what draws is kept.
    const text = chunk(
      'tEXt',
      [...'Comment\0secret'].map((char) => char.charCodeAt(0)),
    );
    frame?.post({ kind: 'va/still', width: 256, png: png(256, 2, text) });
    const result = (await outcome) as Extract<StillOutcome, { ok: true }>;
    expect(result).toMatchObject({
      ok: true,
      width: 256,
      height: 2,
      ready: true,
      errors: ['Error: once'],
    });
    expect(new TextDecoder('latin1').decode(result.png)).not.toContain('secret');
    expect(frame?.removed).toBe(true);
  });

  it('asks two frames after the hello when the page never says it is ready', async () => {
    const frames = new Frames();
    const outcome = takeStill({ address: 'x', data: DATA, width: 512 }, frames);
    const [frame] = frames.made;
    frame?.load();
    frames.draw();
    await tick();
    expect(frame?.asked.some((each) => (each as { kind: string }).kind === 'va/still')).toBe(false);
    frames.draw();
    await until(() =>
      (frame?.asked ?? []).some((each) => (each as { kind: string }).kind === 'va/still'),
    );
    frame?.post({ kind: 'va/still', width: 512, png: png(512, 1) });
    expect(await outcome).toMatchObject({ ok: true, ready: false, width: 512 });
  });

  it('refuses a PNG that is not of the width asked, and gives up after 5 s', async () => {
    const frames = new Frames();
    const wrong = takeStill({ address: 'x', data: DATA, width: 256 }, frames);
    const [frame] = frames.made;
    frame?.load();
    frame?.post({ kind: 'va/ready' });
    await tick();
    frame?.post({ kind: 'va/still', width: 256, png: png(255, 1) });
    // The core drops a still whose width is no bucket, so a PNG of another width must be caught here.
    expect(await wrong).toMatchObject({ ok: false, why: 'failed' });
    const slow = takeStill({ address: 'y', data: DATA, width: 256 }, frames);
    frames.made[1]?.load();
    frames.advance(5000);
    expect(await slow).toMatchObject({
      ok: false,
      why: 'failed',
      message: 'It drew no still within 5 s.',
    });
    expect(frames.made[1]?.removed).toBe(true);
  });
});
