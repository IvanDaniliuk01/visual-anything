/**
 * The scene's seam for solids (M9, ADR 0075): where a shape's solid is placed, a drawing with parts
 * that shows a solid with its anchored parts at their points, relations ending there, the key its
 * pictures are kept by, and the incremental scene keeping all of it.
 */
import {
  executeCommand,
  fitSolidCamera,
  placeSolidPoint,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { ARM_ID, armDefinition, withSolids } from '../test/solids';
import { imageSerial, solidPictureSerial } from './image-serials';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';
import { bodyRectOf, holdsDrawn, nameBandOf } from './shape-images';
import {
  SOLID_DRAWING_SIDE,
  SOLID_POINT_RADIUS,
  solidPartPoint,
  solidPictureKey,
  withHiddenParts,
} from './shape-solids';
import { solidMarkLines } from './solidMark';
import { solidAskFor } from '../solids/client';

const VIEW = 'robot';
const project = () => withSolids(VIEW);

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function changed(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** Where a part's point is placed on a drawing's picture, as the core's camera maths places it. */
function pointOn(drawing: ElementShape, index: number) {
  const definition = armDefinition();
  const picture = drawing.picture?.rect;
  if (!picture) throw new Error('The drawing has no picture.');
  const camera = fitSolidCamera(
    definition.bounds,
    definition.camera,
    picture.width / picture.height,
  );
  const point = solidPartPoint(definition, index);
  if (!point) throw new Error('The part has no point.');
  return placeSolidPoint(camera, point, picture);
}

describe('a drawing with parts that shows a solid (ADR 0075)', () => {
  it('draws its picture under its header, 320 units a side, in place of any image', () => {
    const arm = shapeOf(buildScene(project(), VIEW), 'arm');
    const rect = { x: 24, y: 48, width: SOLID_DRAWING_SIDE, height: SOLID_DRAWING_SIDE };
    expect(arm.picture).toEqual({ rect, scale: 1 });
    expect(arm.image).toBeUndefined();
    expect(arm.solid).toEqual({
      id: ARM_ID,
      hash: armDefinition().hash,
      placement: 'parts',
      camera: { azimuth: 30, elevation: 20 },
      lighting: 'studio',
      rect,
      box: rect,
    });
    expect(arm.holdsContents).toBe(true);
    expect(arm.rect.width).toBeGreaterThanOrEqual(320 + 48);
  });

  it('places each anchored part as the dot around its point, the first content for each part', () => {
    const scene = buildScene(project(), VIEW);
    const arm = shapeOf(scene, 'arm');
    for (const [key, index] of [
      ['arm/base', 0],
      ['arm/link', 1],
      ['arm/gripper', 4],
    ] as const) {
      const shape = shapeOf(scene, key);
      const point = pointOn(arm, index);
      expect(shape.part).toMatchObject({ solid: ARM_ID, index, inDrawing: true });
      expect(shape.part?.point?.x).toBeCloseTo(point.x, 9);
      expect(shape.part?.point?.y).toBeCloseTo(point.y, 9);
      expect(shape.rect.width).toBe(2 * SOLID_POINT_RADIUS);
      expect(shape.rect.x + SOLID_POINT_RADIUS).toBe(shape.part?.point?.x);
      expect(shape.positioned).toBe('placed');
      // It has no outline, image or solid of its own: the drawing's picture draws it.
      expect(shape.outline).toBeUndefined();
      expect(shape.solid).toBeUndefined();
      expect(shape.image).toBeUndefined();
    }
    expect(shapeOf(scene, 'arm/link').undrawn).toEqual(['inner']);
    expect(scene.shapes.some((shape) => shape.element === 'inner')).toBe(false);
    // A second content naming the same part, and one naming none, are placed below the picture.
    for (const key of ['arm/twin', 'arm/extra']) {
      const shape = shapeOf(scene, key);
      expect(shape.part).toBeUndefined();
      expect(shape.rect.y).toBeGreaterThanOrEqual(48 + 320 + 40);
    }
  });

  it('places a part that draws nothing of its own at the first part it holds that does', () => {
    const scene = buildScene(project(), VIEW);
    const wrist = shapeOf(scene, 'arm/wrist');
    const tip = pointOn(shapeOf(scene, 'arm'), 3);
    expect(armDefinition().parts[2]?.point).toBeUndefined();
    expect(wrist.part?.point?.x).toBeCloseTo(tip.x, 9);
    expect(wrist.part?.point?.y).toBeCloseTo(tip.y, 9);
  });

  it('ends relations at their parts’ points', () => {
    const scene = buildScene(project(), VIEW);
    const lines = new Map(scene.relations.map((line) => [line.relation, line]));
    const gripper = shapeOf(scene, 'arm/gripper').part?.point;
    expect(lines.get('drives')?.to).toEqual(gripper);
    const holds = lines.get('holds');
    expect(holds?.from).toEqual(shapeOf(scene, 'arm/link').part?.point);
    expect(holds?.to).toEqual(shapeOf(scene, 'arm/base').part?.point);
  });

  it('fits its picture to the body of the size the view stores', () => {
    const sized = changed(project(), {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'arm', x: 0, y: 0, width: 448, height: 272 }],
    });
    const scene = buildScene(sized, VIEW);
    const arm = shapeOf(scene, 'arm');
    expect(arm.picture?.rect).toEqual({ x: 24, y: 48, width: 400, height: 200 });
    const point = pointOn(arm, 0);
    expect(shapeOf(scene, 'arm/base').part?.point?.x).toBeCloseTo(point.x, 9);
    expect(scene).toEqual(buildSceneAfresh(sized, VIEW));
    // A width alone gives a square picture of that width.
    const wide = changed(project(), {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'arm', x: 0, y: 0, width: 248 }],
    });
    expect(shapeOf(buildScene(wide, VIEW), 'arm').picture?.rect).toEqual({
      x: 24,
      y: 48,
      width: 200,
      height: 200,
    });
  });

  it('draws its anchored parts in its solid’s parts’ order, whatever the stacking order', () => {
    const stacked = changed(project(), {
      type: 'restack',
      view: VIEW,
      moves: [{ shape: { element: 'base', container: 'arm' }, to: 'front' }],
    });
    for (const state of [project(), stacked]) {
      const scene = buildScene(state, VIEW);
      const drawn = (scene.drawing ?? scene.shapes.map((_, at) => at)).map(
        (at) => (scene.shapes[at] as ElementShape).key,
      );
      const order = ['arm', 'arm/base', 'arm/link', 'arm/wrist', 'arm/gripper'].map((key) =>
        drawn.indexOf(key),
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('keeps its parts at their points as it moves, and equals a scene built from nothing', () => {
    const state = project();
    const before = buildScene(state, VIEW);
    const moved = changed(state, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'arm', x: 40, y: 20 }],
    });
    const after = buildScene(moved, VIEW);
    expect(after).toEqual(buildSceneAfresh(moved, VIEW));
    const was = shapeOf(before, 'arm/gripper').part?.point;
    const now = shapeOf(after, 'arm/gripper').part?.point;
    expect(now?.x).toBeCloseTo((was?.x ?? 0) + 40, 9);
    expect(now?.y).toBeCloseTo((was?.y ?? 0) + 20, 9);
    expect(shapeOf(after, 'arm').solid?.rect).toEqual({ x: 64, y: 68, width: 320, height: 320 });
    expect(new Map(after.relations.map((line) => [line.relation, line])).get('drives')?.to).toEqual(
      now,
    );
  });

  it('draws its contents as ordinary ones once it shows its solid otherwise', () => {
    const plain = changed(project(), {
      type: 'update-element',
      id: 'arm',
      changes: { appearance: { solid: { solid: ARM_ID, placement: 'icon' } } },
    });
    const scene = buildScene(plain, VIEW);
    expect(shapeOf(scene, 'arm').picture).toBeUndefined();
    expect(shapeOf(scene, 'arm').solid?.placement).toBe('header');
    // One that names its solid is drawn as its part on its own; one that names none, as its kind.
    expect(shapeOf(scene, 'arm/link').part).toMatchObject({ solid: ARM_ID, inDrawing: false });
    expect(shapeOf(scene, 'arm/link').solid).toMatchObject({ only: 1, placement: 'header' });
    expect(shapeOf(scene, 'arm/base').part).toBeUndefined();
    expect(shapeOf(scene, 'arm/link/inner')).toBeDefined();
    expect(scene).toEqual(buildSceneAfresh(plain, VIEW));
  });
});

describe('a solid placed on a shape (ADR 0075)', () => {
  it('places an icon beside the name, as an image of that placement, its picture square', () => {
    const motor = shapeOf(buildScene(project(), VIEW), 'motor');
    expect(motor.solid).toMatchObject({ placement: 'icon', lighting: 'flat' });
    expect(motor.solid?.rect.width).toBe(motor.solid?.rect.height);
    expect(motor.solid?.rect.x).toBe(motor.rect.x + 8);
    expect(motor.plate).toBeUndefined();
  });

  it('draws the solid when an appearance shows both an image and a solid, as a drawing on a plate', () => {
    const pictured = shapeOf(buildScene(project(), VIEW), 'pictured');
    expect(pictured.image).toBeUndefined();
    expect(pictured.solid?.placement).toBe('drawing');
    expect(pictured.plate).toBeDefined();
    const { rect } = pictured.solid ?? { rect: undefined };
    expect(rect?.width).toBe(rect?.height);
    // Its placeholder: its outline inside the plate, its name in the band, and the mark.
    expect(bodyRectOf(pictured)).not.toBe(pictured.rect);
    expect(nameBandOf(pictured)).toBe(pictured.solid?.band);
    expect(holdsDrawn(pictured, { x: pictured.rect.x + 1, y: pictured.rect.y + 1 })).toBe(false);
    expect(solidMarkLines(pictured.solid?.rect ?? pictured.rect)).toHaveLength(9);
  });

  it('draws a part on its own as its solid’s picture of that part alone', () => {
    const loose = shapeOf(buildScene(project(), VIEW), 'loose');
    expect(loose.part).toEqual({
      solid: ARM_ID,
      part: 'gripper',
      index: 4,
      color: loose.fill,
      inDrawing: false,
    });
    expect(loose.solid).toMatchObject({ placement: 'drawing', only: 4 });
  });

  it('draws the image of an appearance whose solid no package defines', () => {
    const unknown = shapeOf(buildScene(project(), VIEW), 'unknown');
    expect(unknown.solid).toBeUndefined();
    expect(unknown.image?.id).toBe('robotics.badge');
  });

  it('marks a solid past its package’s total of files as its placeholder for good', () => {
    const many = Array.from({ length: 9 }, (_, at) =>
      armDefinition(at === 0 ? ARM_ID : `robotics.arm-${at}`, 32 * 1024 * 1024),
    );
    // The arm comes last, past 256 MiB.
    const state = withSolids(VIEW, [...many.slice(1), many[0] as (typeof many)[number]]);
    const arm = shapeOf(buildScene(state, VIEW), 'arm');
    expect(arm.solid?.placeholder).toBe(true);
    expect(solidPictureKey(arm)).toBeUndefined();
    expect(solidAskFor(arm, 200, 0)).toBeUndefined();
    expect(shapeOf(buildScene(project(), VIEW), 'arm').solid?.placeholder).toBeUndefined();
  });
});

describe('a solid’s picture key (ADR 0075)', () => {
  it('is the same for shapes that draw the same picture, and differs with what changes it', () => {
    const scene = buildScene(project(), VIEW);
    const arm = shapeOf(scene, 'arm');
    const key = solidPictureKey(arm);
    expect(key).toContain(armDefinition().hash);
    expect(
      solidPictureKey({ solid: { ...arm.solid!, rect: { ...arm.solid!.rect, x: 900 } } }),
    ).toBe(key);
    const variants = [
      { ...arm.solid!, camera: { azimuth: 31, elevation: 20 } },
      { ...arm.solid!, lighting: 'flat' as const },
      { ...arm.solid!, rect: { ...arm.solid!.rect, width: 640 } },
      { ...arm.solid!, placement: 'drawing' as const },
      { ...arm.solid!, only: 1 },
    ];
    const keys = new Set([key, ...variants.map((solid) => solidPictureKey({ solid }))]);
    expect(keys.size).toBe(variants.length + 1);
    // Hiding parts draws it again without them: another key, the same for the same parts.
    const hidden = withHiddenParts(arm, [3, 1, 3]);
    expect(hidden.solid?.hidden).toEqual([1, 3]);
    expect(solidPictureKey(hidden)).not.toBe(key);
    expect(solidPictureKey(withHiddenParts(arm, [1, 3]))).toBe(solidPictureKey(hidden));
    expect(withHiddenParts(arm, [])).toBe(arm);
    expect(solidPictureKey(shapeOf(scene, 'motor'))).not.toBe(key);
  });

  it('asks the client for the picture with its part buffer for a drawing with parts', () => {
    const scene = buildScene(project(), VIEW);
    const arm = shapeOf(scene, 'arm');
    expect(solidAskFor(arm, 700, 12)).toEqual({
      key: solidPictureKey(arm),
      solid: armDefinition().hash,
      pixels: 700,
      aspect: 1,
      distance: 12,
      camera: { azimuth: 30, elevation: 20 },
      lighting: 'studio',
      hidden: [],
      parts: true,
    });
    expect(solidAskFor(shapeOf(scene, 'loose'), 100, 0)).toMatchObject({ parts: false, only: 4 });
    expect(solidAskFor(shapeOf(scene, 'arm/base'), 100, 0)).toBeUndefined();
  });

  it('has one serial in the image store for each key and bucket, never an image’s', () => {
    const scene = buildScene(project(), VIEW);
    const key = solidPictureKey(shapeOf(scene, 'arm')) as string;
    const serial = solidPictureSerial(`${key}@256`);
    expect(solidPictureSerial(`${key}@256`)).toBe(serial);
    expect(solidPictureSerial(`${key}@512`)).not.toBe(serial);
    const image = shapeOf(scene, 'unknown').image?.image;
    if (!image) throw new Error('The badge is drawn.');
    expect(imageSerial(image)).not.toBe(serial);
    expect(solidPictureSerial(`${key}@1024`)).not.toBe(imageSerial(image));
  });
});
