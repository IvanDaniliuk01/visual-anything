/**
 * The cleaner's worker thread (ADR 0075): limited to 1 GiB and 30 seconds, it cleans a file at every
 * cap within them, reaches neither the network nor a file, and is stopped when it runs past either.
 */
import { Worker } from 'node:worker_threads';
import { readSolid } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { fromSources } from '../drawings/make';
import { cleanSolid } from './clean';
import { SOLID_WORKER_LIMITS, checkInWorker, cleanInWorker } from './cleaner';
import { AT_THE_CAPS, solidAtTheCaps } from './test/caps';
import { box, inputGlb } from './test/gltf';

const ARM = inputGlb({
  nodes: [
    { name: 'base', children: [1], mesh: 0 },
    { name: 'link', translation: [0, 1, 0], mesh: 0 },
  ],
  meshes: [box()],
});

describe('the cleaner’s worker thread (ADR 0075)', () => {
  it('cleans a file into the bytes the cleaner gives, and checks them', async () => {
    const inThread = await cleanSolid(ARM.slice());
    const inWorker = await cleanInWorker(ARM.slice());
    expect(inWorker.ok).toBe(true);
    if (!inWorker.ok || !inThread.ok) return;
    expect(inWorker.bytes).toEqual(inThread.bytes);
    expect(inWorker.description).toEqual(inThread.description);
    const checked = await checkInWorker(inWorker.bytes);
    expect(checked).toEqual({ ok: true, hash: inThread.hash, description: inThread.description });
    // The bytes checked are still the caller's.
    expect(inWorker.bytes.length).toBeGreaterThan(0);
  }, 60_000);

  it('answers a check of bytes that are not a canonical file with why', async () => {
    const checked = await checkInWorker(ARM);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.problems[0]?.code).toBe('invalid-solid');
  }, 60_000);

  it('cleans a file at every cap within 1 GiB and 30 s', async () => {
    const bytes = solidAtTheCaps();
    const started = performance.now();
    const result = await cleanInWorker(bytes);
    const seconds = (performance.now() - started) / 1000;
    expect(result.ok, JSON.stringify(result.ok ? '' : result.problems)).toBe(true);
    if (!result.ok) return;
    expect(seconds).toBeLessThan(SOLID_WORKER_LIMITS.timeMs / 1000);
    const read = readSolid(result.bytes);
    expect(read.ok).toBe(true);
    expect(result.description.counts).toEqual({
      triangles: AT_THE_CAPS.triangles,
      vertices: AT_THE_CAPS.vertices,
      nodes: AT_THE_CAPS.parts * 2,
      textures: AT_THE_CAPS.textures,
    });
    expect(result.description.parts).toHaveLength(AT_THE_CAPS.parts);
    expect(result.description.animations).toHaveLength(AT_THE_CAPS.animations);
  }, 180_000);

  it('stops a worker past its time, and one past its memory', async () => {
    const slow = await cleanInWorker(
      ARM.slice(),
      {},
      {
        timeMs: 1500,
        worker: { script: 'for (;;) {}', eval: true },
      },
    );
    expect(slow).toEqual({
      ok: false,
      problems: [
        {
          code: 'solid-too-large',
          message: 'Cleaning the file took over 2 seconds, so it was stopped.',
        },
      ],
    });
    const greedy = await cleanInWorker(
      ARM.slice(),
      {},
      {
        memoryMb: 64,
        worker: {
          script: 'const kept = []; for (;;) kept.push({ a: [1, 2, 3], b: "x".repeat(64) });',
          eval: true,
        },
      },
    );
    expect(greedy).toEqual({
      ok: false,
      problems: [
        {
          code: 'solid-too-large',
          message: 'Cleaning the file needed over 64 MiB of memory, so it was stopped.',
        },
      ],
    });
  }, 60_000);

  it('refuses what a worker made after it tried to reach the network or a file', async () => {
    const answer = await cleanInWorker(
      ARM.slice(),
      {},
      {
        worker: {
          script:
            'require("node:worker_threads").parentPort.postMessage({ ok: true, bytes: new Uint8Array(4), attempts: 1 })',
          eval: true,
        },
      },
    );
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.problems[0]?.code).toBe('program-failed');
  }, 60_000);
});

describe('the file guard of the cleaner’s worker', () => {
  it('refuses every way to a file, and counts each attempt', async () => {
    const source = fromSources(new URL('./test/file-probe.ts', import.meta.url));
    const worker = new Worker(source.script, { eval: source.eval });
    const answer = await new Promise<{ results: Record<string, string>; attempts: number }>(
      (resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
      },
    );
    await worker.terminate();
    expect(Object.values(answer.results)).toEqual(
      Array.from({ length: 9 }, () => 'Cleaning a solid reads no file.'),
    );
    expect(answer.attempts).toBe(9);
  }, 60_000);
});
