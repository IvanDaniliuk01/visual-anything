import { executeCommand } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { indexScene } from './hit';
import { createAtCommand, movingShapes, moveCommand, relationChoices } from './gestures';
import { buildScene } from './scene';

const project = loadSample();
const VIEW = 'system-overview';
const indexed = indexScene(buildScene(project, VIEW));

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
