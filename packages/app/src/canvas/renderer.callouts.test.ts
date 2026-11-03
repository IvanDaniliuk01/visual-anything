/**
 * The renderer and callouts (M15.4, ADR 0091): a callout's line writes its name only while the
 * pointer or the selection is on it or on one of its shapes, and while its drawing turns its line
 * follows its part's point, still outside the picture but for its last segment.
 */
import { fitSolidCamera, placeSolidPoint, solidHash } from '@visual-anything/core';
import type { SolidCamera } from '@visual-anything/schema';
import { Container, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import type { SolidFrameReply } from '../solids/protocol';
import { StandInSolidWorker } from '../solids/stand-in';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { ARM_FILE, armDefinition, withCallouts } from '../test/solids';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { ImagePlatform } from './images';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';
import { solidPartPoint } from './shape-solids';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

const platform: ImagePlatform<Texture, unknown> = {
  now: () => performance.now(),
  bytesOf: (base64) => new Uint8Array(base64.length),
  decodeBitmap: () => Promise.resolve({}),
  loadSvg: () => Promise.resolve({}),
  texture: () => new Texture({ source: Texture.WHITE.source }),
  atlasTexture: () => new Texture({ source: Texture.WHITE.source }),
  flush: () => {},
  destroyTexture: () => {},
  destroyPage: () => {},
  releasePicture: () => {},
};

async function started() {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  const client = createSolidClient({
    files: {
      get: (hash: string): Promise<SolidFileResult> =>
        Promise.resolve(
          hash === solidHash(ARM_FILE)
            ? { ok: true, bytes: ARM_FILE.slice() }
            : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
        ),
    },
    start: () => new StandInSolidWorker(),
  });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: counting, images: platform, solids: client },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const definition = armDefinition();
  renderer.setSolids(
    client,
    (id) => (id === definition.id ? definition.parts : undefined),
    (id) => (id === definition.id ? definition : undefined),
  );
  return { renderer };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('the renderer and callouts (ADR 0091)', () => {
  it('writes a callout line name only on hover and selection', async () => {
    const { renderer } = await started();
    const indexed = indexScene(buildScene(withCallouts(), 'robot'));
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    const written = () => renderer.quietLabelsWritten.map((line) => line.label);
    expect(written()).toEqual([]);
    // The pointer on the callout writes its line's name.
    renderer.setSelection(EMPTY_SELECTION, 'arm/m-base');
    expect(written()).toEqual(['Torque']);
    renderer.setSelection(EMPTY_SELECTION, undefined);
    expect(written()).toEqual([]);
    // On the line itself.
    renderer.setHoveredLine('gripper-drives-sees');
    expect(written()).toEqual(['Angle']);
    renderer.setHoveredLine(undefined);
    // Selecting the part writes the names of the lines on it.
    renderer.setSelection(selectionOf([{ kind: 'element', id: 'gripper' }]), undefined);
    expect(written()).toEqual(['Angle']);
    renderer.setSelection(selectionOf([{ kind: 'relation', id: 'm-base-drives-base' }]), undefined);
    expect(written()).toEqual(['Torque']);
    renderer.setSelection(EMPTY_SELECTION, undefined);
    expect(written()).toEqual([]);
  });

  it('follows a turning drawing: a callout line ends at its part’s point, outside the picture before', async () => {
    const { renderer } = await started();
    const definition = armDefinition();
    const indexed = indexScene(buildScene(withCallouts(), 'robot'));
    renderer.show(indexed);
    renderer.setCamera({ x: 0, y: 0, scale: 1 });
    const arm = indexed.byKey.get('arm');
    const picture = arm?.picture?.rect;
    if (!arm?.solid || !picture) throw new Error('No arm.');
    const turned: SolidCamera = { azimuth: 120, elevation: -10 };
    const frame: SolidFrameReply = {
      type: 'frame',
      turn: 1,
      serial: 1,
      camera: turned,
      bitmap: { close: () => undefined } as unknown as ImageBitmap,
      width: 10,
      height: 10,
    };
    renderer.setTurning({ key: 'arm', frame });
    const line = renderer.turningRoutes.find((each) => each.relation === 'm-base-drives-base');
    const fitted = fitSolidCamera(definition.bounds, turned, picture.width / picture.height);
    const index = definition.parts.findIndex((each) => each.name === 'base');
    const point = placeSolidPoint(fitted, solidPartPoint(definition, index)!, picture);
    const end = line?.route.at(-1);
    expect(end?.x).toBeCloseTo(point.x, 6);
    expect(end?.y).toBeCloseTo(point.y, 6);
    // The callout stays where it is; its line leaves its side and keeps outside the picture.
    const callout = indexed.byKey.get('arm/m-base');
    expect(callout?.rect).toEqual(indexed.scene.shapes.find((s) => s.key === 'arm/m-base')?.rect);
    for (const bend of line?.route.slice(0, -1) ?? []) {
      const inside =
        bend.x > picture.x &&
        bend.x < picture.x + picture.width &&
        bend.y > picture.y &&
        bend.y < picture.y + picture.height;
      expect(inside).toBe(false);
    }
    renderer.setTurning(undefined);
  });
});
