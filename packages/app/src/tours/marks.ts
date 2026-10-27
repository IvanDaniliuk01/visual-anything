/**
 * What a tour's step marks on the canvas (ADR 0077): its marks and those of the reveals shown so far,
 * in the keys the scene draws them with, and what `dimRest` dims: everything the step does not mark
 * but the ends of the relations it marks.
 */
import { modelIndexOf, type PlayableStep, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { shownBy, standsFor, type Scene } from '../canvas/scene';
import { guidanceEmphasis } from '../guidance/targets';

/** What a step marks with `reveal` of its reveals shown: its marks, then theirs, each once. */
export function shownMarks(playable: PlayableStep, reveal: number): Id[] {
  const revealed = (playable.reveals ?? []).slice(0, Math.max(0, reveal));
  return [...new Set([...playable.marks, ...revealed.flatMap((each) => each.marks)])];
}

const NONE: ReadonlySet<string> = new Set();

/** The keys the scene draws marks with, as Claude's highlight names them. */
export function keysOfMarks(
  marks: readonly Id[],
  scene: Scene,
  project: ProjectSnapshot,
): ReadonlySet<string> {
  if (marks.length === 0) return NONE;
  return (
    guidanceEmphasis({ kind: 'highlight', targets: [...marks], request: 0 }, scene, project)
      .highlighted ?? NONE
  );
}

/**
 * What a step with `dimRest` dims (ADR 0077): every shape, line and free shape the scene draws but
 * what it marks and the ends of the relations it marks. What shows one of those instead stays at
 * full strength with it: the collapsed container that holds it, the aggregated relation that stands
 * for it. Unlike focus, the relations on a marked element stay dimmed.
 */
export function dimRestOf(
  marks: readonly Id[],
  scene: Scene,
  project: ProjectSnapshot,
): ReadonlySet<string> {
  const kept = new Set<Id>(marks);
  const index = modelIndexOf(project);
  for (const id of marks) {
    const relation = index.relation(id);
    if (relation) kept.add(relation.from).add(relation.to);
  }
  const holders = new Set<string>();
  for (const id of kept) {
    const shape = shownBy(scene, id);
    if (shape && shape.element !== id) holders.add(shape.key);
  }
  const dimmed = new Set<string>();
  for (const shape of scene.shapes) {
    if (!kept.has(shape.element) && !holders.has(shape.key)) dimmed.add(shape.key);
  }
  for (const line of scene.relations) {
    if (!kept.has(line.relation) && !standsFor(line).some((id) => kept.has(id))) {
      dimmed.add(line.relation);
    }
  }
  for (const note of scene.notes) if (!kept.has(note.id)) dimmed.add(note.id);
  for (const arrow of scene.arrows) if (!kept.has(arrow.id)) dimmed.add(arrow.id);
  return dimmed;
}
