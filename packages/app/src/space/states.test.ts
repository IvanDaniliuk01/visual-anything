// @vitest-environment node
/**
 * Each element's state in physical space, from the canvas's emphasis by shape key (ADR 0076): a table
 * of the rules, and properties over random emphases of elements drawn in several containers.
 */
import type { Space, SpaceEntry } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { spaceStateList, spaceStates, type ShapeEmphasis, type SpaceStatesInput } from './states';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function entry(element: Id, more: Partial<SpaceEntry> = {}): SpaceEntry {
  return { element, how: 'posed', in: 'world', matrix: IDENTITY, ...more };
}

function spaceOf(
  entries: SpaceEntry[],
  faint: SpaceEntry[] = [],
): Pick<Space, 'entries' | 'faint'> {
  return {
    entries: new Map(entries.map((each) => [each.element, each])),
    faint: new Map(faint.map((each) => [each.element, each])),
  };
}

const NONE: ShapeEmphasis = { hidden: new Set(), dimmed: new Set(), highlighted: new Set() };

/** A cell drawn in two containers, a bench drawn once, a hall drawn collapsed, a lamp inside it. */
const SHAPES = [
  { key: 'world/a/cell', element: 'cell' },
  { key: 'world/b/cell', element: 'cell' },
  { key: 'world/bench', element: 'bench' },
  { key: 'world/hall', element: 'hall' },
];

function states(more: Partial<SpaceStatesInput> = {}) {
  return spaceStates({
    space: spaceOf([
      entry('world', { how: 'root' }),
      entry('cell'),
      entry('bench'),
      entry('hall'),
      entry('lamp', { in: 'hall', drawnAs: 'hall' }),
    ]),
    shapes: SHAPES,
    emphasis: NONE,
    selected: new Set(),
    ...more,
  });
}

describe('the states of what is in physical space', () => {
  it('leaves out what looks plain', () => {
    expect(states()).toEqual(new Map());
  });

  it('hides an element only when every one of its shapes is hidden', () => {
    expect(states({ emphasis: { ...NONE, hidden: new Set(['world/a/cell']) } })).toEqual(new Map());
    expect(
      states({ emphasis: { ...NONE, hidden: new Set(['world/a/cell', 'world/b/cell']) } }),
    ).toEqual(new Map([['cell', { hidden: true }]]));
  });

  it('highlights an element when any shape is, over its being faint', () => {
    const emphasis = {
      ...NONE,
      dimmed: new Set(['world/a/cell', 'world/b/cell', 'world/bench']),
      highlighted: new Set(['world/b/cell']),
    };
    expect(states({ emphasis })).toEqual(
      new Map([
        ['cell', { highlighted: true }],
        ['bench', { faint: true }],
      ]),
    );
  });

  it('draws an element faint when every shape not hidden is dimmed', () => {
    const emphasis = {
      ...NONE,
      hidden: new Set(['world/a/cell']),
      dimmed: new Set(['world/b/cell']),
    };
    expect(states({ emphasis }).get('cell')).toEqual({ faint: true });
  });

  it('marks the selection and the hover by id, World too, and gives the overlays’ look', () => {
    const got = states({
      selected: new Set(['world', 'bench']),
      hovered: 'cell',
      overlay: (element) =>
        element === 'bench'
          ? { fill: '#336699', opacity: 0.4 }
          : element === 'cell'
            ? { opacity: 1 }
            : undefined,
    });
    expect(got).toEqual(
      new Map([
        ['world', { selected: true }],
        ['cell', { hovered: true }],
        ['bench', { selected: true, fill: '#336699', opacity: 0.4 }],
      ]),
    );
  });

  it('gives an entry drawn as a collapsed container that container’s state', () => {
    const got = states({
      selected: new Set(['hall', 'lamp']),
      emphasis: { ...NONE, highlighted: new Set(['world/hall']) },
      overlay: (element) => (element === 'lamp' ? { fill: '#FF0000' } : undefined),
    });
    expect(got.get('lamp')).toEqual({ selected: true, highlighted: true });
    expect(got.get('lamp')).toEqual(got.get('hall'));
  });

  it('draws faint the containers the view does not show', () => {
    const got = spaceStates({
      space: spaceOf([entry('bench', { in: 'room' })], [entry('room')]),
      shapes: SHAPES,
      emphasis: NONE,
      selected: new Set(['room']),
    });
    expect(got.get('room')).toEqual({ selected: true, faint: true });
    expect(spaceStateList(got)).toEqual([{ element: 'room', selected: true, faint: true }]);
  });

  it('marks everything a selected or hovered container without a solid holds, at any depth', () => {
    // A rig with no solid holds a bench, which holds a vice; an arm with a solid holds its wrist.
    const holds: Record<string, string[]> = {
      bench: ['rig'],
      vice: ['bench'],
      wrist: ['arm'],
      lamp: ['room'],
    };
    const solid = { id: 's', definition: {} as never };
    const space = spaceOf(
      [
        entry('world', { how: 'root' }),
        entry('rig'),
        entry('bench', { in: 'rig' }),
        entry('vice', { in: 'bench' }),
        entry('arm', { solid }),
        entry('wrist', { how: 'anchored', in: 'arm' }),
        // A container that is not in the space at all, with its lamp posed in World.
        entry('lamp'),
      ],
      [],
    );
    const containersOf = (element: string) => holds[element] ?? [];
    const got = spaceStates({
      space,
      shapes: [],
      emphasis: NONE,
      selected: new Set(['rig', 'arm', 'room']),
      hovered: 'bench',
      containersOf,
      world: 'world',
    });
    expect(got).toEqual(
      new Map([
        ['rig', { selected: true }],
        ['bench', { selected: true, hovered: true }],
        ['vice', { selected: true, hovered: true }],
        // An arm that draws a solid marks only itself.
        ['arm', { selected: true }],
        ['lamp', { selected: true }],
      ]),
    );
    // World selected marks only World.
    const world = spaceStates({
      space,
      shapes: [],
      emphasis: NONE,
      selected: new Set(['world']),
      containersOf: () => ['world'],
      world: 'world',
    });
    expect([...world.keys()]).toEqual(['world']);
  });

  it('gives a collapsed container that is not an entry a state of its own', () => {
    const got = spaceStates({
      space: spaceOf([entry('lamp', { drawnAs: 'room' }), entry('desk', { drawnAs: 'room' })]),
      shapes: [{ key: 'world/room', element: 'room' }],
      emphasis: { ...NONE, highlighted: new Set(['world/room']) },
      selected: new Set(),
    });
    expect(got).toEqual(
      new Map([
        ['lamp', { highlighted: true }],
        ['desk', { highlighted: true }],
        ['room', { highlighted: true }],
      ]),
    );
  });

  it('follows its rules for any emphasis of elements drawn in several containers', () => {
    const elements = ['e0', 'e1', 'e2', 'e3'];
    const keys = elements.flatMap((element) => [`a/${element}`, `b/${element}`]);
    const subset = fc.subarray(keys).map((each) => new Set(each));
    fc.assert(
      fc.property(
        fc.subarray(keys, { minLength: 1 }),
        subset,
        subset,
        subset,
        fc.subarray(elements).map((each) => new Set(each)),
        fc.constantFrom(...elements, undefined),
        (drawn, hidden, dimmed, highlighted, selected, hovered) => {
          const shapes = drawn.map((key) => ({ key, element: key.slice(2) }));
          // e3, when in a container, is drawn as e0, collapsed.
          const space = spaceOf(
            elements.map((element) => entry(element, element === 'e3' ? { drawnAs: 'e0' } : {})),
          );
          const got = spaceStates({
            space,
            shapes,
            emphasis: { hidden, dimmed, highlighted },
            selected,
            hovered,
          });
          for (const element of elements) {
            const state = got.get(element) ?? {};
            const as = element === 'e3' ? 'e0' : element;
            const own = shapes.filter((shape) => shape.element === as).map((shape) => shape.key);
            const shown = own.filter((key) => !hidden.has(key));
            expect(state.hidden === true).toBe(own.length > 0 && shown.length === 0);
            expect(state.highlighted === true).toBe(shown.some((key) => highlighted.has(key)));
            if (state.highlighted) expect(state.faint).toBeUndefined();
            expect(state.selected === true).toBe(selected.has(as));
            expect(state.hovered === true).toBe(hovered === as);
          }
          expect(got.get('e3')).toEqual(got.get('e0'));
        },
      ),
    );
  });
});
