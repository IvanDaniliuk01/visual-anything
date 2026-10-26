/**
 * Where Claude's guidance lands on the open view. Claude names elements, relations and free shapes by
 * their ids; the canvas knows shapes by their keys, and an element has one shape inside each of its
 * containers. These functions turn the one into the other. What a collapsed container hides is shown
 * by what the canvas draws for it, as playback shows it (ADR 0031): an element by the outermost
 * collapsed container that holds it, a relation by the aggregated relation that stands for it, or by
 * the shapes that show its ends when it runs wholly inside.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { relationLinesOf, shownBy, standsFor, type Scene } from '../canvas/scene';
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
  const highlighted = new Set(keysOf(targets, scene, project));
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
  // A collapsed container that shows something kept stays at full strength with it.
  const keptShapes = new Set<string>();
  for (const id of kept) {
    const shape = shownBy(scene, id);
    if (shape && shape.element !== id) keptShapes.add(shape.key);
  }
  const dimmed = new Set<string>();
  for (const shape of scene.shapes) {
    if (!kept.has(shape.element) && !keptShapes.has(shape.key)) dimmed.add(shape.key);
  }
  for (const line of scene.relations) {
    if (!standsFor(line).some((id) => kept.has(id))) dimmed.add(line.relation);
  }
  for (const note of scene.notes) if (!kept.has(note.id)) dimmed.add(note.id);
  for (const arrow of scene.arrows) if (!kept.has(arrow.id)) dimmed.add(arrow.id);
  return { highlighted, dimmed };
}

/**
 * The key to move the canvas to for a target: its element's first shape, or the collapsed container
 * that shows it; a relation's line, or the aggregated relation that stands for it, or the shape that
 * shows its from end; or the free shape.
 */
export function revealKeyFor(
  target: Id,
  scene: Scene,
  project: ProjectSnapshot,
): string | undefined {
  const shape = shownBy(scene, target);
  if (shape) return shape.key;
  const line = relationLinesOf(scene).get(target);
  if (line) return line.relation;
  const [end] = shownEndsOf(target, scene, project);
  if (end !== undefined) return end;
  if (scene.notes.some((note) => note.id === target)) return target;
  if (scene.arrows.some((arrow) => arrow.id === target)) return target;
  return undefined;
}

/**
 * Claude's marks in words, for the screen reader and the caption's title. Given the scene, it names
 * and counts only the targets the view shows, directly or through what stands for them.
 */
export function describeMarks(
  marks: GuidanceMarks,
  project: ProjectSnapshot,
  t: Translator = currentT,
  scene?: Scene,
): string {
  const targets =
    scene === undefined
      ? marks.targets
      : marks.targets.filter((id) => keysOf(new Set([id]), scene, project).length > 0);
  if (targets.length === 0) {
    return marks.kind === 'highlight'
      ? t('Claude highlights nothing this view shows.')
      : t('Claude focuses on nothing this view shows.');
  }
  const names = targets.map((id) => `“${nameOf(id, project, t)}”`);
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

/**
 * The keys the canvas shows the targets with: every shape of an element, or the collapsed container
 * that shows it; a relation by its id, which reaches the aggregated relation that stands for it, or,
 * when it runs wholly inside a collapsed container, the shapes that show its ends; a free shape.
 */
function keysOf(targets: ReadonlySet<Id>, scene: Scene, project: ProjectSnapshot): string[] {
  const keys = new Set<string>();
  for (const shape of scene.shapes) if (targets.has(shape.element)) keys.add(shape.key);
  const lines = relationLinesOf(scene);
  for (const target of targets) {
    const holder = shownBy(scene, target);
    if (holder) keys.add(holder.key);
    else if (lines.has(target)) keys.add(target);
    else for (const end of shownEndsOf(target, scene, project)) keys.add(end);
  }
  for (const note of scene.notes) if (targets.has(note.id)) keys.add(note.id);
  for (const arrow of scene.arrows) if (targets.has(arrow.id)) keys.add(arrow.id);
  return [...keys];
}

/** For a relation the view draws no line of, the keys of the shapes that show its element ends. */
function shownEndsOf(target: Id, scene: Scene, project: ProjectSnapshot): string[] {
  const relation = modelIndexOf(project).relation(target);
  if (!relation) return [];
  return [relation.from, relation.to].flatMap((end) => {
    const shape = shownBy(scene, end);
    return shape ? [shape.key] : [];
  });
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
