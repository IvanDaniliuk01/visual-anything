/**
 * What the canvas writes, in the language the app reads in (ADR-0038): the detail's built-in
 * component names, what a collapsed container and a collapsed table say they hold, and the names a
 * new element or row takes. The scene is built again in a new language, never kept from another.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { detailOf } from '../canvas/draw';
import { createInsideCommand } from '../canvas/gestures';
import { addRowCommand } from '../canvas/rowCommands';
import { buildScene, type ElementShape, type Scene } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { VIEW, usersAndOrders } from '../test/tables';
import { resetLanguageForTests, setCurrentLanguage } from './language';

afterEach(() => {
  resetLanguageForTests();
});

function shapeOf(scene: Scene, element: string): ElementShape {
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape of ${element}.`);
  return shape;
}

/** The sample with one element of its own whose component is built in, and shows its name. */
function sampleWithService(): ProjectSnapshot {
  const sample = loadSample();
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements,
        { id: 'billing', component: 'systems.service', name: 'Billing' },
      ],
    },
  };
}

describe('the canvas in Spanish', () => {
  it('writes a built-in component’s name in the language read in, and again once it changes', () => {
    const project = sampleWithService();
    const [view] = project.views;
    if (!view) throw new Error('The sample has no view.');
    setCurrentLanguage('es');
    const spanish = shapeOf(buildScene(project, view.id), 'billing');
    expect(spanish.detail).toBe('Servicio');
    setCurrentLanguage('en');
    const english = shapeOf(buildScene(project, view.id), 'billing');
    expect(english.detail).toBe('Service');
    expect(english).not.toBe(spanish);
  });

  it('says what a collapsed table and a collapsed container hold', () => {
    setCurrentLanguage('es');
    const table = shapeOf(buildScene(usersAndOrders({ collapsed: ['users'] }), VIEW), 'users');
    expect(table.fitted?.detail).toBe('3 × Columna');
    expect(detailOf({ ...table, detail: 'Tabla', collapsed: { contents: 3 } })).toBe(
      'Tabla · 3 dentro',
    );
  });

  it('names a new element and a new row after their component, in the language read in', () => {
    setCurrentLanguage('es');
    const sample = loadSample();
    const [view] = sample.views;
    if (!view) throw new Error('The sample has no view.');
    const created = createInsideCommand(sample, view.id, 'systems.service', 'scheduling');
    expect(created).toBeDefined();
    const made = created && executeCommand(sample, created);
    // The label is the core's, in English, with the name the element was given.
    expect(made?.ok && made.label).toBe('Create "Servicio"');

    const tables = usersAndOrders();
    const row = addRowCommand(tables, VIEW, 'users');
    if (!row) throw new Error('No row can be added to "Users".');
    const added = executeCommand(tables, row.command);
    const name =
      added.ok && added.state.model.elements.find((element) => element.id === row.id)?.name;
    expect(name).toBe('Columna');
  });
});
