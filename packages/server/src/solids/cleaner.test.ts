/**
 * The cleaner's worker thread (ADR 0075): limited to 1 GiB and 30 seconds, it cleans a file at every
 * cap within them, reaches neither the network nor a file, and is stopped when it runs past either.
 */
import { Worker } from 'node:worker_threads';
import { readImageHeader, readSolid, SOLID_CAPS } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { fromSources } from '../drawings/make';
import { cleanSolid } from './clean';
import { SOLID_WORKER_LIMITS, checkInWorker, cleanInWorker } from './cleaner';
import { AT_THE_CAPS, solidAtTheCaps } from './test/caps';
import { box, inputGlb } from './test/gltf';

/** The size and bytes of each texture a canonical file holds, in its images' order. */
function texturesOf(bytes: Uint8Array): { width: number; height: number; bytes: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    images?: { bufferView: number }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
  };
  const bin = bytes.subarray(20 + length + 8);
  return (json.images ?? []).map((image) => {
    const at = json.bufferViews[image.bufferView] as { byteOffset?: number; byteLength: number };
    const picture = bin.subarray(at.byteOffset ?? 0, (at.byteOffset ?? 0) + at.byteLength);
    const header = readImageHeader(picture);
    return { width: header?.width ?? 0, height: header?.height ?? 0, bytes: picture.length };
  });
}

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
    expect(result.bytes.length).toBeLessThanOrEqual(SOLID_CAPS.fileBytes);
    // The description counts what the file keeps; its nodes draw each mesh twice, to the caps.
    expect(result.description.counts).toEqual({
      triangles: AT_THE_CAPS.storedTriangles,
      vertices: AT_THE_CAPS.storedVertices,
      nodes: AT_THE_CAPS.parts * 2,
      textures: AT_THE_CAPS.textures,
    });
    expect(AT_THE_CAPS.storedTriangles * 2).toBe(SOLID_CAPS.triangles);
    expect(AT_THE_CAPS.storedVertices * 2).toBe(SOLID_CAPS.vertices);
    // Its textures are kept whole, at a solid's largest side, and come to nearly 16 MiB.
    const textures = texturesOf(result.bytes);
    expect(textures).toHaveLength(SOLID_CAPS.textures);
    for (const texture of textures) {
      expect([texture.width, texture.height]).toEqual([
        SOLID_CAPS.textureSide,
        SOLID_CAPS.textureSide,
      ]);
    }
    const textureBytes = textures.reduce((sum, texture) => sum + texture.bytes, 0);
    expect(textureBytes).toBeLessThanOrEqual(SOLID_CAPS.textureBytes);
    expect(textureBytes).toBeGreaterThan(SOLID_CAPS.textureBytes * 0.99);
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
    const tried = Object.keys(answer.results);
    expect(tried).toHaveLength(29);
    expect(answer.results).toEqual(
      Object.fromEntries(tried.map((name) => [name, 'Cleaning a solid reads no file.'])),
    );
    expect(answer.attempts).toBe(tried.length);
  }, 60_000);
});
