import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { fromSources, makeDrawing } from './make';

const CARD = `<style>.card { padding: 16px; border: 2px solid #1D4F91; border-radius: 12px }</style>
<div class="card"><h2>Basic</h2><p>$10 a month</p></div>`;

describe('makeDrawing', () => {
  it('makes a drawing in a worker, cleaned by the core', async () => {
    const made = await makeDrawing(CARD, 400);
    if (!made.ok) throw new Error(made.problems.map((each) => each.message).join(' '));
    expect(made.svg).toMatch(/^<svg /);
    expect(made.width).toBe(400);
    expect(made.height).toBeGreaterThan(50);
    expect(made.report).toEqual([]);
  }, 60_000);

  it('refuses a width out of range and HTML past 512 KiB before starting a worker', async () => {
    expect(await makeDrawing('<p>x</p>', 63)).toEqual({
      ok: false,
      problems: [
        {
          code: 'invalid-command',
          message: 'A drawing is laid out at a width of 64 to 2000 pixels, in whole pixels.',
        },
      ],
    });
    expect(await makeDrawing('x'.repeat(512 * 1024 + 1))).toEqual({
      ok: false,
      problems: [
        {
          code: 'image-too-large',
          message: 'The HTML is over 512 KiB: shorten it, or import a part of the page.',
        },
      ],
    });
  });

  it('refuses a drawing too large for the core to keep, saying how to make it smaller', async () => {
    const made = await makeDrawing(`<p>${'Lorem ipsum dolor sit amet. '.repeat(60)}</p>`, 800);
    expect(made).toEqual({
      ok: false,
      problems: [
        {
          code: 'image-too-large',
          message: expect.stringMatching(
            /^The drawing is too large to keep as a picture: .* Shorten the HTML, or make it narrower\.$/,
          ) as unknown as string,
        },
      ],
    });
  }, 60_000);

  it('stops a worker that takes too long', async () => {
    const made = await makeDrawing('<p>x</p>', 800, {
      timeMs: 500,
      worker: { script: 'for (;;) {}', eval: true },
    });
    expect(made).toEqual({
      ok: false,
      problems: [
        {
          code: 'image-too-large',
          message:
            'Making the drawing took over 1 seconds, so it was stopped. Shorten the HTML, or make it narrower.',
        },
      ],
    });
  });

  it('stops a worker that needs more memory than it may have', async () => {
    const made = await makeDrawing('<p>x</p>', 800, {
      memoryMb: 64,
      worker: {
        script: 'const kept = []; for (;;) kept.push(new Array(100000).fill({ a: 1 }));',
        eval: true,
      },
    });
    expect(made).toEqual({
      ok: false,
      problems: [
        {
          code: 'image-too-large',
          message:
            'Making the drawing needed over 64 MiB of memory, so it was stopped. Shorten the HTML, or make it narrower.',
        },
      ],
    });
  }, 60_000);
});

describe('the network guard of the drawing’s worker', () => {
  it('refuses every way to the network, and counts each attempt', async () => {
    const source = fromSources(new URL('./test/network-probe.ts', import.meta.url));
    const worker = new Worker(source.script, { eval: source.eval });
    const answer = await new Promise<{ results: Record<string, string>; attempts: number }>(
      (resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
      },
    );
    await worker.terminate();
    expect(Object.values(answer.results)).toEqual(
      Array.from({ length: 10 }, () => 'Making a drawing reaches no network.'),
    );
    expect(answer.attempts).toBe(10);
  }, 60_000);
});
