/**
 * Overlays read through the attribute lookup (ADR 0055, ADR 0057): on the canvas, a live or computed
 * value colors, sizes, marks and fades shapes and lines as a stored one would, without the view's own
 * scene changing; a live update changes only the shapes and lines whose overlay value changed; and the
 * canvas's scene equals the view's built from nothing with those values stored.
 */
import {
  definitionsIn,
  type Definitions,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, JsonValue, Overlay, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from '../canvas/scene';
import type { ElementAnswers } from '../code/messages';
import { t } from '../i18n';
import { loadSample } from '../test/sample';
import type { LiveView } from './book';
import { liveSceneOf } from './details';
import { AttributeLookup, type Attributed } from './lookup';

const VIEW = 'system-overview';
const API = 'clinic-booking/scheduling/appointments-api';
const DB = 'clinic-booking/scheduling/appointments-db';

/** Colors elements by their load, from green to red. */
const LOAD_FILL: Overlay = {
  id: 'load-fill',
  of: 'elements',
  attribute: 'load',
  channel: 'fill',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, color: '#00FF00' },
      { at: 100, color: '#FF0000' },
    ],
  },
};

/** Sizes elements by their load, from half to twice. */
const LOAD_SIZE: Overlay = {
  id: 'load-size',
  of: 'elements',
  attribute: 'load',
  channel: 'size',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, size: 0.5 },
      { at: 100, size: 2 },
    ],
  },
};

/** Strokes relations by their latency. */
const SLOW_LINES: Overlay = {
  id: 'slow',
  of: 'relations',
  attribute: 'latency',
  channel: 'stroke',
  mapping: { kind: 'discrete', cases: [{ value: 'slow', color: '#B42318' }] },
};

function withOverlays(overlays: Overlay[], project = loadSample()): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view): ViewFile => (view.id === VIEW ? { ...view, overlays } : view)),
  };
}

/** Live values as the program sends them, at one moment. */
type Values = Record<Id, Record<string, JsonValue>>;

/**
 * The lookups of successive moments, as the live values book makes them: a target whose values did
 * not change keeps the same map, so that what reads it can tell.
 */
function moments() {
  let maps = new Map<Id, ReadonlyMap<string, LiveValue>>();
  let version = 0;
  let last: LiveView | undefined;
  return (
    values: Values,
    computed: ReadonlyMap<Id, ElementAnswers> = new Map(),
    /** Whether the view can say which targets changed since the one before, as the book's can. */
    telling = true,
  ) => {
    const was = maps;
    const next = new Map<Id, ReadonlyMap<string, LiveValue>>();
    for (const [target, byName] of Object.entries(values)) {
      const before = maps.get(target);
      const same =
        before !== undefined &&
        before.size === Object.keys(byName).length &&
        Object.entries(byName).every(
          ([name, value]) => JSON.stringify(before.get(name)?.value) === JSON.stringify(value),
        );
      next.set(
        target,
        same
          ? before
          : new Map(
              Object.entries(byName).map(([attribute, value]): [string, LiveValue] => [
                attribute,
                {
                  target,
                  attribute,
                  value,
                  sender: { kind: 'claude' },
                  arrivedAt: 1_000,
                  freshFor: 60_000,
                },
              ]),
            ),
      );
    }
    maps = next;
    version += 1;
    const changed = new Set<Id>();
    for (const [target, map] of next) if (was.get(target) !== map) changed.add(target);
    for (const target of was.keys()) if (!next.has(target)) changed.add(target);
    const before = last;
    const view: LiveView = {
      version,
      now: 2_000,
      of: (target) => next.get(target),
      targets: new Set(next.keys()),
      size: next.size,
      ...(telling
        ? { changedSince: (asked: LiveView) => (asked === before ? changed : undefined) }
        : {}),
    };
    last = view;
    return new AttributeLookup(view, computed);
  };
}

function canvasOf(project: ProjectSnapshot, lookup: AttributeLookup): Scene {
  return liveSceneOf(buildScene(project, VIEW), project, definitionsIn(project), lookup, t);
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`No shape ${key}.`);
  return shape;
}

/** The indexes of the shapes that are other objects in `b` than in `a`. */
function changedShapes(a: Scene, b: Scene): string[] {
  return b.shapes.filter((shape, at) => shape !== a.shapes[at]).map((shape) => shape.key);
}

describe('overlays on the canvas', () => {
  it('read a live value over the stored one, and leave the view’s own scene as it is', () => {
    const project = withOverlays([LOAD_FILL]);
    const scene = buildScene(project, VIEW);
    const lookup = moments()({ 'appointments-api': { load: 100 } });
    const drawn = liveSceneOf(scene, project, definitionsIn(project), lookup, t);
    expect(shapeOf(drawn, API).fill).toBe('#FF0000');
    expect(shapeOf(scene, API).fill).not.toBe('#FF0000');
    expect(buildScene(project, VIEW)).toBe(scene);
    expect(changedShapes(scene, drawn)).toEqual([API]);
  });

  it('read a value package code computed, under a live one', () => {
    const project = withOverlays([LOAD_FILL]);
    const computed: ReadonlyMap<Id, ElementAnswers> = new Map([
      [
        'appointments-db',
        {
          element: 'appointments-db',
          attributes: [{ name: 'load', value: 0, package: 'clinic' }],
          problems: [],
        },
      ],
    ]);
    const lookup = moments()({ 'appointments-api': { load: 100 } }, computed);
    const drawn = canvasOf(project, lookup);
    expect(shapeOf(drawn, DB).fill).toBe('#00FF00');
    expect(shapeOf(drawn, API).fill).toBe('#FF0000');
  });

  it('recolor only the shapes whose overlay value changed when live values change', () => {
    const project = withOverlays([LOAD_FILL]);
    const at = moments();
    const first = canvasOf(
      project,
      at({ 'appointments-api': { load: 10 }, 'appointments-db': { load: 20 } }),
    );
    // The database's value changes; the API's arrives again as it was.
    const second = canvasOf(
      project,
      at({ 'appointments-api': { load: 10 }, 'appointments-db': { load: 90 } }),
    );
    expect(changedShapes(first, second)).toEqual([DB]);
    expect(shapeOf(second, DB).fill).not.toBe(shapeOf(first, DB).fill);
    expect(second.relations).toBe(first.relations);
    // A value no overlay reads, and no detail shows, changes nothing at all.
    const third = canvasOf(
      project,
      at({
        'appointments-api': { load: 10, queue: 7 },
        'appointments-db': { load: 90 },
        patient: { mood: 'calm' },
      }),
    );
    expect(third).toBe(second);
  });

  it('draw a shape whose live value reads as the stored one as the view’s own scene does', () => {
    const stored = withOverlays([LOAD_FILL]);
    const project = {
      ...stored,
      model: {
        ...stored.model,
        elements: stored.model.elements.map((each) =>
          each.id === 'appointments-api'
            ? { ...each, attributes: { ...each.attributes, load: 40 } }
            : each,
        ),
      },
    };
    const scene = buildScene(project, VIEW);
    expect(canvasOf(project, moments()({ 'appointments-api': { load: 40 } }))).toBe(scene);
  });

  it('size a shape by a live value, routing again only the lines on it, and moving nothing', () => {
    const project = withOverlays([LOAD_SIZE]);
    const scene = buildScene(project, VIEW);
    const drawn = canvasOf(project, moments()({ 'reminder-service': { load: 100 } }));
    const key = 'clinic-booking/scheduling/reminder-service';
    const was = shapeOf(scene, key);
    const now = shapeOf(drawn, key);
    expect(now.rect.width).toBeCloseTo(was.rect.width * 2);
    expect(now.laidOut).toEqual(was.rect);
    // Only the line that ends on it is routed again.
    const changed = drawn.relations
      .filter((line, at) => line !== scene.relations[at])
      .map((line) => line.relation);
    expect(changed).toEqual(['api-to-reminders']);
    // What holds it grows to hold it.
    const holder = shapeOf(drawn, 'clinic-booking/scheduling');
    expect(holder.extent.x + holder.extent.width).toBeGreaterThanOrEqual(
      now.rect.x + now.rect.width,
    );
  });

  it('stroke a line by a relation’s live value', () => {
    const project = withOverlays([SLOW_LINES]);
    const scene = buildScene(project, VIEW);
    const drawn = canvasOf(project, moments()({ 'agent-to-api': { latency: 'slow' } }));
    const changed = drawn.relations.filter((line, at) => line !== scene.relations[at]);
    expect(changed.map((line) => [line.relation, line.stroke])).toEqual([
      ['agent-to-api', '#B42318'],
    ]);
    expect(drawn.shapes).toBe(scene.shapes);
  });

  it('read a target’s values again only when they change, and only what the overlays read', () => {
    const project = withOverlays([LOAD_FILL]);
    const definitions = definitionsIn(project);
    const scene = buildScene(project, VIEW);
    const at = moments();
    const reads: string[] = [];
    const counting = (lookup: AttributeLookup) => {
      const value = lookup.value.bind(lookup);
      lookup.value = (item: Attributed, name: string, given: Definitions) => {
        if (item.kind === 'element') reads.push(`${item.element.id} ${name}`);
        return value(item, name, given);
      };
      return lookup;
    };
    const values = { 'appointments-api': { load: 10 }, patient: { load: 50 } };
    liveSceneOf(scene, project, definitions, counting(at(values)), t);
    const overlayReads = () => reads.filter((each) => each.endsWith(' load'));
    expect(overlayReads()).toEqual(
      expect.arrayContaining(['appointments-api load', 'patient load']),
    );
    reads.length = 0;
    liveSceneOf(scene, project, definitions, counting(at({ ...values, patient: { load: 60 } })), t);
    expect(overlayReads()).toEqual(['patient load']);
  });
});

describe('the canvas’s scene with overlays', () => {
  const OVERLAY_SETS: Overlay[][] = [
    [LOAD_FILL],
    [
      LOAD_SIZE,
      {
        ...LOAD_FILL,
        id: 'fade',
        channel: 'opacity',
        mapping: {
          kind: 'continuous',
          stops: [
            { at: 0, opacity: 0.2 },
            { at: 100, opacity: 1 },
          ],
        },
      },
    ],
    [{ ...LOAD_FILL, id: 'badge', channel: 'badge', mapping: { kind: 'passthrough' } }, SLOW_LINES],
    [LOAD_SIZE, LOAD_FILL, SLOW_LINES],
    // Sizes by steps: a load of 50 leaves a shape its own size, as no value does not.
    [
      {
        id: 'steps',
        of: 'elements',
        attribute: 'load',
        channel: 'size',
        mapping: {
          kind: 'discrete',
          cases: [
            { value: '50', size: 1 },
            { value: '100', size: 2 },
          ],
          otherwise: 0.75,
        },
      },
    ],
  ];
  const ELEMENTS = loadSample().model.elements.map((each) => each.id);
  const LOAD = fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constantFrom(50, 100));
  const RELATIONS = loadSample().model.relations.map((each) => each.id);

  it('equals the view’s built from nothing with those values stored, moment after moment', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: OVERLAY_SETS.length - 1 }),
        fc.array(
          fc.record({
            elements: fc.dictionary(fc.constantFrom(...ELEMENTS), LOAD),
            relations: fc.dictionary(
              fc.constantFrom(...RELATIONS),
              fc.constantFrom('slow', 'fast'),
            ),
            // Whether the live values can say what changed, so that only that is worked out again.
            telling: fc.boolean(),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        // What the model stores already, which live values read over.
        fc.dictionary(fc.constantFrom(...ELEMENTS), LOAD),
        (set, rounds, kept) => {
          const overlaid = withOverlays(OVERLAY_SETS[set] ?? []);
          const project: ProjectSnapshot = {
            ...overlaid,
            model: {
              ...overlaid.model,
              elements: overlaid.model.elements.map((each) => {
                const load = kept[each.id];
                return load === undefined
                  ? each
                  : { ...each, attributes: { ...each.attributes, load } };
              }),
            },
          };
          const scene = buildScene(project, VIEW);
          const at = moments();
          let before: Scene | undefined;
          for (const round of rounds) {
            const values: Values = {};
            for (const [id, load] of Object.entries(round.elements)) values[id] = { load };
            for (const [id, latency] of Object.entries(round.relations)) values[id] = { latency };
            const lookup = at(values, undefined, round.telling);
            const drawn = liveSceneOf(scene, project, definitionsIn(project), lookup, t);
            const stored: ProjectSnapshot = {
              ...project,
              model: {
                ...project.model,
                elements: project.model.elements.map((each) => {
                  const load = round.elements[each.id];
                  return load === undefined
                    ? each
                    : { ...each, attributes: { ...each.attributes, load } };
                }),
                relations: project.model.relations.map((each) => {
                  const latency = round.relations[each.id];
                  return latency === undefined
                    ? each
                    : { ...each, attributes: { ...each.attributes, latency } };
                }),
              },
            };
            expect(drawn).toEqual(buildSceneAfresh(stored, VIEW));
            // What reads as it did is the same object as in the moment before.
            if (before) {
              const keys = new Map(before.shapes.map((shape) => [shape.key, shape]));
              for (const shape of drawn.shapes) {
                const was = keys.get(shape.key);
                if (was && was !== shape) expect(was).not.toEqual(shape);
              }
            }
            before = drawn;
          }
        },
      ),
      { numRuns: 80 },
    );
  }, 120_000);
});
