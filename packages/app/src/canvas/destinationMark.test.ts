/**
 * The mark of a destination on the canvas (ADR 0056): the scene counts each element's destinations,
 * also through the incremental build, which stays equal to a build from nothing; the mark sits in the
 * bottom left corner of a shape that has one and room for it; and its tooltip says what it opens.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { destinationMarkRect, destinationTitle, onDestinationMark } from './destinationMark';
import { buildScene, buildSceneAfresh, type ElementShape } from './scene';

const VIEW = 'system-overview';
const API = 'appointments-api';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const shapeOf = (project: ProjectSnapshot, element: string) =>
  buildScene(project, VIEW).shapes.find((shape) => shape.element === element);

describe('the scene’s count of destinations', () => {
  it('counts an element’s own attribute that holds a destination', () => {
    const before = loadSample();
    expect(shapeOf(before, API)?.destinations).toBeUndefined();
    const after = run(before, {
      type: 'update-element',
      id: API,
      changes: { attributes: { docs: { url: 'https://docs.example.org/api' } } },
    });
    expect(shapeOf(after, API)?.destinations).toBe(1);
    expect(buildScene(after, VIEW)).toEqual(buildSceneAfresh(after, VIEW));
  });

  it('follows the change through the incremental build', () => {
    const before = loadSample();
    const first = buildScene(before, VIEW);
    const after = run(before, {
      type: 'update-element',
      id: API,
      changes: { attributes: { docs: { view: VIEW } } },
    });
    const next = buildScene(after, VIEW);
    expect(next.shapes.find((shape) => shape.element === API)?.destinations).toBe(1);
    expect(next).toEqual(buildSceneAfresh(after, VIEW));
    // A shape that did not change stays the same object.
    const untouched = first.shapes.find((shape) => shape.element === 'patient');
    expect(next.shapes.find((shape) => shape.element === 'patient')).toBe(untouched);
  });

  it('does not count a value that is not a destination', () => {
    const after = run(loadSample(), {
      type: 'update-element',
      id: API,
      changes: { attributes: { docs: { url: 'javascript:alert(1)' } } },
    });
    expect(shapeOf(after, API)?.destinations).toBeUndefined();
  });
});

const shape = (overrides: Partial<ElementShape> = {}): ElementShape => ({
  key: 'a',
  element: 'a',
  offset: { x: 0, y: 0 },
  positioned: 'placed',
  name: 'A',
  componentName: 'Service',
  kind: 'rectangle',
  fill: '#FFFFFF',
  stroke: '#000000',
  rect: { x: 100, y: 50, width: 160, height: 80 },
  extent: { x: 100, y: 50, width: 160, height: 80 },
  holdsContents: false,
  destinations: 1,
  ...overrides,
});

describe('the mark', () => {
  it('sits in the bottom left corner of a shape that has a destination', () => {
    const mark = destinationMarkRect(shape());
    expect(mark).toEqual({ x: 104, y: 112, width: 14, height: 14 });
    expect(onDestinationMark(shape(), { x: 110, y: 120 })).toBe(true);
    expect(onDestinationMark(shape(), { x: 200, y: 120 })).toBe(false);
  });

  it('is on no shape without a destination, no row, and no shape too small for it', () => {
    expect(destinationMarkRect(shape({ destinations: undefined }))).toBeUndefined();
    expect(destinationMarkRect(shape({ row: 0 }))).toBeUndefined();
    expect(destinationMarkRect(shape({ rowCount: 2 }))).toBeUndefined();
    const small = { x: 0, y: 0, width: 30, height: 20 };
    expect(destinationMarkRect(shape({ rect: small, extent: small }))).toBeUndefined();
  });

  it('says what double-clicking it opens', () => {
    const after = run(loadSample(), {
      type: 'update-element',
      id: API,
      changes: { attributes: { docs: { url: 'https://docs.example.org/api' } } },
    });
    expect(destinationTitle(after, API)).toBe(
      'Double-click, or press Alt+Enter, to open a page of docs.example.org',
    );
    expect(destinationTitle(after, 'patient')).toBe('');
  });
});
