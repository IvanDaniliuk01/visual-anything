/**
 * The built-in "Processes and state machines" package (P1, ADR 0079): pools, lanes, events, tasks,
 * gateways and data in the style of BPMN, and the states of state machines, each drawn with free
 * geometry of its own (ADR 0066).
 */
import type { Component, FreeGeometry } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import {
  GEOMETRY_CAPS,
  fitOutline,
  outlineLabelArea,
  outlinePlace,
  readGeometry,
  type Outline,
} from '../geometry';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';
import { PROCESS, TRIGGER_ICONS } from './process';

const SYMBOLS = [
  'process.start-event',
  'process.end-event',
  'process.intermediate-event',
  'process.exclusive-gateway',
  'process.parallel-gateway',
  'process.inclusive-gateway',
  'process.data-object',
  'process.data-store',
  'process.initial-state',
  'process.final-state',
  'process.choice',
];
/** Boxes and containers, which the kinds draw with corners that keep their size as they stretch. */
const KINDS: Readonly<Record<string, string>> = {
  'process.pool': 'rectangle',
  'process.lane': 'rectangle',
  'process.task': 'rounded-rectangle',
  'process.subprocess': 'rounded-rectangle',
  'process.state': 'rounded-rectangle',
};
const EVENTS = ['process.start-event', 'process.end-event', 'process.intermediate-event'];

function component(id: string): Component {
  const found = PROCESS.components.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No component ${id}`);
  return found;
}

function geometryOf(id: string): FreeGeometry {
  const geometry = component(id).appearance?.geometry;
  if (typeof geometry !== 'object') throw new Error(`${id} has no free geometry`);
  return geometry;
}

function outlineOf(id: string): Outline {
  const read = readGeometry(geometryOf(id));
  if (!read.ok) throw new Error(`${id}: ${read.message}`);
  return read.outline;
}

describe('the Processes and state machines package', () => {
  it('is a valid package file, built in, with a reserved id', () => {
    expect(validateFile('package', PROCESS)).toEqual({ ok: true, value: PROCESS });
    expect(builtinPackage('process')).toBe(PROCESS);
    expect(BUILTIN_PACKAGES).toContain(PROCESS);
    expect(RESERVED_PACKAGE_IDS.has('process')).toBe(true);
  });

  it('is named for what it describes, and only says it is in the style of BPMN', () => {
    expect(PROCESS.name).toBe('Processes and state machines');
    expect(PROCESS.description).toContain('in the style of BPMN');
    const names = [
      PROCESS.name,
      ...PROCESS.components.map((each) => each.name),
      ...PROCESS.relationTypes.map((each) => each.name),
      ...(PROCESS.images ?? []).map((each) => each.name),
    ];
    for (const name of names) expect(name).not.toMatch(/BPMN|UML|OMG/);
  });

  it('defines what the spec lists, nesting by "is part of"', () => {
    expect(PROCESS.components.map((each) => each.name)).toEqual([
      'Pool',
      'Lane',
      'Start event',
      'End event',
      'Intermediate event',
      'Task',
      'Subprocess',
      'Exclusive gateway',
      'Parallel gateway',
      'Inclusive gateway',
      'Data object',
      'Data store',
      'State',
      'Initial state',
      'Final state',
      'Choice',
    ]);
    expect(PROCESS.relationTypes.map((each) => each.name)).toEqual([
      'sequence flow',
      'message flow',
      'association',
      'transition',
      'is part of',
    ]);
    const definitions = definitionsOf([PROCESS]);
    expect(definitions.problems).toEqual([]);
    expect([...definitions.nestingRelationTypes]).toEqual(['process.is-part-of']);
    for (const each of [...PROCESS.components, ...PROCESS.relationTypes]) {
      expect(each.id.startsWith('process.'), each.id).toBe(true);
    }
  });

  it('derives everything up to Essence and "relates to", and needs no other package', () => {
    const definitions = definitionsOf([PROCESS]);
    for (const { id } of PROCESS.components) {
      expect(definitions.component(id)?.lineage.at(-1)).toBe('essence');
    }
    for (const { id } of PROCESS.relationTypes) {
      expect(definitions.relationType(id)?.lineage.at(-1)).toBe('relates-to');
    }
  });

  it('draws sequence flows solid, message flows dashed and associations dotted', () => {
    const definitions = definitionsOf([PROCESS]);
    const drawn = (id: string) => {
      const type = definitions.relationType(id);
      return [type?.direction, type?.appearance.dash];
    };
    expect(drawn('process.sequence-flow')).toEqual(['directed', 'solid']);
    expect(drawn('process.message-flow')).toEqual(['directed', 'dashed']);
    expect(drawn('process.association')).toEqual(['undirected', 'dotted']);
    expect(drawn('process.transition')).toEqual(['directed', 'solid']);
  });

  it('gives transitions a trigger, a guard and an effect as text, never code', () => {
    const transition = PROCESS.relationTypes.find((each) => each.id === 'process.transition');
    expect(transition?.attributes?.map(({ name, type }) => [name, type])).toEqual([
      ['trigger', 'string'],
      ['guard', 'string'],
      ['effect', 'string'],
    ]);
    expect(PROCESS.code).toBeUndefined();
  });

  it('gives events a trigger and tasks a kind, as choices without defaults', () => {
    for (const id of EVENTS) {
      const trigger = component(id).attributes?.find((each) => each.name === 'trigger');
      expect(trigger?.choices, id).toEqual(['none', 'message', 'timer', 'signal']);
      expect(trigger?.default, id).toBeUndefined();
      expect(component(id).appearance?.detail?.attributes, id).toEqual(['trigger']);
    }
    const kind = component('process.task').attributes?.find((each) => each.name === 'kind');
    expect(kind?.choices).toEqual(['user', 'service', 'manual']);
    expect(kind?.default).toBeUndefined();
  });

  it('names in its limits only definitions it has', () => {
    const ids = new Set(PROCESS.components.map((each) => each.id));
    for (const type of PROCESS.relationTypes) {
      for (const end of [type.limits?.from, type.limits?.to]) {
        if (!Array.isArray(end)) continue;
        for (const id of end) expect(ids.has(id), `${type.id} ${id}`).toBe(true);
      }
    }
  });
});

describe('its free geometry', () => {
  it('draws each symbol by an outline of its own, and each box and container by its kind', () => {
    expect(PROCESS.components.map((each) => each.id).sort()).toEqual(
      [...SYMBOLS, ...Object.keys(KINDS)].sort(),
    );
    for (const [id, kind] of Object.entries(KINDS)) {
      const appearance = component(id).appearance;
      expect([appearance?.shape, appearance?.geometry], id).toEqual([kind, undefined]);
      expect((appearance?.width ?? 0) % 8, id).toBe(0);
      expect((appearance?.height ?? 0) % 8, id).toBe(0);
    }
  });

  it.each(SYMBOLS.map((id) => [id] as const))(
    '%s is drawn by an outline of its own, within the caps, in a box of its default size',
    (id) => {
      const appearance = component(id).appearance;
      const geometry = geometryOf(id);
      const outline = outlineOf(id);
      expect(geometry.outline.length).toBeLessThanOrEqual(GEOMETRY_CAPS.contours);
      expect([geometry.width, geometry.height]).toEqual([appearance?.width, appearance?.height]);
      expect((appearance?.width ?? 0) % 8, id).toBe(0);
      expect((appearance?.height ?? 0) % 8, id).toBe(0);
      expect(appearance?.shape, id).toBeUndefined();
      expect(outline.bounds.width).toBeGreaterThan(0);
    },
  );

  it('keeps the proportions of its symbols', () => {
    for (const id of SYMBOLS) expect(outlineOf(id).keepProportions, id).toBe(true);
  });

  it('writes each symbol’s name under it or over it, clear of the symbol', () => {
    for (const id of SYMBOLS) {
      const geometry = geometryOf(id);
      const outline = outlineOf(id);
      const label = geometry.label;
      if (label === undefined) throw new Error(`${id} has no label area`);
      // Room for a line of name and a line of detail.
      expect(label.height, id).toBeGreaterThanOrEqual(48);
      expect(label.width, id).toBeGreaterThanOrEqual(128);
      const fitted = fitOutline(outline, geometry.width, geometry.height);
      expect(outlineLabelArea(fitted), id).toEqual(label);
      const { y, height } = outline.bounds;
      const clear = label.y >= y + height || label.y + label.height <= y;
      expect(clear, `${id}: its name is clear of its symbol`).toBe(true);
    }
  });

  it('attaches relations on each symbol’s middle line and on the side its name leaves free', () => {
    for (const id of SYMBOLS) {
      const geometry = geometryOf(id);
      const points = component(id).appearance?.connectionPoints ?? [];
      const outline = outlineOf(id);
      const fitted = fitOutline(outline, geometry.width, geometry.height);
      const middle = outline.bounds.y + outline.bounds.height / 2;
      const nameBelow = (geometry.label?.y ?? 0) > middle;
      expect(points.map((each) => each.side).sort(), id).toEqual(
        nameBelow ? ['left', 'right', 'top'] : ['bottom', 'left', 'right'],
      );
      for (const { side, at } of points) {
        const { point } = outlinePlace(fitted, side, at);
        if (side === 'left' || side === 'right') {
          expect(at * geometry.height, `${id} ${side}`).toBeCloseTo(middle, 6);
          expect(point.y, `${id} ${side}`).toBeCloseTo(middle, 6);
        } else {
          expect(at, `${id} ${side}`).toBe(0.5);
          expect(point.x, `${id} ${side}`).toBeCloseTo(geometry.width / 2, 6);
        }
      }
    }
  });

  it('cuts each gateway’s mark out of its diamond', () => {
    for (const id of [
      'process.exclusive-gateway',
      'process.parallel-gateway',
      'process.inclusive-gateway',
    ]) {
      const roles = outlineOf(id).contours.map((each) => each.role);
      expect(roles[0], id).toBe('fill');
      expect(roles.slice(1), id).toContain('hole');
    }
  });

  it('draws thick rings and dots with circles at most 1 apart, which the stroke covers', () => {
    for (const id of ['process.end-event', 'process.initial-state', 'process.final-state']) {
      const radii = geometryOf(id).outline.flatMap((each) =>
        each.kind === 'ellipse' ? [each.rx] : [],
      );
      const solid = id === 'process.final-state' ? radii.slice(1) : radii;
      for (let at = 1; at < solid.length; at += 1) {
        expect((solid[at - 1] ?? 0) - (solid[at] ?? 0), id).toBeLessThanOrEqual(1);
      }
      // An odd number of contours leaves the middle filled.
      expect(radii.length % 2 === 1 || id === 'process.final-state', id).toBe(true);
    }
  });
});

describe('its colors and its trigger icons', () => {
  const definitions = definitionsOf(BUILTIN_PACKAGES);

  it('draw each stroke at 4.5:1 or more on its fill and on the light canvas', () => {
    for (const { id } of PROCESS.components) {
      const { fill, stroke } = definitions.component(id)?.appearance ?? {};
      expect(contrastRatio(stroke ?? '', fill ?? ''), id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(stroke ?? '', CANVAS_BACKGROUNDS.light), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ship an icon for each trigger but none, drawn for Visual Anything', () => {
    expect(Object.keys(TRIGGER_ICONS)).toEqual(['message', 'timer', 'signal']);
    for (const icon of Object.values(TRIGGER_ICONS)) {
      expect(PROCESS.images).toContain(icon);
      expect(icon.id.startsWith('process.')).toBe(true);
      expect([icon.source, icon.license]).toEqual(['Drawn for Visual Anything', 'CC0-1.0']);
    }
  });

  it('read at 3:1 or more on every event’s fill and on the canvas, in both themes', () => {
    for (const icon of Object.values(TRIGGER_ICONS)) {
      const colors = [...new Set(icon.svg.match(/#[0-9A-F]{6}/g) ?? [])];
      expect(colors.length).toBeGreaterThan(0);
      const backgrounds = [
        CANVAS_BACKGROUNDS.light,
        CANVAS_BACKGROUNDS.dark,
        ...EVENTS.flatMap((id) => {
          const resolved = definitions.component(id);
          return [resolved?.appearance.fill ?? '', resolved?.darkColors.fill ?? ''];
        }),
      ];
      for (const color of colors) {
        for (const background of backgrounds) {
          expect(
            contrastRatio(color, background),
            `${icon.id} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
