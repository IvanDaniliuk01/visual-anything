/**
 * Where Claude's guidance lands on the open view. Claude names elements, relations and free shapes by
 * their ids; the canvas knows shapes by their keys, and an element has one shape inside each of its
 * containers. These functions turn the one into the other.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import type { Emphasis } from '../editor/emphasis';
import { t as currentT, type Translator } from '../i18n';
import type { GuidanceMarks } from './state';

/** How many names a description gives before it counts the rest. */
const NAMES_SHOWN = 3;

/**
 * What the canvas emphasizes for Claude's marks. A highlight marks the shapes of the targets. A focus
 * marks them too, keeps at full strength the relations that end on a target and what is at their other
 * end, and dims everything else.
 */
export function guidanceEmphasis(
  marks: GuidanceMarks,
  scene: Scene,
  project: ProjectSnapshot,
): Emphasis {
  const targets = new Set(marks.targets);
  const highlighted = new Set(keysOf(targets, scene));
  if (marks.kind === 'highlight') return { highlighted };

  // What stays at full strength: the targets, the relations on them and their other ends.
  const kept = new Set(targets);
  const relations = new Map(project.model.relations.map((relation) => [relation.id, relation]));
  for (const id of targets) {
    const relation = relations.get(id);
    if (relation) kept.add(relation.from).add(relation.to);
  }
  for (const relation of project.model.relations) {
    if (targets.has(relation.from) || targets.has(relation.to)) {
      kept.add(relation.id).add(relation.from).add(relation.to);
    }
  }
  const dimmed = new Set<string>();
  for (const shape of scene.shapes) if (!kept.has(shape.element)) dimmed.add(shape.key);
  for (const line of scene.relations) if (!kept.has(line.relation)) dimmed.add(line.relation);
  for (const note of scene.notes) if (!kept.has(note.id)) dimmed.add(note.id);
  for (const arrow of scene.arrows) if (!kept.has(arrow.id)) dimmed.add(arrow.id);
  return { highlighted, dimmed };
}

/** The key to move the canvas to for a target: its element's first shape, or the relation or free shape. */
export function revealKeyFor(target: Id, scene: Scene): string | undefined {
  const shape = scene.shapes.find((each) => each.element === target);
  if (shape) return shape.key;
  if (scene.relations.some((line) => line.relation === target)) return target;
  if (scene.notes.some((note) => note.id === target)) return target;
  if (scene.arrows.some((arrow) => arrow.id === target)) return target;
  return undefined;
}

/** Claude's marks in words, for the screen reader and the caption's title. */
export function describeMarks(
  marks: GuidanceMarks,
  project: ProjectSnapshot,
  t: Translator = currentT,
): string {
  const names = marks.targets.map((id) => `“${nameOf(id, project, t)}”`);
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  const list =
    more > 0
      ? t('{first} and {count} more', { first: shown.join(', '), count: more })
      : shown.length > 1
        ? t('{first} and {last}', {
            first: shown.slice(0, -1).join(', '),
            last: shown.at(-1) ?? '',
          })
        : (shown[0] ?? '');
  return marks.kind === 'highlight'
    ? t('Claude highlights {list}.', { list })
    : t('Claude focuses on {list}.', { list });
}

/** The keys the scene draws the targets with: every shape of an element, a relation, a free shape. */
function keysOf(targets: ReadonlySet<Id>, scene: Scene): string[] {
  const keys: string[] = [];
  for (const shape of scene.shapes) if (targets.has(shape.element)) keys.push(shape.key);
  for (const line of scene.relations) if (targets.has(line.relation)) keys.push(line.relation);
  for (const note of scene.notes) if (targets.has(note.id)) keys.push(note.id);
  for (const arrow of scene.arrows) if (targets.has(arrow.id)) keys.push(arrow.id);
  return keys;
}

/** What a target is called: an element's or a relation's name, a note's text, or its id. */
function nameOf(id: Id, project: ProjectSnapshot, t: Translator): string {
  const { world, elements, relations } = project.model;
  if (world.id === id) return world.name;
  const element = elements.find((each) => each.id === id);
  if (element) return element.name;
  const relation = relations.find((each) => each.id === id);
  if (relation) return relation.name ?? relationName(relation.from, relation.to, project, t);
  return id;
}

function relationName(from: Id, to: Id, project: ProjectSnapshot, t: Translator): string {
  const name = (id: Id) => project.model.elements.find((each) => each.id === id)?.name ?? id;
  return t('{from} to {to}', { from: name(from), to: name(to) });
}
