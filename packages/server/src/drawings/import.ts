/**
 * Importing HTML as a drawing outside the app (ADR 0068), as `visual-anything import` does, alone or
 * through the program that runs on the project (ADR 0049), and as the program does for it: the file
 * is made into a drawing by the local program, then stored and shown by the core's one action.
 */
import {
  isDrawingFile,
  mappingChoices,
  modelIndexOf,
  prepareDrawingImport,
  type DrawingTarget,
  type PreparedDrawing,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { MadeDrawing } from './make';

/** The format an import names to read a file as HTML, whatever its name says. */
export const DRAWING_FORMAT = 'html';

/** What the person chose for a drawing: its width, and who shows it. */
export interface DrawingChoices {
  /** The width it is laid out at, in CSS pixels; 800 by default. */
  width?: number;
  /** The component of the new element that shows it; Box by default. */
  component?: Id;
  /** The element that shows it, instead of a new one. */
  element?: Id;
  /** The view a new element is made in. */
  view?: Id;
}

/** Whether an import brings HTML in as a drawing: by the format it names, or by its file's name. */
export function isDrawingImport(request: { name: string; format?: string }): boolean {
  return request.format === undefined
    ? isDrawingFile(request.name)
    : request.format.toLowerCase() === DRAWING_FORMAT;
}

/** Who shows a drawing, as the person chose. */
export function targetOf(choices: DrawingChoices): DrawingTarget {
  if (choices.element !== undefined) return { element: choices.element };
  return {
    ...(choices.component === undefined ? {} : { component: choices.component }),
    ...(choices.view === undefined ? {} : { view: choices.view }),
  };
}

/** The one action that stores and shows a drawing made of a file, against the project as it is. */
export function prepareMadeDrawing(
  state: ProjectSnapshot,
  name: string,
  made: Extract<MadeDrawing, { ok: true }>,
  choices: DrawingChoices,
): PreparedDrawing {
  return prepareDrawingImport(state, { name, svg: made.svg, target: targetOf(choices) });
}

/** What making a drawing gave and what importing it does, line by line, for the command line. */
export function describeDrawing(
  state: ProjectSnapshot,
  name: string,
  made: Extract<MadeDrawing, { ok: true }>,
  prepared: Extract<PreparedDrawing, { ok: true }>,
  choices: DrawingChoices,
): string[] {
  const lines = [
    `Made a drawing of "${name}", ${round(made.width)} × ${round(made.height)} pixels.`,
  ];
  if (made.report.length > 0) {
    lines.push('What making it dropped:');
    for (const line of made.report) lines.push(`  ${line}`);
  }
  const target = targetOf(choices);
  if ('element' in target) {
    const element = modelIndexOf(state).element(target.element);
    lines.push(`It is shown by "${element?.name ?? target.element}" as its drawing.`);
  } else {
    const component = prepared.command.commands.find((each) => each.type === 'create-element');
    const id = component?.type === 'create-element' ? component.element.component : undefined;
    // A built-in component the project starts using with the import is named as well.
    const definition = mappingChoices(state).components.find((each) => each.id === id);
    const view = state.views.find((each) => each.id === target.view);
    lines.push(
      `It is shown by a new element of "${definition?.name ?? id ?? 'Essence'}"${view === undefined ? '' : ` in the view "${view.name}"`}.`,
    );
  }
  return lines;
}

function round(size: number): string {
  return Math.round(size).toLocaleString('en');
}
