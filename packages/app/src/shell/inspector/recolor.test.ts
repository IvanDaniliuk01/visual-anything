import {
  definitionsIn,
  executeCommand,
  modelIndexOf,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Arrow, Element, Note, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../../editor/selection';
import { THEMES } from '../../theme/themes';
import { loadSample } from '../../test/sample';
import {
  definitionColorCommand,
  definitionShapeCommand,
  elementColorCommand,
  freeShapeColorCommand,
  relationColorCommand,
  selectionColorCommand,
  selectionColors,
} from './recolor';

const sample = loadSample();
const VIEW = 'system-overview';
const index = modelIndexOf(sample);
const definitions = definitionsIn(sample);
const theme = THEMES.light.canvas;

const elementOf = (id: string) => index.element(id) as Element;
const relationOf = (id: string) => index.relation(id) as Relation;
const note = sample.views[0]?.freeShapes.find((each) => each.id === 'calendar-note') as Note;
const arrow: Arrow = { kind: 'arrow', id: 'pointer', from: { x: 0, y: 0 }, to: { x: 80, y: 0 } };

function apply(project: ProjectSnapshot, command: Command | undefined): ProjectSnapshot {
  if (!command) throw new Error('There is no command to apply.');
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

describe('elementColorCommand', () => {
  it('gives the element a color of its own, as one trait', () => {
    expect(elementColorCommand(elementOf('booking-agent'), 'fill', '#112233', definitions)).toEqual(
      {
        type: 'update-element',
        id: 'booking-agent',
        changes: { appearanceTraits: { fill: '#112233' } },
      },
    );
  });

  it('takes its own color back when the color picked is the one it would show without it', () => {
    // AI agent's fill, which the booking agent's own fill hides.
    expect(elementColorCommand(elementOf('booking-agent'), 'fill', '#ede4ff', definitions)).toEqual(
      {
        type: 'update-element',
        id: 'booking-agent',
        changes: { appearanceTraits: { fill: null } },
      },
    );
  });

  it('changes nothing for the color it already shows, whatever its case', () => {
    expect(
      elementColorCommand(elementOf('booking-agent'), 'fill', '#f8e1ec', definitions),
    ).toBeUndefined();
    expect(
      elementColorCommand(elementOf('patient'), 'stroke', '#8a5a12', definitions),
    ).toBeUndefined();
  });
});

describe('a pick made while an earlier one is on its way', () => {
  it('is sent whatever the project shows, so that it lands after the earlier one', () => {
    expect(
      elementColorCommand(elementOf('booking-agent'), 'fill', '#F8E1EC', definitions, {
        always: true,
      }),
    ).toEqual({
      type: 'update-element',
      id: 'booking-agent',
      changes: { appearanceTraits: { fill: '#F8E1EC' } },
    });
    // The inherited color still takes the element's own back rather than storing a copy.
    expect(
      elementColorCommand(elementOf('patient'), 'stroke', '#8A5A12', definitions, { always: true }),
    ).toEqual({
      type: 'update-element',
      id: 'patient',
      changes: { appearanceTraits: { stroke: null } },
    });
    expect(
      relationColorCommand(relationOf('api-reads-db'), '#3D4651', definitions, { always: true }),
    ).toEqual({
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { appearanceTraits: { stroke: null } },
    });
    expect(
      definitionColorCommand(sample, 'component', 'systems.service', 'fill', '#DCEBFF', undefined, {
        always: true,
      }),
    ).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { fill: null },
    });
    expect(
      freeShapeColorCommand(VIEW, note, 'fill', theme.noteFill, theme, { always: true }),
    ).toEqual({ type: 'update-free-shape', view: VIEW, shape: note });
  });

  it('changes nothing the core would not, so that the local program records nothing', () => {
    const command = elementColorCommand(elementOf('patient'), 'stroke', '#8A5A12', definitions, {
      always: true,
    });
    expect(apply(sample, command)).toEqual(sample);
  });
});

describe('relationColorCommand', () => {
  it('gives one relation a stroke of its own, or takes it back for its relation type’s', () => {
    const reads = relationOf('api-reads-db');
    expect(relationColorCommand(reads, '#D6336C', definitions)).toEqual({
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { appearanceTraits: { stroke: '#D6336C' } },
    });
    expect(relationColorCommand(reads, '#3d4651', definitions)).toBeUndefined();
    const own = { ...reads, appearance: { stroke: '#D6336C', dash: 'dotted' as const } };
    expect(relationColorCommand(own, '#3D4651', definitions)).toEqual({
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { appearanceTraits: { stroke: null } },
    });
  });
});

describe('freeShapeColorCommand', () => {
  it('gives a note a fill and a stroke of its own, keeping the rest of it', () => {
    expect(freeShapeColorCommand(VIEW, note, 'fill', '#E7F5FF', theme)).toEqual({
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...note, fill: '#E7F5FF' },
    });
  });

  it('takes a note’s own color back for the theme’s, or when the theme’s is picked', () => {
    const colored: Note = { ...note, fill: '#E7F5FF', stroke: '#1864AB' };
    expect(freeShapeColorCommand(VIEW, colored, 'fill', null, theme)).toEqual({
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...note, stroke: '#1864AB' },
    });
    expect(freeShapeColorCommand(VIEW, colored, 'stroke', theme.noteStroke, theme)).toEqual({
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...note, fill: '#E7F5FF' },
    });
    expect(freeShapeColorCommand(VIEW, note, 'fill', theme.noteFill, theme)).toBeUndefined();
    expect(freeShapeColorCommand(VIEW, note, 'fill', null, theme)).toBeUndefined();
  });

  it('gives an arrow a stroke, and never a fill', () => {
    expect(freeShapeColorCommand(VIEW, arrow, 'stroke', '#C92A2A', theme)).toEqual({
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...arrow, stroke: '#C92A2A' },
    });
    expect(freeShapeColorCommand(VIEW, arrow, 'fill', '#C92A2A', theme)).toBeUndefined();
  });
});

describe('definitionColorCommand', () => {
  it('gives a built-in component a project appearance, through the core’s routing', () => {
    const command = definitionColorCommand(
      sample,
      'component',
      'systems.service',
      'fill',
      '#FFE3E3',
    );
    expect(command).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { fill: '#FFE3E3' },
    });
    const after = apply(sample, command);
    expect(after.project.appearances).toEqual({
      components: { 'systems.service': { fill: '#FFE3E3' } },
    });
    // Picking the built-in color again takes the project's back instead of storing a copy.
    expect(
      definitionColorCommand(after, 'component', 'systems.service', 'fill', '#dcebff'),
    ).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { fill: null },
    });
    expect(definitionColorCommand(after, 'component', 'systems.service', 'fill', null)).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { fill: null },
    });
    expect(
      definitionColorCommand(sample, 'component', 'systems.service', 'fill', null),
    ).toBeUndefined();
  });

  it('changes a component of the project’s own in its package', () => {
    const command = definitionColorCommand(
      sample,
      'component',
      'clinic.calendar',
      'stroke',
      '#112233',
    );
    const after = apply(sample, command);
    const calendar = after.packages
      .find((file) => file.id === 'clinic')
      ?.components.find((each) => each.id === 'clinic.calendar');
    expect(calendar?.appearance).toEqual({ stroke: '#112233' });
    expect(after.project.appearances).toBeUndefined();
    // Database's stroke, which Calendar inherits: nothing to change.
    expect(
      definitionColorCommand(sample, 'component', 'clinic.calendar', 'stroke', '#7A5C00'),
    ).toBeUndefined();
  });

  it('takes back the inspected element’s own color in the same action, so that it follows', () => {
    const command = definitionColorCommand(
      sample,
      'component',
      'systems.ai-agent',
      'fill',
      '#112233',
      elementOf('booking-agent'),
    );
    expect(command).toEqual({
      type: 'batch',
      label: 'Change the appearance of the component "AI agent"',
      commands: [
        {
          type: 'set-component-appearance',
          component: 'systems.ai-agent',
          appearanceTraits: { fill: '#112233' },
        },
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearanceTraits: { fill: null } },
        },
      ],
    });
    // The component already shows the color: only the element's own goes.
    expect(
      definitionColorCommand(
        sample,
        'component',
        'systems.ai-agent',
        'fill',
        '#EDE4FF',
        elementOf('booking-agent'),
      ),
    ).toEqual({
      type: 'update-element',
      id: 'booking-agent',
      changes: { appearanceTraits: { fill: null } },
    });
  });

  it('gives a built-in relation type a project appearance, and takes a relation’s own back', () => {
    const own = { ...relationOf('api-reads-db'), appearance: { stroke: '#D6336C' } };
    expect(
      definitionColorCommand(
        sample,
        'relation-type',
        'systems.reads-from',
        'stroke',
        '#1D4F91',
        own,
      ),
    ).toEqual({
      type: 'batch',
      label: 'Change the appearance of the relation type "reads from"',
      commands: [
        {
          type: 'set-relation-type-appearance',
          relationType: 'systems.reads-from',
          appearanceTraits: { stroke: '#1D4F91' },
        },
        {
          type: 'update-relation',
          id: 'api-reads-db',
          changes: { appearanceTraits: { stroke: null } },
        },
      ],
    });
    expect(
      definitionColorCommand(sample, 'relation-type', 'systems.reads-from', 'fill', '#1D4F91'),
    ).toBeUndefined();
  });
});

describe('definitionShapeCommand', () => {
  it('gives every element of a component a shape, and the inspected one follows', () => {
    const agent = { ...elementOf('booking-agent'), appearance: { shape: 'ellipse' as const } };
    expect(definitionShapeCommand(sample, 'systems.ai-agent', 'cylinder', agent)).toEqual({
      type: 'batch',
      label: 'Change the appearance of the component "AI agent"',
      commands: [
        {
          type: 'set-component-appearance',
          component: 'systems.ai-agent',
          appearanceTraits: { shape: 'cylinder' },
        },
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearanceTraits: { shape: null } },
        },
      ],
    });
    expect(definitionShapeCommand(sample, 'systems.ai-agent', 'rounded-rectangle')).toBeUndefined();
    expect(definitionShapeCommand(sample, 'systems.ai-agent', null)).toBeUndefined();
    const after = apply(sample, definitionShapeCommand(sample, 'systems.service', 'ellipse'));
    expect(definitionShapeCommand(after, 'systems.service', null)).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { shape: null },
    });
  });
});

describe('a selection’s colors', () => {
  const selection = selectionOf([
    { kind: 'element', id: 'patient' },
    { kind: 'element', id: 'booking-agent' },
    { kind: 'relation', id: 'api-reads-db' },
    { kind: 'free-shape', id: 'calendar-note' },
  ]);

  it('lists the colors shown: fills of elements and notes, strokes of every shape', () => {
    expect(selectionColors(sample, VIEW, selection, 'fill')).toEqual([
      '#FDE8CC',
      '#F8E1EC',
      theme.noteFill,
    ]);
    expect(selectionColors(sample, VIEW, selection, 'stroke')).toEqual([
      '#8A5A12',
      '#5B3A9E',
      '#3D4651',
      theme.noteStroke,
    ]);
  });

  it('recolors every shape it holds in one action', () => {
    const command = selectionColorCommand(sample, VIEW, selection, 'stroke', '#C92A2A');
    expect(command?.type).toBe('batch');
    if (command?.type !== 'batch') return;
    expect(command.label).toBe('Change the appearance of 4 shapes');
    expect(command.commands.map((each) => each.type)).toEqual([
      'update-element',
      'update-element',
      'update-relation',
      'update-free-shape',
    ]);
    const after = apply(sample, command);
    expect(selectionColors(after, VIEW, selection, 'stroke')).toEqual(Array(4).fill('#C92A2A'));
  });

  it('leaves out the shapes that show the color already, and what has no such trait', () => {
    const command = selectionColorCommand(sample, VIEW, selection, 'fill', '#FDE8CC');
    expect(command).toEqual({
      type: 'batch',
      label: 'Change the appearance of 2 shapes',
      commands: [
        {
          type: 'update-element',
          id: 'booking-agent',
          changes: { appearanceTraits: { fill: '#FDE8CC' } },
        },
        { type: 'update-free-shape', view: VIEW, shape: { ...note, fill: '#FDE8CC' } },
      ],
    });
    const one = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'relation', id: 'api-reads-db' },
    ]);
    expect(selectionColorCommand(sample, VIEW, one, 'fill', '#112233')).toEqual({
      type: 'update-element',
      id: 'patient',
      changes: { appearanceTraits: { fill: '#112233' } },
    });
    expect(selectionColorCommand(sample, VIEW, one, 'fill', '#FDE8CC')).toBeUndefined();
  });
});
