/**
 * Solids in a read-only page (ADR 0075): what its data holds of them, their files or their pictures,
 * read strictly; its policy and scripts in both forms and without solids; and the clients its canvas
 * draws them through, the worker it holds or its pictures, neither fetching anything.
 */
import { createHash } from 'node:crypto';
import { encodeBase64, solidHash } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { solidPictureKey } from '../canvas/shape-solids';
import { StandInSolidWorker } from '../solids/stand-in';
import { loadSample } from '../test/sample';
import { ARM_FILE, withSolids } from '../test/solids';
import { pageDataOf, readPageData } from './data';
import {
  PAGE_POLICY_RULES,
  SOLID_WORKER_ID,
  SOLID_WORKER_POLICY,
  SOLID_WORKER_SCRIPT,
  SolidWorkerMissing,
  writePage,
  type ViewerAssets,
} from './page';
import { pageSolidClient, pageWorkerStart, picturesClient } from './solid-clients';
import {
  SOLID_WORKER_START,
  readPageSolids,
  readPartRuns,
  shapesShowingSolids,
  solidHashesShown,
  writePartRuns,
  type PageSolids,
} from './solids';

const ASSETS: ViewerAssets = {
  script: 'document.body.dataset.viewer = "ready";',
  style: ':root { color: CanvasText; }',
  solidWorker: 'self.onmessage = function () {}; /* three.js would be here */',
};

const ARM_HASH = solidHash(ARM_FILE);
const FILES: PageSolids = { form: 'files', files: { [ARM_HASH]: encodeBase64(ARM_FILE) } };
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function hashOf(text: string): string {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

function policyOf(html: string): Map<string, string[]> {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!meta) throw new Error('The page has no policy.');
  return new Map(
    (meta[1] ?? '').split(';').map((directive) => {
      const [name = '', ...values] = directive.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

function scriptsOf(html: string): { attributes: string; body: string }[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(
    ([, attributes = '', body = '']) => ({ attributes: attributes.trim(), body }),
  );
}

describe('what a page holds of its solids', () => {
  it('names the files of every solid its views show, once each', () => {
    expect(solidHashesShown(withSolids())).toEqual([ARM_HASH]);
    expect(solidHashesShown(loadSample())).toEqual([]);
    // The anchored parts are drawn by their drawing's picture, and show none of their own.
    expect(shapesShowingSolids(withSolids()).every((shape) => shape.part?.inDrawing !== true)).toBe(
      true,
    );
  });

  it('carries its solids as data, read back as they were written, and none without', () => {
    const project = withSolids();
    const read = readPageData(JSON.stringify(pageDataOf(project, { solids: FILES })), validateFile);
    expect(read.ok && read.solids).toEqual(FILES);
    const plain = readPageData(JSON.stringify(pageDataOf(project)), validateFile);
    expect(plain.ok && plain.solids).toBeUndefined();
    expect(pageDataOf(loadSample())).not.toHaveProperty('solids');
  });

  it('refuses a file no package names, and solids that are not what a page holds', () => {
    const project = withSolids();
    const stray = 'a'.repeat(64);
    const refused = readPageData(
      JSON.stringify(
        pageDataOf(project, { solids: { form: 'files', files: { [stray]: encodeBase64(ARM_FILE) } } }),
      ),
      validateFile,
    );
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.problems).toContain(
      `The page holds a solid file "${stray}" no package names.`,
    );
    for (const solids of [
      { form: 'files', files: { 'not a hash': 'AAAA' } },
      { form: 'files', files: { [ARM_HASH]: 'not base64!' } },
      { form: 'files', files: {}, script: 'alert(1)' },
      { form: 'pictures', pictures: [{ key: 'k', bucket: 100, width: 100, height: 100, png: '' }] },
      { form: 'pictures', pictures: [{ key: 'k', bucket: 128, width: 129, height: 1, png: '' }] },
      { form: 'pictures', pictures: [{ key: 'k', bucket: 128, width: 128, height: 1, png: '', src: 'x' }] },
      { form: 'models' },
      'files',
    ]) {
      expect(readPageSolids(solids).ok).toBe(false);
    }
    expect(
      readPageSolids({
        form: 'pictures',
        pictures: [{ key: 'k', bucket: 128, width: 128, height: 64, png: PNG_1PX }],
      }).ok,
    ).toBe(true);
  });

  it('writes a part buffer as its runs, and reads exactly it back', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.integer({ min: 0, max: 70_000 }), { minLength: 144, maxLength: 144 }),
        (width, height, values) => {
          const data = Uint16Array.from(values.slice(0, width * height), (value) => value % 65_536);
          const read = readPartRuns(writePartRuns({ width, height, data }));
          expect(read?.width).toBe(width);
          expect(read?.height).toBe(height);
          expect([...(read?.data ?? [])]).toEqual([...data]);
        },
      ),
    );
    // Runs that do not fill their buffer, or overflow it, are no buffer.
    const runs = writePartRuns({ width: 2, height: 2, data: new Uint16Array([1, 1, 2, 2]) });
    expect(readPartRuns(runs.slice(0, -2))).toBeUndefined();
    expect(readPartRuns(Uint8Array.from([...runs, 1, 1]))).toBeUndefined();
  });
});

describe('the page’s policy and scripts', () => {
  it('stays as it is for a page without solids, and for a page of their pictures only', async () => {
    for (const solids of [
      undefined,
      { form: 'pictures', pictures: [] } as PageSolids,
    ]) {
      const page = await writePage({
        assets: ASSETS,
        data: pageDataOf(withSolids(), solids ? { solids } : {}),
        title: 'Robot',
      });
      const policy = policyOf(page.html);
      expect(policy.get('worker-src')).toEqual(["'none'"]);
      expect(policy.get('trusted-types')).toEqual(['default']);
      expect(policy.get('script-src')).toHaveLength(2);
      expect(page.html).not.toContain(SOLID_WORKER_ID);
      expect(page.html).not.toContain(ASSETS.solidWorker);
      expect(page.policy).toBe(
        PAGE_POLICY_RULES.map(([directive]) => `${directive} ${policy.get(directive)?.join(' ')}`).join(
          '; ',
        ),
      );
    }
  });

  it('holds the solid worker as text it never runs, started from a blob: address by its own script', async () => {
    const page = await writePage({
      assets: ASSETS,
      data: pageDataOf(withSolids(), { solids: FILES }),
      title: 'Robot',
    });
    const policy = policyOf(page.html);
    expect(policy.get('worker-src')).toEqual(['blob:']);
    expect(policy.get('trusted-types')).toEqual(['default', SOLID_WORKER_POLICY]);
    expect(policy.get('connect-src')).toEqual(["'none'"]);
    expect(policy.get('default-src')).toEqual(["'none'"]);
    const scripts = scriptsOf(page.html);
    expect(scripts.map((each) => each.attributes)).toEqual([
      '',
      'type="application/json" id="visual-anything-project"',
      `type="text/plain" id="${SOLID_WORKER_ID}"`,
      '',
      'type="module"',
    ]);
    expect(scripts[2]?.body).toBe(ASSETS.solidWorker);
    expect(scripts[3]?.body).toBe(SOLID_WORKER_SCRIPT);
    // Three scripts run, each by its hash: the first paint's, the worker's starter and the viewer.
    expect(policy.get('script-src')).toEqual(
      [scripts[0]?.body, SOLID_WORKER_SCRIPT, ASSETS.script].map(
        (body) => `'${hashOf(body ?? '')}'`,
      ),
    );
    // The starter fetches nothing, and lets through the one address it made.
    expect(SOLID_WORKER_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|import|src=|eval|Function\(/);
    expect(SOLID_WORKER_SCRIPT).toContain('createObjectURL');
    expect(SOLID_WORKER_SCRIPT).toContain(SOLID_WORKER_START);
    // The solids' size counts toward the page's, and is said.
    expect(page.solidBytes).toBeGreaterThan(ARM_FILE.byteLength);
    expect(page.solidBytes).toBeLessThan(page.bytes);
  });

  it('refuses to hold solids’ files without a worker to draw them', async () => {
    const { solidWorker: _worker, ...viewer } = ASSETS;
    await expect(
      writePage({ assets: viewer, data: pageDataOf(withSolids(), { solids: FILES }), title: 'Robot' }),
    ).rejects.toThrow(SolidWorkerMissing);
  });

  it('counts no solid bytes in a page without solids', async () => {
    const page = await writePage({ assets: ASSETS, data: pageDataOf(loadSample()), title: 'S' });
    expect(page.solidBytes).toBe(0);
  });
});

describe('the page’s solid clients', () => {
  it('draws from the files the page holds, through the worker it holds, fetching nothing', async () => {
    let worker: StandInSolidWorker | undefined;
    const host = { [SOLID_WORKER_START]: () => (worker = new StandInSolidWorker()) };
    const start = pageWorkerStart(host);
    expect(start).toBeDefined();
    expect(pageWorkerStart({})).toBeUndefined();
    const client = pageSolidClient(FILES, start);
    const shape = shapesShowingSolids(withSolids())[0]!;
    const key = solidPictureKey(shape) as string;
    const [picture] = await client!.draw([
      {
        key,
        solid: ARM_HASH,
        pixels: 200,
        aspect: 1,
        distance: 0,
        camera: { azimuth: 30, elevation: 20 },
        lighting: 'studio',
        hidden: [],
        parts: false,
      },
    ]);
    expect(picture?.key).toBe(key);
    expect(worker?.ofType('load')[0]?.hash).toBe(ARM_HASH);
    // Without a worker, a page's files draw nothing: every solid is its placeholder.
    expect(pageSolidClient(FILES, undefined)).toBeUndefined();
    expect(pageSolidClient(undefined, start)).toBeUndefined();
  });

  it('gives the pictures a page holds, decoded once, and turns nothing', async () => {
    const runs = encodeBase64(
      writePartRuns({ width: 128, height: 128, data: new Uint16Array(128 * 128).fill(2) }),
    );
    const decoded: number[] = [];
    const bitmap = { close: () => {} } as unknown as ImageBitmap;
    const client = picturesClient(
      [{ key: 'arm', bucket: 128, width: 128, height: 128, png: PNG_1PX, parts: runs }],
      (png) => {
        decoded.push(png.length);
        return Promise.resolve(bitmap);
      },
    );
    expect(client.picture('arm', 128)).toBeUndefined();
    const seen: string[] = [];
    client.subscribe((picture) => seen.push(picture.key));
    client.ask([
      {
        key: 'arm',
        solid: ARM_HASH,
        pixels: 900,
        aspect: 1,
        distance: 0,
        camera: { azimuth: 0, elevation: 0 },
        lighting: 'flat',
        hidden: [],
        parts: true,
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['arm']);
    const kept = client.picture('arm', 2048);
    expect(kept?.exact).toBe(true);
    expect(kept?.picture.partBuffer?.data[0]).toBe(2);
    expect(decoded).toHaveLength(1);
    expect(client.turn({} as never).frame).toBeUndefined();
    expect(client.picture('other', 128)).toBeUndefined();
  });
});
