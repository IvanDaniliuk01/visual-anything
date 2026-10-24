import { SYSTEMS, executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, Relation, ShapePosition } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { indexScene, type IndexedScene } from './hit';
import { buildScene } from './scene';
import { SpatialIndex } from './spatial';
import {
  EAGER_LIMIT,
  restackCommand,
  stackingActions,
  stackingShortcut,
  type StackingMove,
} from './stacking';

const VIEW = 'system-overview';
const sample = loadSample();

/** The project after a command, which must be accepted. */
function after(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/** The sample with some shapes placed elsewhere in the view. */
function placed(project: ProjectSnapshot, positions: ShapePosition[]): ProjectSnapshot {
  return after(project, { type: 'set-positions', view: VIEW, positions });
}

/** The sample with Calendar directly in World, created last, over Scheduling and the Appointments API. */
function withCalendar(): ProjectSnapshot {
  return after(sample, {
    type: 'create-element',
    element: { id: 'calendar', component: 'clinic.calendar', name: 'Calendar' },
    positions: [{ view: VIEW, x: 800, y: 150 }],
  });
}

function indexOf(project: ProjectSnapshot, view = VIEW): IndexedScene {
  return indexScene(buildScene(project, view));
}

function elements(...ids: string[]): Selection {
  return selectionOf(ids.map((id) => ({ kind: 'element' as const, id })));
}

/** The element ids a container's shapes are drawn in, back to front. */
function drawn(project: ProjectSnapshot, containerShape: string, view = VIEW): string[] {
  const indexed = indexOf(project, view);
  return indexed.drawing
    .map((at) => indexed.scene.shapes[at])
    .filter((shape) => (shape?.containerShape ?? '') === containerShape)
    .map((shape) => shape?.element ?? '');
}

/** A project of Services directly in World, or in a System, each with the rectangle given. */
function project(
  shapes: { id: string; x: number; y: number; width?: number; height?: number; in?: string }[],
): ProjectSnapshot {
  const elements: Element[] = shapes.map((shape) => ({
    id: shape.id,
    component: shapes.some((other) => other.in === shape.id) ? 'systems.system' : 'systems.service',
    name: shape.id.toUpperCase(),
  }));
  const relations: Relation[] = shapes.flatMap((shape) =>
    shape.in === undefined
      ? []
      : [
          {
            id: `${shape.id}-in-${shape.in}`,
            relationType: 'systems.is-part-of',
            from: shape.id,
            to: shape.in,
          },
        ],
  );
  const positions: ShapePosition[] = shapes.map((shape) => ({
    element: shape.id,
    ...(shape.in === undefined ? {} : { container: shape.in }),
    x: shape.x,
    y: shape.y,
    width: shape.width ?? 180,
    height: shape.height ?? 80,
  }));
  return {
    project: { schemaVersion: 1, name: 'Shapes', packages: ['systems'] },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [SYSTEMS],
    views: [
      {
        id: 'shapes',
        name: 'Shapes',
        perspective: { name: 'Stacking' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions,
        freeShapes: [],
      },
    ],
    scenarios: [],
  };
}

describe('stackingShortcut', () => {
  const press = (
    key: string,
    code: string,
    held: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; altGraph?: boolean },
  ) =>
    stackingShortcut({
      key,
      code,
      ctrlKey: held.ctrl ?? false,
      metaKey: held.meta ?? false,
      shiftKey: held.shift ?? false,
      altKey: held.alt ?? false,
      altGraph: held.altGraph ?? false,
    });

  it('reads US keys by the character they type', () => {
    expect(press(']', 'BracketRight', { ctrl: true })).toBe('forward');
    expect(press('[', 'BracketLeft', { ctrl: true })).toBe('backward');
    expect(press('}', 'BracketRight', { ctrl: true, shift: true })).toBe('front');
    expect(press('{', 'BracketLeft', { ctrl: true, shift: true })).toBe('back');
  });

  it('reads Latin American keys by the character they type, wherever the key is', () => {
    // There, } and { are typed without Shift, and Shift on the same keys types ] and [.
    expect(press('}', 'Backslash', { ctrl: true })).toBe('front');
    expect(press('{', 'Quote', { ctrl: true })).toBe('back');
    expect(press(']', 'Backslash', { ctrl: true, shift: true })).toBe('forward');
    expect(press('[', 'Quote', { ctrl: true, shift: true })).toBe('backward');
  });

  it('takes the arrow keys on every keyboard, and leaves AltGr alone, as on a Spanish one', () => {
    expect(press('[', 'Quote', { ctrl: true, alt: true, altGraph: true })).toBeUndefined();
    expect(press(']', 'Backslash', { ctrl: true, alt: true, altGraph: true })).toBeUndefined();
    expect(press('ArrowUp', 'ArrowUp', { ctrl: true })).toBe('forward');
    expect(press('ArrowDown', 'ArrowDown', { ctrl: true })).toBe('backward');
    expect(press('ArrowUp', 'ArrowUp', { ctrl: true, shift: true })).toBe('front');
    expect(press('ArrowDown', 'ArrowDown', { ctrl: true, shift: true })).toBe('back');
  });

  it('takes ⌘ with the brackets and the arrows on macOS, ⌥⌘ by the key, and leaves ⌘⇧ to the tabs', () => {
    expect(press(']', 'BracketRight', { meta: true })).toBe('forward');
    expect(press('[', 'BracketLeft', { meta: true })).toBe('backward');
    expect(press('‘', 'BracketRight', { meta: true, alt: true })).toBe('front');
    expect(press('“', 'BracketLeft', { meta: true, alt: true })).toBe('back');
    expect(press('}', 'BracketRight', { meta: true, shift: true })).toBeUndefined();
    expect(press('{', 'BracketLeft', { meta: true, shift: true })).toBeUndefined();
    expect(press('ArrowUp', 'ArrowUp', { meta: true })).toBe('forward');
    expect(press('ArrowDown', 'ArrowDown', { meta: true, shift: true })).toBe('back');
  });

  it('reads the keys of a non-Latin layout by their place, as Ctrl+х on a Russian one', () => {
    expect(press('х', 'BracketLeft', { ctrl: true })).toBe('backward');
    expect(press('ъ', 'BracketRight', { ctrl: true })).toBe('forward');
    expect(press('Х', 'BracketLeft', { ctrl: true, shift: true })).toBe('back');
    expect(press('Ъ', 'BracketRight', { ctrl: true, shift: true })).toBe('front');
  });

  it('matches nothing else', () => {
    // Ctrl and + zooms on a Spanish layout, where + is on the key US keyboards type ] with.
    expect(press('+', 'BracketRight', { ctrl: true })).toBeUndefined();
    // A Latin letter is never matched by its place.
    expect(press('ü', 'BracketLeft', { ctrl: true })).toBeUndefined();
    expect(press(']', 'BracketRight', { ctrl: true, alt: true })).toBeUndefined();
    expect(press('ArrowUp', 'ArrowUp', { ctrl: true, alt: true })).toBeUndefined();
    expect(press(']', 'BracketRight', {})).toBeUndefined();
    expect(press('ArrowUp', 'ArrowUp', { shift: true })).toBeUndefined();
    expect(press('ArrowLeft', 'ArrowLeft', { ctrl: true })).toBeUndefined();
  });
});

describe('restackCommand', () => {
  it('asks for shapes of elements when none are selected', () => {
    const indexed = indexOf(sample);
    const selection = selectionOf([{ kind: 'relation', id: 'patient-to-whatsapp' }]);
    expect(restackCommand(indexed, sample, VIEW, selection, 'forward')).toEqual({
      reason:
        'Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.',
    });
  });

  it('says so while the project cannot be changed', () => {
    const indexed = indexOf(sample);
    expect(restackCommand(indexed, sample, VIEW, elements('patient'), 'front', false)).toEqual({
      reason: 'The project cannot be changed now.',
    });
  });

  it('brings a shape forward past the next shape it overlaps, skipping the siblings it does not', () => {
    // WhatsApp over the corner of Scheduling, clear of the Booking agent drawn between them.
    const project = placed(sample, [
      { element: 'whatsapp', container: 'clinic-booking', x: 480, y: 300 },
    ]);
    const indexed = indexOf(project);
    const outcome = restackCommand(indexed, project, VIEW, elements('whatsapp'), 'forward');
    expect(outcome).toEqual({
      command: {
        type: 'restack',
        view: VIEW,
        moves: [
          {
            shape: { element: 'whatsapp', container: 'clinic-booking' },
            to: { inFrontOf: 'scheduling' },
          },
        ],
      },
      done: '"WhatsApp channel" is now in front of "Scheduling".',
    });
    const next = after(project, outcome.command as Command);
    expect(drawn(next, 'clinic-booking')).toEqual(['booking-agent', 'scheduling', 'whatsapp']);

    const backward = restackCommand(indexed, project, VIEW, elements('scheduling'), 'backward');
    expect(backward.command?.moves).toEqual([
      { shape: { element: 'scheduling', container: 'clinic-booking' }, to: { behind: 'whatsapp' } },
    ]);
    expect(backward.done).toBe('"Scheduling" is now behind "WhatsApp channel".');
  });

  it('counts siblings that only touch as not overlapping', () => {
    // The Booking agent's left side on WhatsApp's right one.
    const project = placed(sample, [
      { element: 'booking-agent', container: 'clinic-booking', x: 220, y: 164 },
    ]);
    const indexed = indexOf(project);
    expect(restackCommand(indexed, project, VIEW, elements('whatsapp'), 'forward')).toEqual({
      reason:
        '"WhatsApp channel" is already in front of everything it overlaps inside "Clinic booking".',
    });
    expect(restackCommand(indexed, project, VIEW, elements('booking-agent'), 'back')).toEqual({
      reason: '"Booking agent" is already behind everything it overlaps inside "Clinic booking".',
    });
  });

  it('finds nothing to pass in the gap of an L-shaped extent', () => {
    const shapes = project([
      { id: 's', x: 0, y: 0, width: 400, height: 300 },
      { id: 'c', in: 's', x: -300, y: -200 },
      { id: 'y', x: -250, y: 100 },
    ]);
    const indexed = indexOf(shapes, 'shapes');
    for (const move of ['front', 'forward', 'backward', 'back'] as const) {
      expect(
        restackCommand(indexed, shapes, 'shapes', elements('y'), move).command,
      ).toBeUndefined();
      expect(
        restackCommand(indexed, shapes, 'shapes', elements('s'), move).command,
      ).toBeUndefined();
    }
    // The content sticking out does count where it overlaps.
    const overlapping = project([
      { id: 's', x: 0, y: 0, width: 400, height: 300 },
      { id: 'c', in: 's', x: -300, y: -200 },
      { id: 'y', x: -250, y: -150 },
    ]);
    const command = restackCommand(
      indexOf(overlapping, 'shapes'),
      overlapping,
      'shapes',
      elements('y'),
      'backward',
    ).command;
    expect(command?.moves).toEqual([{ shape: { element: 'y' }, to: { behind: 's' } }]);
  });

  it('keeps the order of the selection when bringing it to the front or sending it to the back', () => {
    const shapes = project([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 20 },
      { id: 'c', x: 80, y: 40 },
      { id: 'd', x: 120, y: 60 },
    ]);
    const indexed = indexOf(shapes, 'shapes');
    const front = restackCommand(indexed, shapes, 'shapes', elements('a', 'b'), 'front');
    expect(front.command?.moves).toEqual([
      { shape: { element: 'a' }, to: 'front' },
      { shape: { element: 'b' }, to: 'front' },
    ]);
    expect(front.done).toBe('The selection is now in front.');
    expect(drawn(after(shapes, front.command as Command), '', 'shapes')).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
    const back = restackCommand(indexed, shapes, 'shapes', elements('c', 'd'), 'back');
    expect(back.command?.moves).toEqual([
      { shape: { element: 'd' }, to: 'back' },
      { shape: { element: 'c' }, to: 'back' },
    ]);
    expect(back.done).toBe('The selection is now behind.');
    expect(drawn(after(shapes, back.command as Command), '', 'shapes')).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('moves a selection forward and backward one overlapping shape at a time, keeping its order', () => {
    const shapes = project([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 20 },
      { id: 'x', x: 80, y: 40 },
    ]);
    const indexed = indexOf(shapes, 'shapes');
    const forward = restackCommand(indexed, shapes, 'shapes', elements('a', 'b'), 'forward');
    expect(forward.command?.moves).toEqual([
      { shape: { element: 'b' }, to: { inFrontOf: 'x' } },
      { shape: { element: 'a' }, to: { inFrontOf: 'x' } },
    ]);
    expect(drawn(after(shapes, forward.command as Command), '', 'shapes')).toEqual(['x', 'a', 'b']);
    expect(restackCommand(indexed, shapes, 'shapes', elements('a', 'b'), 'backward')).toEqual({
      reason: 'The selection is already behind everything it overlaps.',
    });
  });

  it('changes the order in several containers with one command', () => {
    const project = placed(sample, [
      { element: 'patient', x: 200, y: 200 },
      { element: 'whatsapp', container: 'clinic-booking', x: 480, y: 300 },
    ]);
    const indexed = indexOf(project);
    const outcome = restackCommand(
      indexed,
      project,
      VIEW,
      elements('patient', 'whatsapp'),
      'forward',
    );
    expect(outcome.command?.moves).toEqual([
      {
        shape: { element: 'whatsapp', container: 'clinic-booking' },
        to: { inFrontOf: 'scheduling' },
      },
      { shape: { element: 'patient' }, to: { inFrontOf: 'clinic-booking' } },
    ]);
    const result = executeCommand(project, outcome.command as Command);
    expect(result.ok && result.label).toBe('Bring 2 shapes forward in "System overview"');
  });

  it('moves the shapes inside every copy of a container once, through its first copy', () => {
    const base = project([
      { id: 'a', x: 0, y: 0, width: 600, height: 400 },
      { id: 'b', x: 700, y: 0, width: 600, height: 400 },
      { id: 'x', in: 'a', x: 24, y: 48, width: 500, height: 300 },
      { id: 'e', in: 'x', x: 24, y: 48 },
      { id: 'f', in: 'x', x: 100, y: 60 },
    ]);
    const shapes = after(base, {
      type: 'create-relation',
      relation: { relationType: 'systems.is-part-of', from: 'x', to: 'b' },
    });
    const indexed = indexOf(shapes, 'shapes');
    expect(indexed.byElement.get('e')).toHaveLength(2);
    const outcome = restackCommand(indexed, shapes, 'shapes', elements('e'), 'forward');
    expect(outcome.command?.moves).toEqual([
      { shape: { element: 'e', container: 'x' }, to: { inFrontOf: 'f' } },
    ]);
    expect(executeCommand(shapes, outcome.command as Command).ok).toBe(true);
  });

  it('says what covers a shape from outside its container', () => {
    const project = withCalendar();
    const indexed = indexOf(project);
    expect(restackCommand(indexed, project, VIEW, elements('appointments-api'), 'forward')).toEqual(
      {
        reason:
          '"Appointments API" is already in front of everything it overlaps inside "Scheduling". "Calendar" is drawn in front of "Clinic booking", which holds it.',
      },
    );
    expect(
      restackCommand(indexed, project, VIEW, elements('appointments-api'), 'front').reason,
    ).toBe(
      '"Appointments API" is already in front of everything it overlaps inside "Scheduling". "Calendar" is drawn in front of "Clinic booking", which holds it.',
    );
  });

  it('says when a shape sits over a container it is not inside, and when what it goes behind hides it', () => {
    const project = withCalendar();
    const indexed = indexOf(project);
    const hint =
      ' It sits over "Clinic booking" without being inside it; Put inside "Clinic booking" orders it among the shapes there.';
    expect(restackCommand(indexed, project, VIEW, elements('calendar'), 'forward')).toEqual({
      reason: `"Calendar" is already in front of everything it overlaps directly in World.${hint}`,
    });
    const backward = restackCommand(indexed, project, VIEW, elements('calendar'), 'backward');
    expect(backward.command?.moves).toEqual([
      { shape: { element: 'calendar' }, to: { behind: 'clinic-booking' } },
    ]);
    expect(backward.done).toBe(`"Calendar" is now behind "Clinic booking", which hides it.${hint}`);
    expect(restackCommand(indexed, project, VIEW, elements('calendar'), 'back').done).toBe(
      `"Calendar" is now at the back. "Clinic booking" hides it.${hint}`,
    );
  });

  it('says where a shape went', () => {
    const project = placed(sample, [
      { element: 'whatsapp', container: 'clinic-booking', x: 480, y: 300 },
    ]);
    const indexed = indexOf(project);
    expect(restackCommand(indexed, project, VIEW, elements('whatsapp'), 'front').done).toBe(
      '"WhatsApp channel" is now at the front.',
    );
    expect(restackCommand(indexed, project, VIEW, elements('scheduling'), 'back').done).toBe(
      '"Scheduling" is now at the back.',
    );
  });
});

describe('stackingActions', () => {
  it('describes each move it would make, with its keys', () => {
    const project = placed(sample, [
      { element: 'whatsapp', container: 'clinic-booking', x: 480, y: 300 },
    ]);
    const indexed = indexOf(project);
    expect(stackingActions(indexed, project, VIEW, elements('whatsapp'))).toEqual({
      front: {
        enabled: true,
        description: 'Bring to front, inside "Clinic booking" (Ctrl+Shift+↑)',
      },
      forward: { enabled: true, description: 'Bring forward, in front of "Scheduling" (Ctrl+↑)' },
      backward: {
        enabled: false,
        description:
          '"WhatsApp channel" is already behind everything it overlaps inside "Clinic booking".',
      },
      back: {
        enabled: false,
        description:
          '"WhatsApp channel" is already behind everything it overlaps inside "Clinic booking".',
      },
    });
    expect(stackingActions(indexed, project, VIEW, elements('scheduling')).backward).toEqual({
      enabled: true,
      description: 'Send backward, behind "WhatsApp channel" (Ctrl+↓)',
    });
  });

  it('says when the shape it goes behind hides it', () => {
    const project = withCalendar();
    const indexed = indexOf(project);
    const actions = stackingActions(indexed, project, VIEW, elements('calendar'));
    expect(actions.backward).toEqual({
      enabled: true,
      description: 'Send backward, behind "Clinic booking", which hides it (Ctrl+↓)',
    });
    expect(actions.back).toEqual({
      enabled: true,
      description: 'Send to back, directly in World; "Clinic booking" then hides it (Ctrl+Shift+↓)',
    });
    expect(actions.forward.enabled).toBe(false);
    expect(actions.front.enabled).toBe(false);
  });

  it('describes moves of several shapes as moves of the selection', () => {
    const shapes = project([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 20 },
      { id: 'x', x: 80, y: 40 },
    ]);
    const actions = stackingActions(
      indexOf(shapes, 'shapes'),
      shapes,
      'shapes',
      elements('a', 'b'),
    );
    expect(actions.forward).toEqual({
      enabled: true,
      description: 'Bring the selection forward (Ctrl+↑)',
    });
    expect(actions.front).toEqual({
      enabled: true,
      description: 'Bring the selection to the front (Ctrl+Shift+↑)',
    });
    expect(actions.backward.enabled).toBe(false);
    expect(actions.back.enabled).toBe(false);
  });

  it('turns every move off with a reason when nothing can change', () => {
    const indexed = indexOf(sample);
    const none = stackingActions(indexed, sample, VIEW, selectionOf([]));
    const reason =
      'Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.';
    for (const move of ['front', 'forward', 'backward', 'back'] as StackingMove[]) {
      expect(none[move]).toEqual({ enabled: false, description: reason });
    }
    const locked = stackingActions(indexed, sample, VIEW, elements('patient'), false);
    expect(locked.front).toEqual({
      enabled: false,
      description: 'The project cannot be changed now.',
    });
  });

  it(`leaves the work to the press above ${EAGER_LIMIT} selected shapes`, () => {
    const shapes = project(
      Array.from({ length: EAGER_LIMIT + 2 }, (_, at) => ({ id: `s${at}`, x: at * 10, y: 0 })),
    );
    const indexed = indexOf(shapes, 'shapes');
    const contentsIndex = vi.spyOn(indexed, 'contentsIndex');
    // Every shape but the one at the back, which they all overlap.
    const all = elements(...shapes.model.elements.slice(1).map((element) => element.id));
    expect(stackingActions(indexed, shapes, 'shapes', all)).toEqual({
      front: { enabled: true, description: 'Bring the selection to the front (Ctrl+Shift+↑)' },
      forward: { enabled: true, description: 'Bring the selection forward (Ctrl+↑)' },
      backward: { enabled: true, description: 'Send the selection backward (Ctrl+↓)' },
      back: { enabled: true, description: 'Send the selection to the back (Ctrl+Shift+↓)' },
    });
    expect(contentsIndex).not.toHaveBeenCalled();
    // The press does the work, and finds nothing to do for the shape already at the back.
    expect(
      restackCommand(indexed, shapes, 'shapes', elements('s0'), 'back').command,
    ).toBeUndefined();
    expect(restackCommand(indexed, shapes, 'shapes', all, 'back').command?.moves).toHaveLength(
      EAGER_LIMIT + 1,
    );
  });

  it(
    'reads only the shapes beside a container that holds 9,000, never its contents',
    {
      timeout: 60_000,
    },
    () => {
      const big = syntheticProject({ elements: 10_000, perSystem: 9_000 });
      const indexed = indexScene(buildScene(big, 'everything'));
      expect(indexed.contentsOf.get('system-0')).toHaveLength(8_999);
      const query = vi.spyOn(indexed.shapes, 'query');
      const at = vi.spyOn(indexed.shapes, 'at');
      const insert = vi.spyOn(SpatialIndex.prototype, 'insert');
      try {
        stackingActions(indexed, big, 'everything', elements('system-0'));
        // The contents index of World, which holds the two systems, and nothing else.
        expect(insert.mock.calls.length).toBeLessThanOrEqual(2);
        insert.mockClear();
        stackingActions(indexed, big, 'everything', elements('system-0'));
        restackCommand(indexed, big, 'everything', elements('system-0'), 'back');
        expect(insert).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
        expect(at).not.toHaveBeenCalled();
      } finally {
        insert.mockRestore();
      }
    },
  );
});
