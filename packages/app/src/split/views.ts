/** What the panes of a split view say of the views they show (ADR 0102). */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import type { Translator } from '../i18n';
import { showsView, type PaneLayout } from './panes';

/** The view a pane shows: the one it names, or the project's first while it names none or a gone one. */
export function viewOf(project: ProjectSnapshot, view: Id | undefined): ViewFile | undefined {
  return project.views.find((each) => each.id === view) ?? project.views[0];
}

/** The canvas's text alternative: the view, its perspective and how much it draws. */
export function describeDrawing(t: Translator, view: ViewFile, scene: Scene): string {
  const shapes = t(
    { one: '{count} element shape', other: '{count} element shapes' },
    { count: scene.shapes.length },
  );
  const relations = t(
    { one: '{count} relation', other: '{count} relations' },
    { count: scene.relations.length },
  );
  const free = t(
    { one: '{count} free shape', other: '{count} free shapes' },
    { count: scene.notes.length + scene.arrows.length },
  );
  return t('{view}, from the {perspective} perspective: {shapes}, {relations} and {free}.', {
    view: view.name,
    perspective: view.perspective.name,
    shapes,
    relations,
    free,
  });
}

/**
 * The panes that place the new shapes of their view and follow its zoom: of the panes that show one
 * view, the active one, or else the leftmost (ADR 0102).
 */
export function leadingPanes(project: ProjectSnapshot, layout: PaneLayout): ReadonlySet<string> {
  const shown = (view: Id | undefined) => viewOf(project, view)?.id;
  const active = layout.panes.find((pane) => pane.id === layout.active);
  const led = new Map<Id | undefined, string>();
  if (active) led.set(shown(active.view), active.id);
  for (const pane of layout.panes) {
    if (!showsView(pane)) continue;
    const view = shown(pane.view);
    if (!led.has(view)) led.set(view, pane.id);
  }
  return new Set(led.values());
}
