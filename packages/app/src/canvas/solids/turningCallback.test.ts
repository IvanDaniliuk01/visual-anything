/**
 * The canvas says what it turns (ADR 0075), for the inspector's Use this view: once when a solid starts
 * turning, with its shape and element, never for each frame, and once when it ends.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolidClient, SolidTurning } from '../../solids/client';
import type { SolidFrameReply } from '../../solids/protocol';
import { FakeApplication, FakeResizeObserver } from '../../test/FakeApplication';
import { loadSample } from '../../test/sample';
import { CanvasController } from '../controller';
import { indexScene } from '../hit';
import { buildScene } from '../scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'system-overview';

const ARM: SolidDefinition = {
  id: 'clinic.arm',
  name: 'Arm',
  hash: 'a'.repeat(64),
  bytes: 1000,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  counts: { triangles: 12, vertices: 8, nodes: 1, textures: 0 },
  parts: [],
  camera: { azimuth: 30, elevation: 20 },
};

function withArm(): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic' ? { ...file, solids: [ARM] } : file,
    ),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((element) =>
        element.id === 'patient'
          ? { ...element, appearance: { solid: { solid: ARM.id } } }
          : element,
      ),
    },
  };
}

function fakeSolids() {
  let frames: ((frame: SolidFrameReply) => void) | undefined;
  const session: SolidTurning = {
    turn: 1,
    frame: undefined,
    camera: vi.fn(),
    play: vi.fn(),
    end: vi.fn(),
  };
  const client = {
    started: true,
    limits: undefined,
    contextLost: false,
    unavailable: false,
    problem: () => undefined,
    picture: () => undefined,
    ask: () => undefined,
    subscribe: () => () => undefined,
    release: () => undefined,
    dispose: () => undefined,
    pick: () => Promise.resolve(undefined),
    turn: (_view: unknown, onFrame?: (frame: SolidFrameReply) => void) => {
      frames = onFrame;
      return session;
    },
  } as unknown as SolidClient;
  return { client, frame: (frame: SolidFrameReply) => frames?.(frame) };
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('what the canvas turns', () => {
  it('is said once when turning starts and once when it ends, never for each frame', async () => {
    const host = document.createElement('div');
    host.tabIndex = 0;
    document.body.append(host);
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
    const said: ({ key: string; element: string } | undefined)[] = [];
    const solids = fakeSolids();
    const controller = new CanvasController(
      host,
      {
        select: () => undefined,
        command: () => Promise.resolve(true),
        relate: () => undefined,
        remove: () => undefined,
        rename: () => undefined,
        camera: () => undefined,
        failure: () => undefined,
        announce: () => undefined,
        turning: (turned) => said.push(turned),
      },
      { solids: solids.client },
    );
    const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
    app.finishInit();
    await Promise.resolve();
    await Promise.resolve();
    const project = withArm();
    const indexed = indexScene(buildScene(project, VIEW));
    controller.update(project, VIEW, indexed, true);
    const shape = indexed.scene.shapes.find((each) => each.element === 'patient');
    if (!shape?.solid) throw new Error('The patient shows no solid.');
    expect(controller.turn(shape.key)).toBe(true);
    expect(said).toEqual([{ key: shape.key, element: 'patient' }]);
    solids.frame({
      type: 'frame',
      turn: 1,
      serial: 1,
      camera: ARM.camera,
      bitmap: { close: () => undefined } as unknown as ImageBitmap,
      width: 10,
      height: 10,
    });
    expect(said).toHaveLength(1);
    controller.endTurning();
    expect(said).toEqual([{ key: shape.key, element: 'patient' }, undefined]);
    controller.destroy();
  });
});
