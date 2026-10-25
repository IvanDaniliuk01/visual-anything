/**
 * What a project's overlays break as read from its files (ADR 0055). Overlay ids repeated in one view
 * keep it from opening, since commands name overlays by them; anything else only warns, and the
 * canvas reads the overlay as best it can: a fill on relations sets nothing, stops out of order are
 * read in order, and of two cases for one value the first is used.
 */
import type { Id, Overlay, ViewFile } from '@visual-anything/schema';
import type { Definitions } from '../definitions';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { meetsCondition } from '../conditions';

/** The errors and warnings of every view's overlays. */
export function overlayProblems(state: ProjectSnapshot): {
  errors: Problem[];
  warnings: Problem[];
} {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  if (!state.views.some((view) => view.overlays !== undefined)) return { errors, warnings };
  const definitions = definitionsIn(state);
  const held = heldAttributes(state);
  for (const view of state.views) {
    const seen = new Set<Id>();
    const reported = new Set<Id>();
    for (const overlay of view.overlays ?? []) {
      if (seen.has(overlay.id) && !reported.has(overlay.id)) {
        reported.add(overlay.id);
        errors.push(
          problem(
            'id-taken',
            `More than one overlay in the view "${view.name}" has the id "${overlay.id}".`,
            [view.id],
          ),
        );
      }
      seen.add(overlay.id);
      warnings.push(...overlayWarnings(overlay, view, definitions, held));
    }
  }
  return { errors, warnings };
}

/** What one overlay breaks that only warns. */
function overlayWarnings(
  overlay: Overlay,
  view: ViewFile,
  definitions: Definitions,
  held: { elements: ReadonlySet<string>; relations: ReadonlySet<string> },
): Problem[] {
  const warnings: Problem[] = [];
  const name = overlay.name ?? overlay.attribute;
  const of = `the overlay "${name}" of the view "${view.name}"`;
  const warn = (code: Problem['code'], message: string) =>
    warnings.push(problem(code, message, [view.id]));
  if (overlay.of === 'relations' && overlay.channel === 'fill') {
    warn(
      'invalid-overlay',
      `${capitalized(of)} fills relations, which have no fill; it changes nothing.`,
    );
  }
  const mapping = overlay.mapping;
  if (mapping.kind === 'continuous') {
    const stops = mapping.stops as readonly { at: number }[];
    if (stops.some((stop, at) => at > 0 && stop.at <= (stops[at - 1] as { at: number }).at)) {
      warn(
        'invalid-overlay',
        `The stops of ${of} do not go up; they are read in order of where they are.`,
      );
    }
  } else if (mapping.kind === 'discrete') {
    const values = (mapping.cases as readonly { value: string }[]).map((each) => each.value);
    const twice = values.find((value, at) =>
      values.slice(0, at).some((before) => meetsCondition(value, 'is', before)),
    );
    if (twice !== undefined) {
      warn('invalid-overlay', `${capitalized(of)} maps "${twice}" twice; the first is used.`);
    }
  }
  if (!defines(definitions, overlay) && !held[overlay.of].has(overlay.attribute)) {
    warn(
      'unknown-attribute',
      overlay.of === 'elements'
        ? `${capitalized(of)} reads "${overlay.attribute}", which no element has; it changes nothing.`
        : `${capitalized(of)} reads "${overlay.attribute}", which no relation has; it changes nothing.`,
    );
  }
  return warnings;
}

/** Whether a definition in use defines the attribute an overlay reads, for what it reads it of. */
export function defines(
  definitions: Definitions,
  overlay: Pick<Overlay, 'of' | 'attribute'>,
): boolean {
  if (overlay.of === 'elements') {
    for (const id of definitions.components.keys()) {
      if (definitions.component(id)?.attributes.some((each) => each.name === overlay.attribute)) {
        return true;
      }
    }
    return false;
  }
  for (const id of definitions.relationTypes.keys()) {
    if (definitions.relationType(id)?.attributes.some((each) => each.name === overlay.attribute)) {
      return true;
    }
  }
  return false;
}

const heldMaps = new WeakMap<
  ProjectSnapshot['model'],
  { elements: ReadonlySet<string>; relations: ReadonlySet<string> }
>();

/** The names of the attributes some element, and some relation, of the model holds itself. */
export function heldAttributes(state: ProjectSnapshot): {
  elements: ReadonlySet<string>;
  relations: ReadonlySet<string>;
} {
  let held = heldMaps.get(state.model);
  if (!held) {
    const elements = new Set<string>();
    const relations = new Set<string>();
    for (const element of [state.model.world, ...state.model.elements]) {
      for (const name of Object.keys(element.attributes ?? {})) elements.add(name);
    }
    for (const relation of state.model.relations) {
      for (const name of Object.keys(relation.attributes ?? {})) relations.add(name);
    }
    held = { elements, relations };
    heldMaps.set(state.model, held);
  }
  return held;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
