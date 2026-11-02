/**
 * The built-in "Physical AI and robotics" package (ADR 0079, Track P1): what it defines, how its
 * shapes read in both themes, and its icons and drawings with parts.
 */
import type { Appearance, Color, ImageDefinition, SvgImage } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import { readGeometry } from '../geometry';
import { PART_CAPS, SVG_CAPS, cleanedImage, partsLeftOut, partsOf } from '../images';
import { shippingProblems } from '../licenses';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';
import { PHYSICAL_AI } from './physical-ai';
import {
  MOBILE_ROBOT,
  MOBILE_ROBOT_PARTS,
  SIX_AXIS_ARM,
  SIX_AXIS_ARM_PARTS,
} from './physical-ai-images';

const definitions = definitionsOf(BUILTIN_PACKAGES);
const id = (name: string) => `physical-ai.${name}`;

function svgOf(image: ImageDefinition | undefined): SvgImage {
  if (image?.kind !== 'svg') throw new Error('The package’s pictures are SVG.');
  return image;
}

function colorsIn(svg: string): Color[] {
  return [...new Set(svg.match(/#[0-9A-F]{6}/g) ?? [])];
}

describe('the built-in Physical AI and robotics package', () => {
  it('is a valid package file, built in, with its reserved id', () => {
    expect(validateFile('package', PHYSICAL_AI)).toEqual({ ok: true, value: PHYSICAL_AI });
    expect(builtinPackage('physical-ai')).toBe(PHYSICAL_AI);
    expect(BUILTIN_PACKAGES).toContain(PHYSICAL_AI);
    expect(RESERVED_PACKAGE_IDS.has('physical-ai')).toBe(true);
    expect(PHYSICAL_AI.name).toBe('Physical AI and robotics');
  });

  it('defines what the spec lists', () => {
    expect(PHYSICAL_AI.components.map((each) => each.name)).toEqual([
      'Robot',
      'Link',
      'Joint',
      'Sensor',
      'Camera',
      'Depth camera',
      'LiDAR',
      'IMU',
      'Force-torque sensor',
      'Encoder',
      'Actuator',
      'Motor',
      'Servo',
      'Gripper',
      'Controller',
      'Policy',
      'Compute unit',
      'Node',
      'Topic',
    ]);
    expect(PHYSICAL_AI.relationTypes.map((each) => each.name)).toEqual([
      'is attached to',
      'is part of',
      'drives',
      'senses',
      'commands',
      'publishes to',
      'subscribes to',
      'runs on',
    ]);
    const own = definitionsOf([PHYSICAL_AI]);
    expect(own.problems).toEqual([]);
    // The kinematic chain does not nest; a robot holds its parts, a compute unit its nodes.
    expect([...own.nestingRelationTypes].sort()).toEqual([id('is-part-of'), id('runs-on')]);
  });

  it('derives the kinds of sensor, actuator and controller from theirs, all up to Essence', () => {
    const own = definitionsOf([PHYSICAL_AI]);
    for (const { id: each } of PHYSICAL_AI.components) {
      expect(own.component(each)?.lineage.at(-1)).toBe('essence');
    }
    for (const { id: each } of PHYSICAL_AI.relationTypes) {
      expect(own.relationType(each)?.lineage.at(-1)).toBe('relates-to');
    }
    const kinds = {
      sensor: ['camera', 'depth-camera', 'lidar', 'imu', 'force-torque-sensor', 'encoder'],
      actuator: ['motor', 'servo', 'gripper'],
      controller: ['policy'],
    };
    for (const [parent, children] of Object.entries(kinds)) {
      for (const child of children) {
        expect(own.componentDerives(id(child), id(parent)), child).toBe(true);
      }
    }
  });

  it('gives each component and relation type the attributes the spec names', () => {
    const attributes = (componentId: string) =>
      definitions.component(id(componentId))?.attributes.map((each) => each.name);
    expect(attributes('robot')).toEqual(['model', 'degreesOfFreedom']);
    expect(attributes('link')).toEqual(['mass', 'length']);
    expect(attributes('joint')).toEqual(['kind', 'lowerLimit', 'upperLimit', 'axis', 'position']);
    expect(attributes('camera')).toEqual(['rate', 'frame']);
    expect(attributes('motor')).toEqual(['torque']);
    expect(attributes('controller')).toEqual(['kind', 'rate']);
    expect(attributes('policy')).toEqual(['kind', 'rate', 'model']);
    expect(attributes('topic')).toEqual(['messageType', 'rate']);
    const joint = PHYSICAL_AI.components.find((each) => each.id === id('joint'));
    expect(joint?.attributes?.find((each) => each.name === 'kind')?.choices).toEqual([
      'revolute',
      'prismatic',
      'fixed',
      'continuous',
    ]);
    const controller = PHYSICAL_AI.components.find((each) => each.id === id('controller'));
    expect(controller?.attributes?.find((each) => each.name === 'kind')?.choices).toEqual([
      'PID',
      'MPC',
      'policy',
    ]);
    const units = Object.fromEntries(
      PHYSICAL_AI.components.flatMap((component) =>
        (component.attributes ?? [])
          .filter((each) => each.unit !== undefined)
          .map((each) => [`${component.id} ${each.name}`, each.unit]),
      ),
    );
    expect(units).toMatchObject({
      'physical-ai.link mass': 'kg',
      'physical-ai.link length': 'm',
      'physical-ai.sensor rate': 'Hz',
      'physical-ai.motor torque': 'N·m',
      'physical-ai.controller rate': 'Hz',
      'physical-ai.topic rate': 'Hz',
    });
    const relationAttributes = (relationTypeId: string) =>
      definitions.relationType(id(relationTypeId))?.attributes.map((each) => each.name);
    expect(relationAttributes('is-attached-to')).toEqual(['origin']);
    expect(relationAttributes('senses')).toEqual(['quantity']);
  });

  it('limits the ends of its relation types as robots are built, which only warns', () => {
    const limits = Object.fromEntries(
      PHYSICAL_AI.relationTypes.map((each) => [each.id.slice('physical-ai.'.length), each.limits]),
    );
    expect(limits).toEqual({
      'is-attached-to': { to: [id('link'), id('joint')] },
      'is-part-of': { to: [id('robot')] },
      drives: { from: [id('actuator')], to: [id('joint')] },
      senses: { from: [id('sensor')] },
      commands: { from: [id('controller')], to: [id('controller'), id('actuator')] },
      'publishes-to': { from: [id('node')], to: [id('topic')] },
      'subscribes-to': { from: [id('node')], to: [id('topic')] },
      'runs-on': { from: [id('node')], to: [id('compute-unit')] },
    });
  });

  it('never names ROS, a mark, as a component or a relation type', () => {
    const named = [
      PHYSICAL_AI.name,
      PHYSICAL_AI.description ?? '',
      ...[...PHYSICAL_AI.components, ...PHYSICAL_AI.relationTypes].flatMap((each) => [
        each.id,
        each.name,
        each.description ?? '',
      ]),
    ];
    for (const text of named) expect(text, text).not.toMatch(/\bROS\b/i);
  });

  it('ships under CC0 with its pictures, at most 128 of them (ADR 0079)', () => {
    expect(shippingProblems(PHYSICAL_AI)).toEqual([]);
    expect(PHYSICAL_AI.license).toBe('CC0-1.0');
    expect((PHYSICAL_AI.images ?? []).length).toBeLessThanOrEqual(128);
    for (const image of PHYSICAL_AI.images ?? []) {
      expect(image.id.startsWith('physical-ai.'), image.id).toBe(true);
      expect(image.source).toBe('Drawn for Visual Anything');
    }
  });
});

describe('how its shapes look', () => {
  it('draws a link as a rounded bar of free geometry, and a joint as an ellipse', () => {
    const link = definitions.component(id('link'))?.appearance;
    const geometry = link?.geometry;
    if (typeof geometry !== 'object') throw new Error('A link has free geometry.');
    expect(readGeometry(geometry).ok).toBe(true);
    expect([geometry.width, geometry.height]).toEqual([link?.width, link?.height]);
    const { label } = geometry;
    expect(label).toBeDefined();
    if (label) {
      expect(label.x + label.width).toBeLessThanOrEqual(geometry.width);
      expect(label.y + label.height).toBeLessThanOrEqual(geometry.height);
    }
    expect(definitions.component(id('joint'))?.appearance.shape).toBe('ellipse');
  });

  it('gives every component an icon of its own package, but Link, whose shape is a link', () => {
    const images = new Set((PHYSICAL_AI.images ?? []).map((image) => image.id));
    for (const component of PHYSICAL_AI.components) {
      const image = component.appearance?.image;
      if (component.id === id('link')) {
        expect(image).toBeUndefined();
        continue;
      }
      expect(typeof image === 'object' && images.has(image.image), component.id).toBe(true);
      expect(typeof image === 'object' && image.placement).toBeFalsy();
    }
  });

  it('writes names and strokes that read at 4.5:1 in the light theme, on its fills and the canvas', () => {
    for (const { id: each } of PHYSICAL_AI.components) {
      const { fill = '', stroke = '' } = definitions.component(each)?.appearance ?? {};
      expect(contrastRatio(stroke, fill), each).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
    for (const { id: each } of PHYSICAL_AI.relationTypes) {
      const stroke = definitions.relationType(each)?.appearance.stroke ?? '';
      expect(contrastRatio(stroke, CANVAS_BACKGROUNDS.light), each).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws icons that read at 3:1 or more on their component’s fill, in both themes', () => {
    for (const component of PHYSICAL_AI.components) {
      const shown = component.appearance?.image;
      if (typeof shown !== 'object') continue;
      const image = svgOf(PHYSICAL_AI.images?.find((each) => each.id === shown.image));
      const resolved = definitions.component(component.id);
      for (const color of colorsIn(image.svg)) {
        for (const fill of [resolved?.appearance.fill, resolved?.darkColors.fill]) {
          expect(
            contrastRatio(color, fill ?? ''),
            `${component.id} ${color}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

describe('its drawings with parts (ADR 0067)', () => {
  const drawings = [
    ['six-axis arm', SIX_AXIS_ARM, SIX_AXIS_ARM_PARTS],
    ['mobile robot', MOBILE_ROBOT, MOBILE_ROBOT_PARTS],
  ] as const;

  it.each(drawings)(
    'the %s names exactly its parts, in order, within every cap',
    (_, image, ids) => {
      expect(PHYSICAL_AI.images).toContain(image);
      const cleaned = cleanedImage(image);
      if (!cleaned) throw new Error('The drawing is clean.');
      expect(partsOf(cleaned).map((part) => part.id)).toEqual([...ids]);
      expect(partsLeftOut(cleaned)).toEqual({ contours: 0, segments: false });
      expect(ids.length).toBeLessThanOrEqual(PART_CAPS.parts);
      expect(image.svg.length).toBeLessThanOrEqual(SVG_CAPS.output);
    },
  );

  it.each(drawings)(
    'the %s is drawn in colors that read at 3:1 or more on a robot, in both themes',
    (_, image) => {
      const robot = definitions.component(id('robot'));
      const fills = [robot?.appearance.fill ?? '', robot?.darkColors.fill ?? ''];
      const cleaned = cleanedImage(image);
      const colors = new Set([
        ...colorsIn(image.svg),
        ...(cleaned ? partsOf(cleaned).map((part) => part.color) : []),
      ]);
      for (const color of colors) {
        for (const fill of fills) {
          expect(
            contrastRatio(color, fill),
            `${image.id} ${color} on ${fill}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );

  it('draws the six-axis arm’s links and joints in the colors of links and joints', () => {
    const cleaned = cleanedImage(SIX_AXIS_ARM);
    if (!cleaned) throw new Error('The drawing is clean.');
    const colors = new Map(partsOf(cleaned).map((part) => [part.id, part.color]));
    const linkColor = colors.get('link-1');
    const jointColor = colors.get('joint-1');
    expect(linkColor).not.toBe(jointColor);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(colors.get(`link-${n}`)).toBe(linkColor);
      expect(colors.get(`joint-${n}`)).toBe(jointColor);
    }
  });

  it('is shown by no component itself: a robot shows a drawing from its own appearance', () => {
    const named = PHYSICAL_AI.components.flatMap((each) => {
      const appearance: Appearance | undefined = each.appearance;
      const image = appearance?.image;
      return typeof image === 'object' ? [image.image] : [];
    });
    expect(named).not.toContain(SIX_AXIS_ARM.id);
    expect(named).not.toContain(MOBILE_ROBOT.id);
    expect(PHYSICAL_AI.components.some((each) => each.appearance?.part !== undefined)).toBe(false);
  });
});
