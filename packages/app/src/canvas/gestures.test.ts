import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { indexScene } from './hit';
import {
  carriedKeys,
  createAtCommand,
  createInsideCommand,
  movingShapes,
  moveCommand,
  relationChoices,
} from './gestures';
import { buildScene } from './scene';

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

  it('creates nothing in World, in a view that nests nothing, or for an unknown component', () => {
    expect(createInsideCommand(project, VIEW, 'systems.service', 'world')).toBeUndefined();
    expect(createInsideCommand(project, VIEW, 'systems.nothing', 'scheduling')).toBeUndefined();
    const flat = {
      ...project,
      views: project.views.map((view) => ({ ...view, nestingRelationTypes: [] })),
    };
    expect(createInsideCommand(flat, VIEW, 'systems.service', 'scheduling')).toBeUndefined();
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
