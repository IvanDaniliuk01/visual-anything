/**
 * Turning on the canvas (ADR 0075), with the stand-in worker: one `turn/*` session for the selected
 * shape's solid, its handle, the keys and their announcements, a drag and the wheel, Escape and
 * selecting something else ending it, Play never offered under reduced motion, and Use this view's
 * single command.
 */
import { solidHash, type Command } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { createSolidClient, type SolidFileResult } from '../../solids/client';
import { StandInSolidWorker } from '../../solids/stand-in';
import { ARM_FILE, ARM_ID, armDefinition, withSolids } from '../../test/solids';
import { buildScene, type ElementShape } from '../scene';
import { SolidTurner } from './turner';

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function setUp(options: { reducedMotion?: boolean; scale?: number; animations?: boolean } = {}) {
  const workers: StandInSolidWorker[] = [];
  const client = createSolidClient({
    files: {
      get: (hash: string): Promise<SolidFileResult> =>
        Promise.resolve(
          hash === solidHash(ARM_FILE)
            ? { ok: true, bytes: ARM_FILE.slice() }
            : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
        ),
    },
    start: () => {
      const worker = new StandInSolidWorker();
      workers.push(worker);
      return worker;
    },
  });
  const announced: string[] = [];
  const shown: ({ key: string } | undefined)[] = [];
  const commands: Command[] = [];
  const project = withSolids();
  const definition = {
    ...armDefinition(),
    ...(options.animations ? { animations: [{ duration: 2 }] } : {}),
  };
  const turner = new SolidTurner({
    client: () => client,
    definition: (id) => (id === ARM_ID ? definition : undefined),
    project: () => project,
    scale: () => options.scale ?? 1,
    resolution: () => 1,
    show: (turning) => shown.push(turning && { key: turning.key }),
    announce: (text) => announced.push(text),
    command: vi.fn((command: Command) => {
      commands.push(command);
      return Promise.resolve(true);
    }),
    reducedMotion: () => options.reducedMotion === true,
  });
  const scene = buildScene(project, 'robot');
  const shapeOf = (key: string): ElementShape => {
    const found = scene.shapes.find((shape) => shape.key === key);
    if (!found) throw new Error(`No shape ${key}`);
    return found;
  };
  return { turner, workers, announced, shown, commands, shapeOf, scene };
}

const key = (name: string, more: Partial<KeyboardEvent> = {}) => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  preventDefault: () => {},
  ...more,
});

describe('turning a solid on the canvas', () => {
  it('turns only a shape that shows a solid, with a handle on a picture at least 96 pixels across', () => {
    const { turner, shapeOf } = setUp();
    expect(turner.canTurn(shapeOf('arm'))).toBe(true);
    expect(turner.canTurn(shapeOf('arm/extra'))).toBe(false);
    const arm = shapeOf('arm');
    const rect = arm.solid?.rect;
    expect(turner.handleOf(arm)).toEqual({
      x: (rect?.x ?? 0) + (rect?.width ?? 0) - 12,
      y: (rect?.y ?? 0) + 12,
    });
    // The motor's icon is far smaller than 96 pixels.
    expect(turner.handleOf(shapeOf('motor'))).toBeUndefined();
    expect(setUp({ scale: 0.2 }).turner.handleOf(arm)).toBeUndefined();
  });

  it('starts one session, announces where the solid is seen from, and ends it with Escape', async () => {
    const { turner, workers, announced, shown, shapeOf } = setUp();
    expect(turner.start(shapeOf('arm'))).toBe(true);
    await settle();
    expect(turner.turned?.key).toBe('arm');
    expect(shown[0]).toEqual({ key: 'arm' });
    const [start] = workers[0]?.ofType('turn/start') ?? [];
    expect(start?.camera).toEqual({ azimuth: 30, elevation: 20 });
    expect(start?.parts).toBe(true);
    expect(announced[0]).toMatch(
      /^Arm, seen from the front left, above\. Drag or use the arrow keys/,
    );
    // Starting another ends the first: one session at a time.
    turner.start(shapeOf('pictured'));
    await settle();
    expect(workers[0]?.ofType('turn/end')).toHaveLength(1);
    expect(turner.turned?.key).toBe('pictured');
    expect(turner.key(key('Escape'))).toBe(true);
    await settle();
    expect(turner.turned).toBeUndefined();
    expect(workers[0]?.ofType('turn/end')).toHaveLength(2);
    expect(shown.at(-1)).toBeUndefined();
    expect(announced.at(-1)).toBe('Stopped turning pictured.');
  });

  it('turns by the keys, announcing each view, and leaves other keys to the canvas', async () => {
    const { turner, workers, announced, shapeOf } = setUp();
    turner.start(shapeOf('arm'));
    await settle();
    expect(turner.key(key('ArrowLeft', { shiftKey: true }))).toBe(true);
    expect(announced.at(-1)).toBe('Arm, seen from the back left, above');
    expect(turner.key(key('ArrowDown', { shiftKey: true }))).toBe(true);
    expect(announced.at(-1)).toBe('Arm, seen from the back left, below');
    expect(turner.key(key('0'))).toBe(true);
    expect(turner.turned?.camera).toEqual({ azimuth: 30, elevation: 20 });
    expect(turner.key(key('Delete'))).toBe(false);
    expect(turner.key(key('a', { ctrlKey: true }))).toBe(false);
    await settle();
    const cameras = (workers[0]?.ofType('turn/camera') ?? []).map((each) => each.camera);
    expect(cameras).toEqual([
      { azimuth: 120, elevation: 20 },
      { azimuth: 120, elevation: -70 },
      { azimuth: 30, elevation: 20 },
    ]);
  });

  it('turns by a drag over its picture, announcing once it ends, and zooms by the wheel there', () => {
    const { turner, announced, shapeOf } = setUp();
    const arm = shapeOf('arm');
    turner.start(arm);
    const rect = arm.solid?.rect ?? { x: 0, y: 0, width: 1, height: 1 };
    const inside = { x: rect.x + 10, y: rect.y + 10 };
    expect(turner.press({ x: rect.x - 50, y: rect.y }, { x: 0, y: 0 }, arm)).toBe(false);
    expect(turner.press(inside, { x: 100, y: 100 }, arm)).toBe(true);
    const said = announced.length;
    turner.move({ x: 100 + rect.width / 2, y: 100 }, rect.width);
    expect(turner.turned?.camera.azimuth).toBe(-60);
    expect(announced).toHaveLength(said);
    turner.release();
    expect(announced.at(-1)).toBe('Arm, seen from the front right, above');
    expect(turner.wheel(inside, -500, arm)).toBe(true);
    expect(turner.turned?.camera.zoom).toBe(2);
    expect(turner.wheel({ x: rect.x - 50, y: rect.y }, -500, arm)).toBe(false);
  });

  it('ends when something else is selected, or its shape no longer shows its solid', () => {
    const { turner, shapeOf, scene } = setUp();
    turner.start(shapeOf('arm'));
    turner.selectionChanged(new Set(['arm']));
    expect(turner.turned).toBeDefined();
    turner.selectionChanged(new Set(['motor']));
    expect(turner.turned).toBeUndefined();
    turner.start(shapeOf('arm'));
    const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
    byKey.delete('arm');
    turner.follow(byKey);
    expect(turner.turned).toBeUndefined();
  });

  it('offers Play for a solid with animations, never under reduced motion', async () => {
    const animated = setUp({ animations: true });
    animated.turner.start(animated.shapeOf('arm'));
    await settle();
    expect(animated.turner.animations).toBe(1);
    animated.turner.play(true);
    await settle();
    expect(animated.turner.playing).toBe(true);
    expect(animated.workers[0]?.ofType('turn/play').at(-1)?.animation).toBe(0);
    const reduced = setUp({ animations: true, reducedMotion: true });
    reduced.turner.start(reduced.shapeOf('arm'));
    await settle();
    expect(reduced.turner.animations).toBe(0);
    reduced.turner.play(true);
    await settle();
    expect(reduced.turner.playing).toBe(false);
    expect(reduced.workers[0]?.ofType('turn/play') ?? []).toEqual([]);
  });

  it('keeps the camera with Use this view, in one command, and announces it', async () => {
    const { turner, commands, announced, shapeOf } = setUp();
    turner.start(shapeOf('arm'));
    // Nothing to keep before it turned.
    expect(await turner.useThisView()).toBe(false);
    turner.key(key('ArrowRight'));
    expect(await turner.useThisView()).toBe(true);
    expect(commands).toEqual([
      {
        type: 'set-component-appearance',
        component: 'robotics.arm',
        appearance: {
          solid: { solid: ARM_ID, placement: 'parts', camera: { azimuth: 15, elevation: 20 } },
        },
      },
    ]);
    expect(announced.at(-1)).toBe('Kept this view of Arm.');
    // What it keeps is where 0 now goes back to.
    turner.key(key('ArrowRight'));
    turner.key(key('0'));
    expect(turner.turned?.camera).toEqual({ azimuth: 15, elevation: 20 });
  });
});
