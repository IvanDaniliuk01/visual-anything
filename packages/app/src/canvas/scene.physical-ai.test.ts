/**
 * The physical-ai sample, "Pick-and-place arm" (ADR 0079, Track P1), as the canvas's scene draws it:
 * its arm is a drawing with parts, each of its links, joints and its gripper is drawn as the part it
 * names, the relations that drive and sense a joint attach to that part's outline, and every shape
 * with an outline of its own writes its name whole inside itself (ADR 0066).
 */
import {
  anchoredElements,
  builtinPackage,
  checkProject,
  cleanedImage,
  fitOutline,
  namedPart,
  outlineLabelArea,
  partsOf,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { labelAreaOn, nameLinesInside, partNameLines, writesNameInside } from './outlined';
import { shapeHolds } from './outlines';
import { buildScene, type ElementShape, type Scene } from './scene';

const project = loadSample('robot-arm');
const ARM_IMAGE = 'physical-ai.six-axis-arm';

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

describe('the physical-ai sample', () => {
  it('opens with nothing to warn about, using only the physical-ai package', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['physical-ai']);
    expect(project.views.map((view) => view.id).sort()).toEqual([
      'arm',
      'kinematic-chain',
      'software',
    ]);
  });

  it('names only parts its arm’s picture has, every one of them once', () => {
    const image = builtinPackage('physical-ai')?.images?.find((each) => each.id === ARM_IMAGE);
    const cleaned = image && cleanedImage(image);
    if (!cleaned) throw new Error('The arm’s picture is clean.');
    const anchored = anchoredElements(project);
    for (const { element, part, images } of anchored) {
      expect(images, element.id).toEqual([ARM_IMAGE]);
      expect(namedPart(cleaned, part.part), `${element.id} ${part.part}`).toBeDefined();
    }
    expect(anchored.map((each) => each.part.part).sort()).toEqual(
      ['base', 'gripper', ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`joint-${n}`, `link-${n}`])].sort(),
    );
  });

  it('draws the arm with its parts, each anchored part in its part’s place', () => {
    const scene = buildScene(project, 'arm');
    const arm = shapeOf(scene, 'arm');
    expect(arm.image).toMatchObject({ placement: 'parts' });
    expect(arm.picture?.scale).toBe(1);
    for (const each of anchoredElements(project)) {
      const shape = shapeOf(scene, `arm/${each.element.id}`);
      expect(shape.part, each.element.id).toMatchObject({
        image: ARM_IMAGE,
        part: each.part.part,
        inDrawing: true,
      });
      expect(shape.outline, each.element.id).toBeDefined();
    }
    // The motor, the encoder and the camera sit below the picture, clear of it.
    const picture = arm.picture?.rect;
    if (!picture) throw new Error('The arm draws its picture.');
    for (const key of ['arm/shoulder-motor', 'arm/shoulder-encoder', 'arm/wrist-camera']) {
      const shape = shapeOf(scene, key);
      expect(shape.part, key).toBeUndefined();
      expect(shape.rect.y, key).toBeGreaterThanOrEqual(picture.y + picture.height);
    }
  });

  it('attaches "drives" and "senses" to the outline of joint 2 itself', () => {
    const scene = buildScene(project, 'arm');
    const joint = shapeOf(scene, 'arm/joint-2');
    for (const relation of ['motor-drives-joint-2', 'encoder-senses-joint-2']) {
      const line = scene.relations.find((each) => each.relation === relation);
      expect(line?.ends?.to, relation).toEqual({ kind: 'shape', key: 'arm/joint-2' });
      expect(line && shapeHolds(joint, line.to, 1.5), relation).toBe(true);
    }
  });

  it('writes the name of every part of the arm whole inside it, and stores no place for one', () => {
    const scene = buildScene(project, 'arm');
    const parts = scene.shapes.filter((shape) => shape.part?.inDrawing === true);
    expect(parts.length).toBe(14);
    for (const shape of parts) {
      const outline = shape.outline!;
      const lines = partNameLines(shape.name, labelAreaOn({ rect: shape.rect, outline }));
      expect(lines, shape.element).toBeDefined();
    }
    const anchored = new Set(parts.map((shape) => shape.element));
    const view = project.views.find((each) => each.id === 'arm');
    expect(view?.positions.filter((each) => anchored.has(each.element))).toEqual([]);
  });

  it('draws the kinematic chain apart from the drawing, each name whole inside its shape', () => {
    const scene = buildScene(project, 'kinematic-chain');
    const link = shapeOf(scene, 'link-2');
    expect(link.part).toBeUndefined();
    expect(link.outline).toBeDefined();
    expect(shapeOf(scene, 'joint-2').kind).toBe('ellipse');
    expect(scene.relations.length).toBe(14);
    const outlined = scene.shapes.filter((shape) => shape.outline);
    expect(outlined.map((shape) => shape.element).sort()).toEqual(
      ['base', ...[1, 2, 3, 4, 5, 6].map((n) => `link-${n}`)].sort(),
    );
    for (const shape of outlined) {
      expect(nameLinesInside({ ...shape, outline: shape.outline! }), shape.element).toBeDefined();
      expect(writesNameInside(shape), shape.element).toBe(true);
    }
  });

  it('plays a command from the policy through the controller and the motor to joint 2, and back', () => {
    const [scenario] = project.scenarios;
    const relations = new Map(project.model.relations.map((each) => [each.id, each]));
    const played = (scenario?.steps ?? []).flatMap((step) =>
      step.relations.map((id) => {
        const relation = relations.get(id);
        return `${relation?.from} ${relation?.relationType.slice('physical-ai.'.length)} ${relation?.to}`;
      }),
    );
    expect(played).toEqual([
      'wrist-camera senses workpiece',
      'grasp-policy commands joint-controller',
      'joint-controller commands shoulder-motor',
      'shoulder-motor drives joint-2',
      'shoulder-encoder senses joint-2',
      'grasp-policy commands gripper',
    ]);
    expect(scenario?.view).toBe('arm');
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
