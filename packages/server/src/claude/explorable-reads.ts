/**
 * What Claude reads of explorables (ADR 0107): an explorable's definition, its parameters with their
 * defaults and the values tour steps set, its script libraries, what shows it, and whether its text
 * is held; the explorable an element shows, and the explorable shapes of a view. Pure functions over
 * a project, returning plain JSON for the read tools. Whether the person approved one is the
 * program's to say, and the tools add it.
 */
import {
  MAX_EXPLORABLE_BYTES,
  definitionsIn,
  explorableShownBy,
  explorableTextOf,
  explorableUsers,
  explorablesIn,
  modelIndexOf,
  utf8Length,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  Element,
  ExplorableDefinition,
  ExplorableParameter,
  Id,
} from '@visual-anything/schema';

/** An explorable as Claude reads it, without its text and without whether it is approved. */
export function describeExplorable(state: ProjectSnapshot, id: Id) {
  const defined = explorablesIn(state).explorable(id);
  if (defined === undefined) return undefined;
  const { definition } = defined;
  const catalog = explorablesIn(state);
  const held = explorableTextOf(state, id);
  const bytes = held === undefined ? undefined : utf8Length(held.text);
  return {
    id: definition.id,
    name: definition.name,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    package: defined.package,
    file: `explorables/${definition.file}`,
    api: definition.api,
    ...(definition.scriptLibraries === undefined
      ? {}
      : {
          scriptLibraries: definition.scriptLibraries.map((library) => {
            const each = catalog.scriptLibrary(library)?.definition;
            return each === undefined
              ? { id: library, missing: true }
              : { id: each.id, npm: each.npm, version: each.version, global: each.global };
          }),
        }),
    parameters: (definition.parameters ?? []).map(parameterRead),
    // Its text, as the project holds it: read_explorable gives it whole.
    text:
      bytes === undefined
        ? 'missing: its file was not found or could not be read'
        : bytes > MAX_EXPLORABLE_BYTES
          ? `too large: ${bytes} bytes, past 512 KiB, so it never runs`
          : `${bytes} bytes`,
    shownBy: shownBy(state, definition.id),
    ...nonEmpty('tourSteps', tourStepsShowing(state, definition)),
  };
}

/** A parameter as Claude reads it: its kind, range or choices, and its default. */
function parameterRead(parameter: ExplorableParameter) {
  switch (parameter.kind) {
    case 'number':
    case 'integer':
      return {
        name: parameter.name,
        kind: parameter.kind,
        ...(parameter.label === undefined ? {} : { label: parameter.label }),
        min: parameter.min,
        max: parameter.max,
        default: parameter.default,
      };
    case 'boolean':
      return {
        name: parameter.name,
        kind: parameter.kind,
        ...(parameter.label === undefined ? {} : { label: parameter.label }),
        default: parameter.default,
      };
    case 'choice':
      return {
        name: parameter.name,
        kind: parameter.kind,
        ...(parameter.label === undefined ? {} : { label: parameter.label }),
        choices: parameter.choices,
        default: parameter.default,
      };
  }
}

/** What shows an explorable: components, elements and explorable shapes, each by id and kind. */
function shownBy(state: ProjectSnapshot, explorable: Id) {
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  const shapes = new Map<Id, Id>();
  for (const view of state.views) {
    for (const shape of view.freeShapes) {
      if (shape.kind === 'explorable') shapes.set(shape.id, view.id);
    }
  }
  return explorableUsers(state, explorable).map((id) => {
    const view = shapes.get(id);
    if (view !== undefined) return { kind: 'shape' as const, id, view };
    const element =
      index.element(id) ?? (state.model.world.id === id ? state.model.world : undefined);
    if (element !== undefined) return { kind: 'element' as const, id, name: element.name };
    return {
      kind: 'component' as const,
      id,
      ...(definitions.component(id) === undefined ? {} : { name: definitions.component(id)?.name }),
    };
  });
}

/** The tour steps that show an explorable, each with the values it sets. */
function tourStepsShowing(state: ProjectSnapshot, definition: ExplorableDefinition) {
  return state.tours.flatMap((tour) =>
    tour.steps.flatMap((step, at) =>
      step.explorable?.id === definition.id
        ? [
            {
              tour: tour.id,
              step: step.id,
              number: at + 1,
              parameters: step.explorable.parameters ?? {},
            },
          ]
        : [],
    ),
  );
}

/**
 * The explorable an element shows, from its own appearance or its component's, with where it comes
 * from; and the explorable shapes bound to it. Nothing when it has neither.
 */
export function elementExplorable(state: ProjectSnapshot, element: Element) {
  const definitions = definitionsIn(state);
  const id = explorableShownBy(element, definitions);
  const shapes = state.views.flatMap((view) =>
    view.freeShapes.flatMap((shape) =>
      shape.kind === 'explorable' && shape.element === element.id
        ? [{ view: view.id, shape: shape.id, explorable: shape.explorable }]
        : [],
    ),
  );
  const loose = shapes.length === 0 ? {} : { explorableShapes: shapes };
  if (id === undefined) return loose;
  const from = element.appearance?.explorable === undefined ? 'component' : 'element';
  const described = describeExplorable(state, id);
  return {
    explorable:
      described === undefined
        ? { id, from, missing: 'No package in use defines it, so the element shows none.' }
        : { ...described, from },
    ...loose,
  };
}

/** A view's explorable shapes as read_view lists them; nothing when it has none. */
export function explorableShapesAnswer(
  state: ProjectSnapshot,
  view: ProjectSnapshot['views'][number],
) {
  const catalog = explorablesIn(state);
  const index = modelIndexOf(state);
  const shapes = view.freeShapes.flatMap((shape) => (shape.kind === 'explorable' ? [shape] : []));
  if (shapes.length === 0) return {};
  return {
    explorables: shapes.map((shape) => {
      const defined = catalog.explorable(shape.explorable);
      return {
        id: shape.id,
        explorable: shape.explorable,
        name: shape.name ?? defined?.definition.name ?? shape.explorable,
        ...(defined === undefined ? { missing: 'No package in use defines it.' } : {}),
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        ...(shape.element === undefined
          ? {}
          : {
              element: shape.element,
              elementName: index.element(shape.element)?.name ?? shape.element,
            }),
      };
    }),
  };
}

function nonEmpty<T>(key: string, list: readonly T[]): Record<string, readonly T[]> {
  return list.length === 0 ? {} : { [key]: list };
}
