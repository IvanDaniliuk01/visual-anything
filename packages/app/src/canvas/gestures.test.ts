import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { indexScene, type IndexedScene } from './hit';
import {
  carriedKeys,
  createAtCommand,
  createBesideCommand,
  createInsideCommand,
  movingShapes,
  moveCommand,
  relationChoices,
} from './gestures';
import { buildScene, type ElementShape } from './scene';
import { overlaps } from './spatial';

const project = loadSample();
const VIEW = 'system-overview';
const indexed = indexScene(buildScene(project, VIEW));

/** The project after a command, which must be accepted. */
function after(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/** The sample with Scheduling in Patient as well as in Clinic booking: two copies of Scheduling. */
function withTwoSchedulings(): ProjectSnapshot {
  return after(project, {
    type: 'create-relation',
    relation: { relationType: 'systems.is-part-of', from: 'scheduling', to: 'patient' },
  });
}

/** The sample with the view arranged by a relation type no package defines, listed first. */
function withUnknownNestingFirst(): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) =>
      view.id === VIEW
        ? { ...view, nestingRelationTypes: ['gone.holds', ...view.nestingRelationTypes] }
        : view,
    ),
  };
}

describe('moveCommand', () => {
  it('moves a shape inside its container, pinned, and keeps its stored size', () => {
    const command = moveCommand(
      indexed,
      project,
      VIEW,
      selectionOf([{ kind: 'element', id: 'scheduling' }]),
      {
        x: 10.4,
        y: -20,
      },
    );
    expect(command).toEqual({
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: 'scheduling',
          container: 'clinic-booking',
          x: 510,
          y: 40,
          width: 440,
          height: 380,
          pinned: true,
        },
      ],
    });
    const outcome = executeCommand(project, command!);
    expect(outcome.ok).toBe(true);
  });

  it('leaves the shapes inside a moving container to it', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'scheduling' },
      { kind: 'element', id: 'appointments-api' },
    ]);
    expect(movingShapes(indexed, selection).map((shape) => shape.element)).toEqual(['scheduling']);
  });

  it('moves free shapes with the rest, as one action', () => {
    const command = moveCommand(
      indexed,
      project,
      VIEW,
      selectionOf([
        { kind: 'element', id: 'patient' },
        { kind: 'free-shape', id: 'calendar-note' },
      ]),
      { x: 5, y: 5 },
    );
    expect(command?.type).toBe('batch');
    const outcome = executeCommand(project, command!);
    expect(outcome.ok && outcome.label).toBe('Move 2 shapes in "System overview"');
  });

  it('does nothing for a move of less than a unit', () => {
    expect(
      moveCommand(indexed, project, VIEW, selectionOf([{ kind: 'element', id: 'patient' }]), {
        x: 0.2,
        y: -0.4,
      }),
    ).toBeUndefined();
  });

  it('moves the contents of a container shown twice once, as the view keeps one position for both', () => {
    const copies = withTwoSchedulings();
    const twice = indexScene(buildScene(copies, VIEW));
    const selection = selectionOf([{ kind: 'element', id: 'appointments-api' }]);
    expect(movingShapes(twice, selection)).toHaveLength(2);
    const command = moveCommand(twice, copies, VIEW, selection, { x: 10, y: 0 });
    expect(command).toEqual({
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'appointments-api', container: 'scheduling', x: 50, y: 104, pinned: true },
      ],
    });
    expect(executeCommand(copies, command!).ok).toBe(true);
  });

  it('leaves out the elements another command places', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'element', id: 'whatsapp' },
      { kind: 'free-shape', id: 'calendar-note' },
    ]);
    const command = moveCommand(
      indexed,
      project,
      VIEW,
      selection,
      { x: 5, y: 5 },
      new Set(['whatsapp']),
    );
    expect(command).toEqual({
      type: 'batch',
      label: 'Move 2 shapes in "System overview"',
      commands: [
        {
          type: 'set-positions',
          view: VIEW,
          positions: [{ element: 'patient', x: 45, y: 205, pinned: true }],
        },
        expect.objectContaining({ type: 'update-free-shape' }),
      ],
    });
    expect(
      moveCommand(
        indexed,
        project,
        VIEW,
        selectionOf([{ kind: 'element', id: 'whatsapp' }]),
        { x: 5, y: 5 },
        new Set(['whatsapp']),
      ),
    ).toBeUndefined();
  });
});

describe('carriedKeys', () => {
  it('finds what a large selection carries at once, at 10,000 shapes', () => {
    for (const overlap of ['grid', 'none'] as const) {
      const big = syntheticProject({ elements: 10_000, overlap });
      const scene = indexScene(buildScene(big, 'everything'));
      const all = selectionOf(
        big.model.elements.map((element) => ({ kind: 'element', id: element.id })),
      );
      const started = performance.now();
      const moving = movingShapes(scene, all);
      const carried = carriedKeys(scene, moving);
      const took = performance.now() - started;
      expect(carried.size).toBe(10_000);
      // It took over two seconds when every shape was compared with every moving one.
      expect(took).toBeLessThan(250);
    }
  }, 60_000);

  it('holds the moving shapes and everything inside them', () => {
    const moving = movingShapes(indexed, selectionOf([{ kind: 'element', id: 'scheduling' }]));
    expect([...carriedKeys(indexed, moving)].sort()).toEqual([
      'clinic-booking/scheduling',
      'clinic-booking/scheduling/appointments-api',
      'clinic-booking/scheduling/appointments-db',
      'clinic-booking/scheduling/reminder-service',
    ]);
  });
});

describe('createAtCommand', () => {
  it('creates an element inside the given shape, at the point, with its position not pinned', () => {
    const scheduling = indexed.byKey.get('clinic-booking/scheduling');
    const command = createAtCommand(
      project,
      VIEW,
      'systems.service',
      { x: 800, y: 500 },
      scheduling,
    );
    expect(command).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      containers: [{ container: 'scheduling', relationType: 'systems.is-part-of' }],
      positions: [{ view: VIEW, container: 'scheduling', x: 60, y: 400 }],
    });
    expect(executeCommand(project, command!).ok).toBe(true);
  });

  it('creates it directly in World when no shape is given', () => {
    const command = createAtCommand(project, VIEW, 'systems.person', { x: -100, y: 40 }, undefined);
    expect(command && 'positions' in command && command.positions).toEqual([
      { view: VIEW, x: -100, y: 40 },
    ]);
  });

  it('nests through the first relation type that arranges the view, not the first one listed', () => {
    const listed = withUnknownNestingFirst();
    const scheduling = indexScene(buildScene(listed, VIEW)).byKey.get('clinic-booking/scheduling');
    const command = createAtCommand(
      listed,
      VIEW,
      'systems.service',
      { x: 800, y: 500 },
      scheduling,
    );
    expect(command && 'containers' in command && command.containers).toEqual([
      { container: 'scheduling', relationType: 'systems.is-part-of' },
    ]);
  });
});

describe('createInsideCommand', () => {
  it('creates an element inside a container, with no position, through the view nesting type', () => {
    const command = createInsideCommand(project, VIEW, 'systems.service', 'scheduling');
    expect(command).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      containers: [{ container: 'scheduling', relationType: 'systems.is-part-of' }],
    });
    expect(executeCommand(project, command!).ok).toBe(true);
    expect(
      createInsideCommand(withUnknownNestingFirst(), VIEW, 'systems.service', 'scheduling'),
    ).toEqual(command);
  });

  it('lands the new shape at the start of an empty container, below its name', () => {
    const outcome = executeCommand(
      project,
      createInsideCommand(project, VIEW, 'systems.service', 'patient')!,
    );
    if (!outcome.ok) throw new Error('refused');
    const [id] = outcome.created;
    const shape = indexScene(buildScene(outcome.state, VIEW)).byElement.get(id!)?.[0];
    expect(shape?.containerShape).toBe('patient');
    expect(shape?.offset).toEqual({ x: 24, y: 48 });
  });

  it('lands the new shape below the positioned contents, and never over the container name', () => {
    const outcome = executeCommand(
      project,
      createInsideCommand(project, VIEW, 'systems.service', 'clinic-booking')!,
    );
    if (!outcome.ok) throw new Error('refused');
    const scene = indexScene(buildScene(outcome.state, VIEW));
    const shape = scene.byElement.get(outcome.created[0]!)?.[0];
    // Scheduling, the lowest of them, ends at 60 + 380.
    expect(shape?.offset).toEqual({ x: 24, y: 480 });

    // A content that sticks out of its container's top leaves the new shape below the name.
    const raised = after(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'appointments-api', container: 'scheduling', x: 40, y: -100 },
        { element: 'appointments-db', container: 'scheduling', x: 240, y: -100 },
        { element: 'reminder-service', container: 'scheduling', x: 440, y: -100 },
      ],
    });
    const created = executeCommand(
      raised,
      createInsideCommand(raised, VIEW, 'systems.service', 'scheduling')!,
    );
    if (!created.ok) throw new Error('refused');
    const inside = indexScene(buildScene(created.state, VIEW)).byElement.get(created.created[0]!);
    expect(inside?.[0]?.offset).toEqual({ x: 24, y: 48 });
  });

  it('creates nothing in World, or for an unknown component or view', () => {
    expect(createInsideCommand(project, VIEW, 'systems.service', 'world')).toBeUndefined();
    expect(createInsideCommand(project, VIEW, 'systems.nothing', 'scheduling')).toBeUndefined();
    expect(
      createInsideCommand(project, 'nowhere', 'systems.service', 'scheduling'),
    ).toBeUndefined();
  });

  it('in a view that nests nothing, starts nesting it by the relation type that holds the element, in the same action', () => {
    const flat = {
      ...project,
      views: project.views.map((view) => ({ ...view, nestingRelationTypes: [] })),
    };
    const command = createInsideCommand(flat, VIEW, 'systems.service', 'scheduling');
    expect(command).toEqual({
      type: 'batch',
      label: 'Create "Service"',
      commands: [
        {
          type: 'update-view',
          id: VIEW,
          changes: { nestingRelationTypes: ['systems.is-part-of'] },
        },
        {
          type: 'create-element',
          element: { component: 'systems.service', name: 'Service' },
          containers: [{ container: 'scheduling', relationType: 'systems.is-part-of' }],
        },
      ],
    });
    expect(executeCommand(flat, command!).ok).toBe(true);
  });
});

describe('the nesting relation type of a new element', () => {
  /** The project using Data modeling, with an empty table "users" in World, which draws rows. */
  function withTable(state: ProjectSnapshot = project): ProjectSnapshot {
    const using = after(state, {
      type: 'update-project',
      changes: { packages: [...state.project.packages, 'data-modeling'] },
    });
    return after(using, {
      type: 'create-element',
      element: { id: 'users', component: 'data-modeling.table', name: 'users' },
      positions: [{ view: VIEW, x: 2000, y: 0 }],
    });
  }

  /** The action that nests the view by these, then creates a column in "users". */
  const columnInUsers = (nesting: Id[]): Command => ({
    type: 'batch',
    label: 'Create "Column"',
    commands: [
      { type: 'update-view', id: VIEW, changes: { nestingRelationTypes: nesting } },
      {
        type: 'create-element',
        element: { component: 'data-modeling.column', name: 'Column' },
        containers: [{ container: 'users', relationType: 'data-modeling.is-column-of' }],
      },
    ],
  });

  it('holds a column in a table by "is column of", which the view starts nesting by, with no position in the table', () => {
    const state = withTable();
    const table = indexScene(buildScene(state, VIEW)).byKey.get('users');
    const at = createAtCommand(state, VIEW, 'data-modeling.column', { x: 2010, y: 10 }, table);
    expect(at).toEqual(columnInUsers(['systems.is-part-of', 'data-modeling.is-column-of']));
    expect(executeCommand(state, at!).ok).toBe(true);
    expect(createInsideCommand(state, VIEW, 'data-modeling.column', 'users')).toEqual(at);
  });

  it('keeps "is part of" for a service in a system, whatever else is in use', () => {
    expect(createInsideCommand(withTable(), VIEW, 'systems.service', 'scheduling')).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      containers: [{ container: 'scheduling', relationType: 'systems.is-part-of' }],
    });
  });

  it('drops from the view a nesting relation type that no longer exists when it adds one', () => {
    const state = withTable(withUnknownNestingFirst());
    const command = createInsideCommand(state, VIEW, 'data-modeling.column', 'users');
    expect(command).toEqual(columnInUsers(['systems.is-part-of', 'data-modeling.is-column-of']));
    expect(executeCommand(state, command!).ok).toBe(true);
  });

  it('adds a column beside another in its table with no position, and stores none for the rows there', () => {
    const table = withTable();
    const state = after(table, createInsideCommand(table, VIEW, 'data-modeling.column', 'users')!);
    const scene = indexScene(buildScene(state, VIEW));
    const [column] = scene.contentsOf.get('users') ?? [];
    const command = createBesideCommand(scene, state, VIEW, 'data-modeling.column', column!);
    expect(command).toEqual({
      type: 'create-element',
      element: { component: 'data-modeling.column', name: 'Column' },
      containers: [{ container: 'users', relationType: 'data-modeling.is-column-of' }],
    });
    expect(executeCommand(state, command!).ok).toBe(true);
  });
});

describe('createBesideCommand', () => {
  /** The new element's shape once `command` is done, with the scene it is drawn in. */
  function created(state: ProjectSnapshot, command: Command | undefined) {
    if (!command) throw new Error('no command');
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    const scene = indexScene(buildScene(outcome.state, VIEW));
    const shape = scene.byElement.get(outcome.created[0]!)?.[0];
    if (!shape) throw new Error('not drawn');
    return { state: outcome.state, scene, shape };
  }

  /** Whether a shape overlaps any other shape that sits in its container. */
  function overlapsASibling(scene: IndexedScene, shape: ElementShape): boolean {
    return (scene.contentsOf.get(shape.containerShape ?? '') ?? []).some(
      (other) => other.key !== shape.key && overlaps(other.extent, shape.rect),
    );
  }

  it('creates an element directly in World, 40 to the right of a shape there, not pinned', () => {
    // Nothing sits to the right of Clinic booking.
    const booking = indexed.byKey.get('clinic-booking')!;
    const command = createBesideCommand(indexed, project, VIEW, 'systems.service', booking);
    expect(command).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      positions: [{ view: VIEW, x: 240 + 980 + 40, y: 40 }],
    });
    const { shape } = created(project, command);
    expect(shape.container).toBeUndefined();
    expect(shape.positioned).toBe('stored');
  });

  it('goes on to the right, by its own width and 40 each time, past the shapes it would overlap', () => {
    // Beside Patient lies Clinic booking, from 240 to 1220: a Service, 180 wide, goes 220 further
    // each time, from 220 to 1320.
    const patient = indexed.byKey.get('patient')!;
    const command = createBesideCommand(indexed, project, VIEW, 'systems.service', patient);
    expect(command && 'positions' in command && command.positions).toEqual([
      { view: VIEW, x: 1320, y: 200 },
    ]);
    const { scene, shape } = created(project, command);
    expect(shape.rect).toEqual({ x: 1320, y: 200, width: 180, height: 72 });
    expect(overlapsASibling(scene, shape)).toBe(false);
  });

  it('creates it inside the container of a shape there, beside it, overlapping nothing there', () => {
    const api = indexed.byKey.get('clinic-booking/scheduling/appointments-api')!;
    const command = createBesideCommand(indexed, project, VIEW, 'systems.service', api);
    // Reminder service sits at 240, so the Service goes one step further.
    expect(command).toEqual({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Service' },
      containers: [{ container: 'scheduling', relationType: 'systems.is-part-of' }],
      positions: [{ view: VIEW, container: 'scheduling', x: 480, y: 104 }],
    });
    const { scene, shape } = created(project, command);
    expect(shape.containerShape).toBe('clinic-booking/scheduling');
    expect(shape.offset).toEqual({ x: 480, y: 104 });
    expect(overlapsASibling(scene, shape)).toBe(false);
  });

  it('makes a row of elements added one after another, each beside the one before', () => {
    for (const start of ['patient', 'clinic-booking/whatsapp']) {
      let state = project;
      let scene = indexed;
      let beside = scene.byKey.get(start)!;
      const added: ElementShape[] = [];
      for (let each = 0; each < 3; each++) {
        const next = created(
          state,
          createBesideCommand(scene, state, VIEW, 'systems.service', beside),
        );
        ({ state, scene } = next);
        beside = next.shape;
        added.push(next.shape);
      }
      const rects = added.map((shape) => scene.byKey.get(shape.key)!.rect);
      for (const [at, rect] of rects.entries()) {
        expect(rect.y).toBe(rects[0]!.y);
        if (at > 0) expect(rect.x).toBe(rects[at - 1]!.x + 180 + 40);
      }
      for (const shape of added)
        expect(overlapsASibling(scene, scene.byKey.get(shape.key)!)).toBe(false);
      expect(new Set(added.map((shape) => shape.containerShape))).toEqual(
        new Set([scene.byKey.get(start)!.containerShape]),
      );
    }
  });

  it('keeps the shapes the stand-in row placed beside it where they are drawn, in the same action', () => {
    // Two Services added inside Clinic booking with no position, in its stand-in row.
    let state = project;
    const placed: Id[] = [];
    for (let each = 0; each < 2; each++) {
      const outcome = executeCommand(
        state,
        createInsideCommand(state, VIEW, 'systems.service', 'clinic-booking')!,
      );
      if (!outcome.ok) throw new Error('refused');
      state = outcome.state;
      placed.push(outcome.created[0]!);
    }
    const scene = indexScene(buildScene(state, VIEW));
    const [first, second] = placed.map((id) => scene.byElement.get(id)![0]!);
    expect([first!.offset, second!.offset]).toEqual([
      { x: 24, y: 480 },
      { x: 244, y: 480 },
    ]);
    expect(first!.positioned).toBe('placed');

    const command = createBesideCommand(scene, state, VIEW, 'systems.service', first!);
    expect(command).toEqual({
      type: 'batch',
      label: 'Create "Service"',
      commands: [
        {
          type: 'set-positions',
          view: VIEW,
          positions: [
            { element: placed[0], container: 'clinic-booking', x: 24, y: 480 },
            { element: placed[1], container: 'clinic-booking', x: 244, y: 480 },
          ],
        },
        {
          type: 'create-element',
          element: { component: 'systems.service', name: 'Service' },
          containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
          positions: [{ view: VIEW, container: 'clinic-booking', x: 464, y: 480 }],
        },
      ],
    });
    const { scene: drawn, shape } = created(state, command);
    const kept = placed.map((id) => drawn.byElement.get(id)![0]!);
    expect(kept.map((each) => [each.offset, each.positioned])).toEqual([
      [{ x: 24, y: 480 }, 'stored'],
      [{ x: 244, y: 480 }, 'stored'],
    ]);
    expect(shape.offset).toEqual({ x: 464, y: 480 });
    expect(overlapsASibling(drawn, shape)).toBe(false);
  });

  it('takes the size the component gives its shapes', () => {
    const booking = indexed.byKey.get('clinic-booking')!;
    const { shape } = created(
      project,
      createBesideCommand(indexed, project, VIEW, 'systems.person', booking),
    );
    const person = indexed.byKey.get('patient')!;
    expect([shape.rect.width, shape.rect.height]).toEqual([person.rect.width, person.rect.height]);
  });

  it('stops looking after a bounded number of places, and then stays next to the shape', () => {
    const wide = after(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'clinic-booking', x: 240, y: 40, width: 1_000_000, height: 480 }],
    });
    const scene = indexScene(buildScene(wide, VIEW));
    const command = createBesideCommand(
      scene,
      wide,
      VIEW,
      'systems.service',
      scene.byKey.get('patient')!,
    );
    expect(command && 'positions' in command && command.positions).toEqual([
      { view: VIEW, x: 220, y: 200 },
    ]);
  });

  it('places it beside a shape in a view that nests nothing, and moves nothing there', () => {
    const flat = {
      ...project,
      views: project.views.map((view) => ({ ...view, nestingRelationTypes: [] })),
    };
    const scene = indexScene(buildScene(flat, VIEW));
    const command = createBesideCommand(
      scene,
      flat,
      VIEW,
      'systems.service',
      scene.byKey.get('patient')!,
    );
    expect(JSON.stringify(command)).not.toContain('containers');
    const { scene: drawn, shape } = created(flat, command);
    expect(shape.container).toBeUndefined();
    expect(overlapsASibling(drawn, shape)).toBe(false);
    // The shapes that sit in containers elsewhere stand in World's row here, and stay where they are.
    for (const each of scene.scene.shapes)
      expect(drawn.byKey.get(each.key)?.rect).toEqual(each.rect);
  });

  it('creates nothing for an unknown component or view', () => {
    const patient = indexed.byKey.get('patient')!;
    expect(createBesideCommand(indexed, project, VIEW, 'systems.nothing', patient)).toBeUndefined();
    expect(
      createBesideCommand(indexed, project, 'nowhere', 'systems.service', patient),
    ).toBeUndefined();
  });
});

describe('relationChoices', () => {
  it('offers the relation types that fit first, then the others, then the nesting ones', () => {
    const choices = relationChoices(project, 'appointments-api', 'appointments-db');
    expect(choices.map((choice) => [choice.relationType.id, choice.fits])).toEqual([
      ['systems.communicates-with', true],
      ['systems.reads-from', true],
      ['systems.queries', true],
      ['systems.writes-to', true],
      ['systems.loads-into', true],
      ['clinic.reminds', false],
      ['systems.is-part-of', true],
    ]);
  });

  it('leaves out nesting relation types when an end is a relation', () => {
    const choices = relationChoices(project, 'patient', 'agent-to-api');
    expect(choices.some((choice) => choice.relationType.nests)).toBe(false);
  });
});
