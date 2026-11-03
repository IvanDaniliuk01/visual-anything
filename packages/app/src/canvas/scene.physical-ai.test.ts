/**
 * The physical-ai sample, "Pick-and-place arm" (ADR 0079, Track P1), as the canvas's scene draws it
 * since M9 (ADR 0075): its arm is a drawing with parts that shows the arm's solid, each of its links,
 * joints and its gripper is drawn as the solid's part it names, the relations that drive and sense a
 * joint end at that part's point, and the kinematic chain and the control loop draw each part on its
 * own as the solid's picture of that part alone. Since M10 (ADR 0076) its workcell has a view of its
 * own; since M15 (ADR 0090) its wrist camera is anchored to the solid's camera again, so that it
 * follows link 6 as the joints move.
 */
import {
  builtinPackage,
  checkProject,
  cleanedImage,
  fitOutline,
  fitSolidCamera,
  outlineLabelArea,
  partsOf,
  placeSolidPoint,
} from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { partNameLines } from './outlined';
import { buildScene, type ElementShape, type Scene } from './scene';
import { solidPartIndex, solidPartPoint } from './shape-solids';

const project = loadSample('robot-arm');
const ARM_SOLID = 'robot-arm.six-axis-arm';
const definition = project.packages
  .flatMap((file) => file.solids ?? [])
  .find((solid) => solid.id === ARM_SOLID) as SolidDefinition;

/** The arm's named parts. */
const PARTS = [
  'base',
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`joint-${n}`, `link-${n}`]),
  'gripper',
  'camera',
];
/** The parts an element is anchored to: every one, the wrist camera to the camera's (ADR 0090). */
const ANCHORED = PARTS;

/** The element anchored to a part: of the same name, but the camera's, which is the wrist camera. */
const elementOf = (part: string) => (part === 'camera' ? 'wrist-camera' : part);

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

describe('the physical-ai sample', () => {
  it('opens with nothing to warn about, using the physical-ai package and its own, for its solid', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['physical-ai', 'robot-arm']);
    expect(definition.parts.map((part) => part.name)).toEqual(PARTS);
    expect(project.views.map((view) => view.id).sort()).toEqual([
      'control-loop',
      'kinematic-chain',
      'software',
      'structure',
      'workcell',
    ]);
  });

  it('draws the arm as its solid with its parts, each anchored part at its part’s point', () => {
    const scene = buildScene(project, 'structure');
    const arm = shapeOf(scene, 'arm');
    expect(arm.solid).toMatchObject({ id: ARM_SOLID, placement: 'parts', hash: definition.hash });
    expect(arm.solid?.placeholder).toBeUndefined();
    const picture = arm.picture?.rect;
    if (!picture) throw new Error('The arm draws its picture.');
    const camera = fitSolidCamera(
      definition.bounds,
      definition.camera,
      picture.width / picture.height,
    );
    const points = new Set<string>();
    for (const part of ANCHORED) {
      const shape = shapeOf(scene, `arm/${elementOf(part)}`);
      expect(shape.part, part).toMatchObject({ solid: ARM_SOLID, part, inDrawing: true });
      const index = solidPartIndex(definition, part) as number;
      const at = placeSolidPoint(camera, solidPartPoint(definition, index)!, picture);
      const point = shape.part?.point;
      expect(point?.x, part).toBeCloseTo(at.x, 6);
      expect(point?.y, part).toBeCloseTo(at.y, 6);
      // Every point lies on the picture, and no two parts share one.
      expect(point!.x).toBeGreaterThan(picture.x);
      expect(point!.x).toBeLessThan(picture.x + picture.width);
      expect(point!.y).toBeGreaterThan(picture.y);
      expect(point!.y).toBeLessThan(picture.y + picture.height);
      points.add(`${point?.x} ${point?.y}`);
    }
    expect(points.size).toBe(ANCHORED.length);
    // The motors and the encoders stand around the picture as callouts, clear of it (ADR 0091).
    for (const key of [1, 2, 3, 4, 5, 6].flatMap((n) => [`arm/motor-${n}`, `arm/encoder-${n}`])) {
      const shape = shapeOf(scene, key);
      expect(shape.part, key).toBeUndefined();
      expect(shape.callout, key).toBeDefined();
      const { rect } = shape;
      const clear =
        rect.x + rect.width <= picture.x ||
        rect.x >= picture.x + picture.width ||
        rect.y + rect.height <= picture.y ||
        rect.y >= picture.y + picture.height;
      expect(clear, key).toBe(true);
    }
    // An anchored part has no place of its own in the view.
    const view = project.views.find((each) => each.id === 'structure');
    const anchored = new Set(ANCHORED.map(elementOf));
    expect(view?.positions.filter((each) => anchored.has(each.element))).toEqual([]);
  });

  it('ends "drives" and "senses" at the point of the joint each moves or reads', () => {
    const scene = buildScene(project, 'structure');
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const joint = shapeOf(scene, `arm/joint-${n}`).part?.point;
      for (const relation of [`motor-${n}-drives-joint-${n}`, `encoder-${n}-senses-joint-${n}`]) {
        const line = scene.relations.find((each) => each.relation === relation);
        expect(line?.ends?.to, relation).toEqual({ kind: 'shape', key: `arm/joint-${n}` });
        expect(line?.to, relation).toEqual(joint);
      }
    }
  });

  it('draws the kinematic chain apart from the drawing, each part on its own as the solid’s part alone', () => {
    const scene = buildScene(project, 'kinematic-chain');
    expect(scene.relations.length).toBe(14);
    for (const part of ANCHORED) {
      const shape = shapeOf(scene, elementOf(part));
      expect(shape.part, part).toMatchObject({ solid: ARM_SOLID, part, inDrawing: false });
      expect(shape.solid, part).toMatchObject({
        id: ARM_SOLID,
        only: solidPartIndex(definition, part),
      });
    }
  });

  it('draws the control loop from the camera through the policy, the controller, the motors, the joints and the encoders', () => {
    const scene = buildScene(project, 'control-loop');
    const shown = new Set(scene.shapes.map((shape) => shape.element));
    for (const element of [
      'workpiece',
      'wrist-camera',
      'grasp-policy',
      'joint-controller',
      'gripper',
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`motor-${n}`, `joint-${n}`, `encoder-${n}`]),
    ]) {
      expect(shown.has(element), element).toBe(true);
    }
    expect(shown.has('arm')).toBe(false);
    expect(shown.has('link-2')).toBe(false);
    expect(shapeOf(scene, 'joint-2').solid).toMatchObject({
      only: solidPartIndex(definition, 'joint-2'),
    });
  });

  it('plays "Pick a part": the camera sees the part, the policy decides, the arm moves and reads back, and the gripper closes', () => {
    const [scenario] = project.scenarios;
    const relations = new Map(project.model.relations.map((each) => [each.id, each]));
    const played = (scenario?.steps ?? []).map((step) =>
      step.relations.map((id) => {
        const relation = relations.get(id);
        return `${relation?.from} ${relation?.relationType.slice('physical-ai.'.length)} ${relation?.to}`;
      }),
    );
    const each = (make: (n: number) => string, joints: number[]) => joints.map(make);
    expect(played).toEqual([
      ['wrist-camera senses workpiece'],
      ['grasp-policy commands joint-controller'],
      each((n) => `joint-controller commands motor-${n}`, [1, 2, 3]),
      each((n) => `motor-${n} drives joint-${n}`, [1, 2, 3]),
      each((n) => `encoder-${n} senses joint-${n}`, [1, 2, 3]),
      [
        ...each((n) => `joint-controller commands motor-${n}`, [4, 5, 6]),
        ...each((n) => `motor-${n} drives joint-${n}`, [4, 5, 6]),
      ],
      ['grasp-policy commands gripper'],
    ]);
    expect(scenario?.name).toBe('Pick a part');
    expect(scenario?.view).toBe('control-loop');
  });

  it('draws the workcell with what is in it, nested, no two shapes overlapping', () => {
    const scene = buildScene(project, 'workcell');
    expect(scene.shapes.map((shape) => shape.key).sort()).toEqual(
      [
        'workcell',
        'workcell/arm',
        'workcell/table',
        'workcell/bin-a',
        'workcell/bin-a/workpiece',
        'workcell/bin-b',
        'workcell/workcell-camera',
        // Since M15 (ADR 0090) the arm's chain is drawn on its picture, so that its joints move it.
        ...ANCHORED.map((part) => `workcell/arm/${elementOf(part)}`),
      ].sort(),
    );
    expect(shapeOf(scene, 'workcell/arm').solid).toMatchObject({ id: ARM_SOLID });
    for (const part of ANCHORED) {
      expect(shapeOf(scene, `workcell/arm/${elementOf(part)}`).part, part).toMatchObject({
        solid: ARM_SOLID,
        part,
        inDrawing: true,
      });
    }
    // The table, the bins and the workpiece show solids of their own, beside their names.
    expect(shapeOf(scene, 'workcell/table').solid).toMatchObject({ id: 'robot-arm.work-table' });
    expect(shapeOf(scene, 'workcell/bin-a').solid).toMatchObject({ id: 'robot-arm.parts-bin' });
    expect(shapeOf(scene, 'workcell/bin-a/workpiece').solid).toMatchObject({
      id: 'robot-arm.machined-block',
    });
    const inside = (key: string) => {
      const rect = shapeOf(scene, key).rect;
      const holder = shapeOf(scene, key.slice(0, key.lastIndexOf('/'))).rect;
      return (
        rect.x >= holder.x &&
        rect.y >= holder.y &&
        rect.x + rect.width <= holder.x + holder.width &&
        rect.y + rect.height <= holder.y + holder.height
      );
    };
    const siblings = scene.shapes.filter((shape) => shape.key.split('/').length === 2);
    for (const shape of [...siblings, shapeOf(scene, 'workcell/bin-a/workpiece')]) {
      expect(inside(shape.key), shape.key).toBe(true);
    }
    for (const a of siblings) {
      for (const b of siblings) {
        if (a === b) continue;
        const apart =
          a.rect.x + a.rect.width <= b.rect.x ||
          b.rect.x + b.rect.width <= a.rect.x ||
          a.rect.y + a.rect.height <= b.rect.y ||
          b.rect.y + b.rect.height <= a.rect.y;
        expect(apart, `${a.key} and ${b.key}`).toBe(true);
      }
    }
  });
});

describe('the mobile robot drawn with parts', () => {
  it('leaves room in each part for its name, whole, as an element drawn as it would be named', () => {
    const image = builtinPackage('physical-ai')?.images?.find(
      (each) => each.id === 'physical-ai.mobile-robot',
    );
    const cleaned = image && cleanedImage(image);
    if (!cleaned) throw new Error('The mobile robot’s picture is clean.');
    const names: Record<string, string> = {
      chassis: 'Chassis',
      'wheel-left': 'Left wheel',
      'wheel-right': 'Right wheel',
      lidar: 'LiDAR',
      camera: 'Camera',
      imu: 'IMU',
    };
    const parts = partsOf(cleaned);
    expect(parts.map((part) => part.id)).toEqual(Object.keys(names));
    for (const part of parts) {
      const area = outlineLabelArea(fitOutline(part.outline, cleaned.width, cleaned.height));
      expect(partNameLines(names[part.id] ?? '', area), part.id).toBeDefined();
    }
  });
});
