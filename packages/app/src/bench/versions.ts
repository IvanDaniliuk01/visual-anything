/**
 * Versions of the benchmark's project, for timing comparisons, proposals and merges (ADR 0070, ADR
 * 0072, ADR 0073): a newer version with changes spread over the view, the commands a person and
 * Claude send on top of it, and the two sides of a merge of its model file. Built the same way every
 * time, from `syntheticProject`.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, ModelFile, ShapePosition } from '@visual-anything/schema';
import type { SyntheticOptions } from './synthetic';

/**
 * The reading benchmark's size (M8): 100,000 elements and about 200,000 relations, the nesting ones
 * included, each content starting one relation and a little more.
 */
export const READING_SIZE: SyntheticOptions = { elements: 100_000, relationsPerElement: 1.09 };

/** The view the synthetic project draws everything in. */
const VIEW = 'everything';

/** The elements inside systems, which every change below picks from. */
export function contentsOf(project: ProjectSnapshot): Element[] {
  return project.model.elements.filter((element) => element.component !== 'systems.system');
}

/** `count` elements spread evenly over `elements`, starting `offset` into each stride. */
export function spread<T>(elements: readonly T[], count: number, offset = 0.5): T[] {
  const picked: T[] = [];
  const stride = elements.length / Math.max(1, count);
  for (let each = 0; each < count; each++) {
    const element = elements[Math.floor((each + offset) * stride)];
    if (element !== undefined) picked.push(element);
  }
  return picked;
}

/**
 * The project with `count` changes spread over its view, a quarter of each kind: elements renamed,
 * shapes moved inside their systems, elements added in World with a relation each, and elements
 * removed with the relations that end on them.
 */
export function changedVersion(older: ProjectSnapshot, count = 100): ProjectSnapshot {
  const contents = contentsOf(older);
  const picked = spread(contents, count);
  const view = older.views.find((each) => each.id === VIEW);
  const places = new Map<string, ShapePosition>(
    (view?.positions ?? []).map((position) => [position.element, position]),
  );
  const renamed: Command[] = [];
  const moved: ShapePosition[] = [];
  const added: Command[] = [];
  const removed: string[] = [];
  picked.forEach((element, at) => {
    switch (at % 4) {
      case 0:
        renamed.push({
          type: 'update-element',
          id: element.id,
          changes: { name: `${element.name} (renamed)` },
        });
        break;
      case 1: {
        const place = places.get(element.id);
        if (place) moved.push({ ...place, x: place.x + 40 });
        break;
      }
      case 2: {
        const id = `added-${at}`;
        added.push(
          {
            type: 'create-element',
            element: { id, component: 'systems.service', name: `Added ${at}` },
            positions: [{ view: VIEW, x: -400, y: at * 120 }],
          },
          {
            type: 'create-relation',
            relation: {
              id: `${id}-uses`,
              relationType: 'systems.communicates-with',
              from: id,
              to: element.id,
            },
          },
        );
        break;
      }
      default:
        removed.push(element.id);
    }
  });
  return done(older, {
    type: 'batch',
    label: `Change ${count} things`,
    commands: [
      ...renamed,
      { type: 'set-positions', view: VIEW, positions: moved },
      ...added,
      { type: 'delete', elements: removed },
    ],
  });
}

/** The project with every element but World renamed: a comparison that marks every shape. */
export function renamedEverywhere(older: ProjectSnapshot): ProjectSnapshot {
  return {
    ...older,
    model: {
      ...older.model,
      elements: older.model.elements.map((element) => ({ ...element, name: `${element.name}!` })),
    },
  };
}

/**
 * The person's `run`-th action: a rename of an element away from the changes above and from Claude's
 * proposal, a different one each run.
 */
export function personsRename(project: ProjectSnapshot, run: number): Command {
  const contents = contentsOf(project);
  const element = contents[(Math.abs(run + 1) * 997 + 13) % contents.length] as Element;
  return { type: 'update-element', id: element.id, changes: { name: `${element.name} (now)` } };
}

/**
 * The person's `run`-th move: a shape moved inside its system, a different one each run, as dragging
 * one does.
 */
export function personsMove(project: ProjectSnapshot, run: number): Command {
  const view = project.views.find((each) => each.id === VIEW);
  const positions = (view?.positions ?? []).filter((position) => position.container !== undefined);
  const place = positions[(Math.abs(run + 1) * 991 + 7) % positions.length] as ShapePosition;
  return { type: 'set-positions', view: VIEW, positions: [{ ...place, y: place.y + 8 }] };
}

/**
 * Claude's commands for a proposal of `count` changes: descriptions written, a few elements added in
 * World, and a few removed.
 */
export function claudesCommand(project: ProjectSnapshot, count = 20): Command {
  const picked = spread(contentsOf(project), count, 0.25);
  const commands: Command[] = picked.map((element, at): Command => {
    if (at % 5 === 3) {
      return {
        type: 'create-element',
        element: { id: `proposed-${at}`, component: 'systems.database', name: `Proposed ${at}` },
        positions: [{ view: VIEW, x: -800, y: at * 120 }],
      };
    }
    if (at % 5 === 4) return { type: 'delete', elements: [element.id] };
    return {
      type: 'update-element',
      id: element.id,
      changes: { description: `What ${element.name} does, as Claude reads it.` },
    };
  });
  return { type: 'batch', label: `Claude changes ${count} things`, commands };
}

/**
 * One side of a merge of a model file: `changes` elements edited, each side its own (ours writes
 * descriptions, theirs renames, never the same element), and `additions` elements added at the end.
 */
export function sideOfMerge(
  model: ModelFile,
  side: 'ours' | 'theirs',
  { changes, additions }: { changes: number; additions: number },
): ModelFile {
  const offset = side === 'ours' ? 0.25 : 0.75;
  const edited = new Set(spread(model.elements, changes, offset).map((element) => element.id));
  const elements = model.elements.map((element) =>
    !edited.has(element.id)
      ? element
      : side === 'ours'
        ? { ...element, description: `Ours describes ${element.name}.` }
        : { ...element, name: `${element.name} (theirs)` },
  );
  for (let each = 0; each < additions; each++) {
    elements.push({ id: `${side}-${each}`, component: 'systems.service', name: `${side} ${each}` });
  }
  return { ...model, elements };
}

/** The state after a command, which must apply. */
export function done(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}
