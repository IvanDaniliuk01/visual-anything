import { describe, expect, it } from 'vitest';
import type { Element, ImageDefinition } from '@visual-anything/schema';
import { executeCommand } from '../commands';
import type { BatchCommand, Command } from '../commands/types';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import {
  DRAWING_COMPONENT,
  DRAWING_LIMITS,
  drawingBaseName,
  drawingShapeSize,
  prepareDrawingImport,
} from './drawing';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const CARD = `<svg ${NS} viewBox="0 0 800 450"><path d="M0 0h800v450H0z" fill="#FFFFFF"/><path d="M10 10h100v20H10z" fill="#1D4F91"/></svg>`;

function withOwnPackageGone(state: ProjectSnapshot): ProjectSnapshot {
  // The test package is the project's own: keep it, but as a built-in-free project of no own package.
  return { ...state, project: { ...state.project, packages: [] }, packages: [] };
}

function run(state: ProjectSnapshot, command: Command) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function commandsOf(command: BatchCommand): Command[] {
  return command.commands;
}

describe('prepareDrawingImport', () => {
  it('makes a new Box named after the file, sized to the drawing, as one action', () => {
    const state = testProject();
    const prepared = prepareDrawingImport(
      state,
      { name: 'pricing.html', svg: CARD, target: { view: 'overview' } },
      sequentialIds(),
    );
    if (!prepared.ok) throw new Error(prepared.problems.join(' '));
    expect(prepared.command.label).toBe('Import "pricing.html" as a drawing');
    const types = commandsOf(prepared.command).map((each) => each.type);
    // The project starts using Systems, whose Box the new element is made from.
    expect(types).toEqual(['update-project', 'define-image', 'create-element']);
    const outcome = run(state, prepared.command);
    expect(outcome.label).toBe('Import "pricing.html" as a drawing');
    expect(outcome.state.project.packages).toEqual(['test', 'systems']);
    const image = outcome.state.packages
      .find((each) => each.id === 'test')
      ?.images?.find((each) => each.id === prepared.image) as ImageDefinition;
    expect(image).toMatchObject({ kind: 'svg', name: 'pricing', source: 'pricing.html' });
    const element = outcome.state.model.elements.at(-1) as Element;
    expect(element).toMatchObject({ component: DRAWING_COMPONENT, name: 'pricing' });
    expect(element.appearance).toEqual({
      image: { image: prepared.image, placement: 'drawing' },
      ...drawingShapeSize(800, 450),
    });
    expect(outcome.created).toContain(element.id);
  });

  it('is undone whole by its inverse', () => {
    const state = testProject();
    const prepared = prepareDrawingImport(state, { name: 'card.htm', svg: CARD }, sequentialIds());
    if (!prepared.ok) throw new Error(prepared.problems.join(' '));
    const outcome = run(state, prepared.command);
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });

  it('shows the drawing on the element asked for, keeping its size', () => {
    const state = testProject();
    const prepared = prepareDrawingImport(
      state,
      { name: 'legend.html', svg: CARD, target: { element: 'api' } },
      sequentialIds(),
    );
    if (!prepared.ok) throw new Error(prepared.problems.join(' '));
    expect(commandsOf(prepared.command).map((each) => each.type)).toEqual([
      'define-image',
      'update-element',
    ]);
    const outcome = run(state, prepared.command);
    const api = outcome.state.model.elements.find((each) => each.id === 'api') as Element;
    expect(api.appearance).toEqual({ image: { image: prepared.image, placement: 'drawing' } });
    expect(prepared.element).toBe('api');
  });

  it('makes the new element from the component asked for', () => {
    const state = testProject();
    const prepared = prepareDrawingImport(
      state,
      { name: 'db.html', svg: CARD, target: { component: 'test.database' } },
      sequentialIds(),
    );
    if (!prepared.ok) throw new Error(prepared.problems.join(' '));
    expect(commandsOf(prepared.command).map((each) => each.type)).toEqual([
      'define-image',
      'create-element',
    ]);
    const outcome = run(state, prepared.command);
    expect(outcome.state.model.elements.at(-1)?.component).toBe('test.database');
  });

  it('makes a package named after the project when it has none of its own', () => {
    const state = withOwnPackageGone(testProject());
    const prepared = prepareDrawingImport(
      state,
      { name: 'card.html', svg: CARD, target: { component: 'essence' } },
      sequentialIds(),
    );
    if (!prepared.ok) throw new Error(prepared.problems.join(' '));
    const first = commandsOf(prepared.command)[0];
    expect(first).toEqual({
      type: 'create-package',
      package: { id: 'test-project', name: 'Test project' },
    });
    const outcome = run(state, prepared.command);
    expect(outcome.state.packages.map((each) => each.id)).toEqual(['test-project']);
  });

  it('shows a picture the package already holds by its id, defining nothing again', () => {
    const first = prepareDrawingImport(
      testProject(),
      { name: 'card.html', svg: CARD },
      sequentialIds(),
    );
    if (!first.ok) throw new Error(first.problems.join(' '));
    const state = run(testProject(), first.command).state;
    const again = prepareDrawingImport(
      state,
      { name: 'card.html', svg: CARD, target: { element: 'db' } },
      sequentialIds(),
    );
    if (!again.ok) throw new Error(again.problems.join(' '));
    expect(again.image).toBe(first.image);
    expect(commandsOf(again.command).map((each) => each.type)).toEqual(['update-element']);
  });

  it('refuses an element, a component or a view the project does not have', () => {
    const state = testProject();
    const refused = (target: object) => {
      const prepared = prepareDrawingImport(state, { name: 'a.html', svg: CARD, target });
      return prepared.ok ? [] : prepared.problems;
    };
    expect(refused({ element: 'nothing' })).toEqual(['There is no element "nothing".']);
    expect(refused({ component: 'nothing' })).toEqual([
      'No component "nothing" is defined by the project or a built-in package.',
    ]);
    expect(refused({ view: 'nothing' })).toEqual(['There is no view "nothing".']);
  });

  it('refuses what the core refuses, such as a picture past the caps', () => {
    const paths = Array.from({ length: 21_000 }, (_, at) => `M${at} 0h1`).join('');
    const huge = `<svg ${NS} viewBox="0 0 100 100"><path d="${paths}"/></svg>`;
    const prepared = prepareDrawingImport(testProject(), { name: 'big.html', svg: huge });
    expect(prepared.ok).toBe(false);
  });
});

describe('drawingShapeSize', () => {
  it('draws a drawing at half its CSS pixels, on a plate above a name band', () => {
    expect(drawingShapeSize(800, 450)).toEqual({ width: 408, height: 253 });
  });

  it('keeps pictures from growing past 480 units wide or shrinking below 48', () => {
    expect(drawingShapeSize(2000, 1000)).toEqual({ width: 488, height: 268 });
    expect(drawingShapeSize(64, 64)).toEqual({ width: 56, height: 76 });
  });
});

describe('drawingBaseName', () => {
  it('is the file name without its ending, or "Drawing"', () => {
    expect(drawingBaseName('pricing.html')).toBe('pricing');
    expect(drawingBaseName('Status Panel.HTM')).toBe('Status Panel');
    expect(drawingBaseName('.html')).toBe('Drawing');
    expect(drawingBaseName('x'.repeat(300))).toHaveLength(200);
  });
});

describe('DRAWING_LIMITS', () => {
  it('are those of ADR 0068', () => {
    expect(DRAWING_LIMITS).toEqual({
      input: 512 * 1024,
      width: { least: 64, most: 2000, initial: 800 },
      height: 4000,
    });
  });
});
