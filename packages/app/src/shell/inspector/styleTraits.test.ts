import {
  appearanceOf,
  definitionsIn,
  executeCommand,
  resolveDrawing,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import {
  borderHints,
  borderlessHints,
  componentStyleCommand,
  elementsStyleCommand,
  gradientColorFor,
  lineStyleValues,
  numberProblem,
  projectDefaultCommand,
  projectLineDefaultCommand,
  relationTypeStyleCommand,
  relationsStyleCommand,
  selectionStyleCommand,
  shapeStyleValues,
  sharedValue,
} from './styleTraits';

const sample = loadSample();
const drawing = resolveDrawing(undefined, undefined);

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

function element(project: ProjectSnapshot, id: string): Element {
  const found = project.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(id);
  return found;
}

const api = element(sample, 'appointments-api');
const reminders = element(sample, 'reminder-service');
const first = sample.model.relations[0] as Relation;
const second = sample.model.relations[1] as Relation;

describe('what the Style tab shows', () => {
  it('reads the drawing defaults where no appearance sets a trait', () => {
    const values = shapeStyleValues(appearanceOf(api, definitionsIn(sample)), drawing);
    expect(values).toEqual({
      borderWidth: drawing.shapes.borderWidth,
      dash: 'solid',
      cornerRadius: drawing.shapes.cornerRadius,
      opacity: 1,
      shadow: drawing.shapes.shadow,
      gradient: 'none',
    });
  });

  it('reads what appearances set', () => {
    const project = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: {
        appearanceTraits: {
          borderWidth: 3,
          opacity: 0.5,
          gradient: { to: '#3E63DD', direction: 'down' },
        },
      },
    });
    const values = shapeStyleValues(
      appearanceOf(element(project, 'appointments-api'), definitionsIn(project)),
      drawing,
    );
    expect(values).toMatchObject({
      borderWidth: 3,
      opacity: 0.5,
      gradient: { to: '#3E63DD', direction: 'down' },
    });
  });

  it('draws a built-in line at the drawing defaults’ width', () => {
    expect(lineStyleValues(first, definitionsIn(sample), drawing)).toMatchObject({
      width: drawing.lines.width,
      opacity: 1,
    });
  });

  it('says whether items share a value, a gradient by its color and direction', () => {
    expect(sharedValue([])).toBeUndefined();
    expect(sharedValue([2, 2])).toEqual({ value: 2, mixed: false });
    expect(sharedValue([2, 3])).toEqual({ value: 2, mixed: true });
    expect(
      sharedValue([
        { to: '#3e63dd', direction: 'down' },
        { to: '#3E63DD', direction: 'down' },
      ])?.mixed,
    ).toBe(false);
    expect(sharedValue(['none', { to: '#3E63DD', direction: 'down' }])?.mixed).toBe(true);
  });

  it('takes numbers in their range only', () => {
    const range = { least: 0, most: 16 };
    expect(numberProblem('4', range)).toBeUndefined();
    expect(numberProblem('0', range)).toBeUndefined();
    expect(numberProblem('17', range)).toBe('Write a number from 0 to 16.');
    expect(numberProblem('', range)).toBeDefined();
    expect(numberProblem('a', range)).toBeDefined();
  });

  it('turns a gradient on to white, or to gray on a white fill', () => {
    expect(gradientColorFor('#DCEBFF')).toBe('#FFFFFF');
    expect(gradientColorFor('#ffffff')).toBe('#7D7D7D');
  });
});

describe('the commands', () => {
  it('sets a trait on one element alone, and on several in one batch that one undo takes back', () => {
    expect(elementsStyleCommand([api], { dash: 'dotted' })).toEqual({
      type: 'update-element',
      id: 'appointments-api',
      changes: { appearanceTraits: { dash: 'dotted' } },
    });
    const both = elementsStyleCommand([api, reminders], { opacity: 0.4 });
    expect(both).toMatchObject({ type: 'batch', label: 'Change the style of 2 shapes' });
    const project = applied(sample, both as Command);
    for (const id of ['appointments-api', 'reminder-service']) {
      expect(element(project, id).appearance?.opacity).toBe(0.4);
    }
    expect(elementsStyleCommand([], { opacity: 0.4 })).toBeUndefined();
  });

  it('sets a line trait on several relations, and shapes and lines together in one batch', () => {
    expect(relationsStyleCommand([first, second], { width: 3 })).toMatchObject({
      type: 'batch',
      label: 'Change the style of 2 lines',
    });
    const together = selectionStyleCommand([api], { dash: 'dashed' }, [first], { dash: 'dashed' });
    expect(together).toMatchObject({ type: 'batch' });
    expect((together as { commands: Command[] }).commands).toHaveLength(2);
    const project = applied(sample, together as Command);
    expect(element(project, 'appointments-api').appearance?.dash).toBe('dashed');
    expect(project.model.relations[0]?.appearance?.dash).toBe('dashed');
  });

  it('sets a trait on a component, taking back the element’s own in the same action', () => {
    expect(componentStyleCommand(sample, 'systems.service', { cornerRadius: 12 }, api)).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { cornerRadius: 12 },
    });
    const own = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: { appearanceTraits: { cornerRadius: 4 } },
    });
    const command = componentStyleCommand(
      own,
      'systems.service',
      { cornerRadius: 12 },
      element(own, 'appointments-api'),
    );
    expect(command).toMatchObject({ type: 'batch' });
    const project = applied(own, command);
    expect(element(project, 'appointments-api').appearance?.cornerRadius).toBeUndefined();
    expect(
      appearanceOf(element(project, 'reminder-service'), definitionsIn(project)).cornerRadius,
    ).toBe(12);
  });

  it('sets a trait on a relation type, taking back the relation’s own', () => {
    const own = applied(sample, {
      type: 'update-relation',
      id: first.id,
      changes: { appearanceTraits: { opacity: 0.5 } },
    });
    const inspected = own.model.relations[0] as Relation;
    const command = relationTypeStyleCommand(
      own,
      inspected.relationType,
      { opacity: 0.7 },
      inspected,
    );
    const project = applied(own, command);
    expect(project.model.relations[0]?.appearance?.opacity).toBeUndefined();
  });

  it('makes an element’s own style the project’s default, as a project appearance of Essence', () => {
    expect(projectDefaultCommand(api)).toBeUndefined();
    const own = applied(sample, {
      type: 'update-element',
      id: 'appointments-api',
      changes: { appearanceTraits: { shadow: 'soft', borderWidth: 2, fill: '#FFFFFF' } },
    });
    const command = projectDefaultCommand(element(own, 'appointments-api'));
    expect(command).toEqual({
      type: 'set-component-appearance',
      component: 'essence',
      appearanceTraits: { borderWidth: 2, shadow: 'soft' },
    });
    const project = applied(own, command as Command);
    // Every shape whose component sets none of them draws them.
    const other = appearanceOf(element(project, 'whatsapp'), definitionsIn(project));
    expect([other.shadow, other.borderWidth]).toEqual(['soft', 2]);
  });

  it('makes a relation’s own line the project’s default, as a project appearance of relates to', () => {
    expect(projectLineDefaultCommand(first)).toBeUndefined();
    expect(
      projectLineDefaultCommand({ ...first, appearance: { opacity: 0.6, dash: 'dotted' } }),
    ).toEqual({
      type: 'set-relation-type-appearance',
      relationType: 'relates-to',
      appearanceTraits: { dash: 'dotted', opacity: 0.6 },
    });
  });
});

describe('the contrast hints of a border', () => {
  const pale = { fill: '#FFFFFF', stroke: '#F4F4F4' } as const;
  const dark = { fill: '#16191E', stroke: '#1C2026' } as const;

  it('points out a border that shows neither on the canvas nor on its fill', () => {
    expect(borderHints({ light: pale, dark }, 1)).toEqual([
      expect.stringMatching(/^Its border hardly shows on the light canvas/),
      expect.stringMatching(/^Its border hardly shows on the dark canvas/),
    ]);
    expect(borderHints({ light: pale, dark }, 0)).toEqual([]);
    expect(
      borderHints(
        {
          light: { fill: '#FFFFFF', stroke: '#3E63DD' },
          dark: { fill: '#16191E', stroke: '#3E63DD' },
        },
        1,
      ),
    ).toEqual([]);
  });

  it('points out a shape with no border whose fill blends into the canvas, its gradient counted', () => {
    expect(borderlessHints({ light: pale, dark }, undefined)).toHaveLength(2);
    expect(borderlessHints({ light: pale, dark }, '#3E63DD')).toEqual([]);
  });
});
