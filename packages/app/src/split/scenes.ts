/**
 * What the panes of a split view share of drawing their views (ADR 0102): one scene for each view,
 * worked out once from the project, the view and the containers it shows expanded, and the places the
 * zoom's expansion gives it. A pane that becomes active, or stops being so, so goes on drawing the same
 * scene, which the canvas neither indexes nor lays out again.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { SharedInPlace, ZoomPlaces } from '../canvas/layout/expand';
import { buildScene, type Scene } from '../canvas/scene';

export class ViewScenes implements SharedInPlace {
  readonly places = new Map<Id, ZoomPlaces>();
  readonly #made = new Map<string, { inputs: readonly unknown[]; value: unknown }>();

  memo<T>(key: string, inputs: readonly unknown[], make: () => T): T {
    const last = this.#made.get(key);
    if (
      last &&
      last.inputs.length === inputs.length &&
      last.inputs.every((input, index) => Object.is(input, inputs[index]))
    ) {
      return last.value as T;
    }
    const value = make();
    this.#made.set(key, { inputs, value });
    return value;
  }

  /**
   * Keeps only what the panes draw: what was worked out for a view no pane shows any longer, as one
   * deleted or closed, goes.
   */
  keep(views: Iterable<Id>): void {
    const shown = new Set(views);
    for (const view of this.places.keys()) if (!shown.has(view)) this.places.delete(view);
    for (const key of this.#made.keys()) {
      if (!shown.has(key.slice(key.indexOf(':') + 1))) this.#made.delete(key);
    }
  }

  /** How many views something is kept for, for tests. */
  get size(): number {
    return new Set([...this.#made.keys()].map((key) => key.slice(key.indexOf(':') + 1))).size;
  }

  /** The scene of a view, the same for every pane that draws it from the same project. */
  scene(project: ProjectSnapshot, view: Id, expanded: ReadonlySet<Id>, language: string): Scene {
    return this.memo(`scene:${view}`, [project, expanded, language], () =>
      buildScene(project, view, expanded),
    );
  }
}
