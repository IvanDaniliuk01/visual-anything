/**
 * Showing a change on the canvas (ADR 0070): in the open view when it draws it, else in the first
 * view that does, as search does, selecting what it is about and bringing it into sight.
 *
 * While the comparison shows on the canvas, what was removed is shown at its older place and what
 * was added in the newer version: the canvas goes to the drawing that shows it, the comparison, when
 * the one it shows cannot. Otherwise only the project now is drawn, and what is not in it is said to
 * be drawn by no view.
 */
import { showsPart, shownByScope, type Change, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { ComparisonDrawing } from '../../canvas/comparison/scene';
import type { Selectable } from '../../editor/selection';
import type { Translator } from '../../i18n';
import type { GoTo } from '../../view-state/applier';
import { changeTitle, ChangeNames } from './describe';
import type { OpenedChanges } from './store';

/** What a change is about on the canvas: what to select, and the views that may draw it. */
export interface ChangeTarget {
  target?: Selectable;
  /** The only view that draws it, for what belongs to one view. */
  view?: Id;
}

/** What a change selects on the canvas, and the view it belongs to, if it belongs to one. */
export function targetOf(change: Change): ChangeTarget | undefined {
  const { ref } = change;
  switch (ref.kind) {
    case 'element':
      return { target: { kind: 'element', id: ref.id } };
    case 'relation':
      return { target: { kind: 'relation', id: ref.id } };
    case 'position':
      return { target: { kind: 'element', id: ref.element }, view: ref.view };
    case 'route':
      return { target: { kind: 'relation', id: ref.relation }, view: ref.view };
    case 'free-shape':
      return { target: { kind: 'free-shape', id: ref.id }, view: ref.view };
    case 'stacking':
      return { target: { kind: 'element', id: ref.container }, view: ref.view };
    case 'view':
      return { view: ref.view };
    default:
      return undefined;
  }
}

/** What showing a change needs of the shell. */
export interface ShowContext {
  t: Translator;
  /** The project now, which the canvas draws when no comparison shows. */
  project: ProjectSnapshot;
  openViewId: Id | undefined;
  /** The comparison mode, while it shows the comparison of these changes. */
  mode?: {
    drawing: ComparisonDrawing;
    setDrawing(drawing: ComparisonDrawing): void;
  };
  goTo(request: GoTo): void;
  openView(view: Id): void;
  /** Says something to screen readers. */
  say(text: string): void;
}

/** Shows a change on the canvas, or says why it cannot. */
export function showChange(change: Change, changes: OpenedChanges, context: ShowContext): void {
  const { t, mode } = context;
  const names = new ChangeNames(changes.older, changes.newer, changes.comparison);
  const what = changeTitle(t, change, names);
  const aim = targetOf(change);
  if (!aim) {
    context.say(t('{what} is not drawn in any view.', { what }));
    return;
  }
  // While the comparison shows, what was removed is drawn from the older version, and what was added
  // from the newer: the drawing that shows both is the comparison.
  let drawing = mode?.drawing;
  if (mode) {
    const hides =
      (change.status === 'removed' && drawing === 'after') ||
      (change.status === 'added' && drawing === 'before');
    if (hides) {
      drawing = 'comparison';
      mode.setDrawing('comparison');
    }
  }
  const drawn: ProjectSnapshot = !mode
    ? context.project
    : drawing === 'before'
      ? changes.older
      : changes.newer;
  // What was removed is found in the older version's views, which the drawing shows at its older place.
  const holder = mode && change.status === 'removed' ? changes.older : drawn;
  const views = viewsFor(aim, holder).filter((view) =>
    drawn.views.some((each) => each.id === view.id),
  );
  const view = views.find((each) => each.id === context.openViewId) ?? views[0];
  if (!view) {
    context.say(t('{what} is not drawn in any view.', { what }));
    return;
  }
  if (!aim.target) {
    context.openView(view.id);
    context.say(t('Showing {what}.', { what }));
    return;
  }
  context.goTo({
    kind: 'jump',
    view: view.id,
    target: aim.target,
    shown: () => context.say(t('Showing {what}.', { what })),
  });
}

/** The views of a project that draw what a change is about, in the project's order. */
function viewsFor(aim: ChangeTarget, project: ProjectSnapshot): ViewFile[] {
  if (aim.view !== undefined) return project.views.filter((view) => view.id === aim.view);
  const target = aim.target;
  if (!target) return [];
  if (target.kind === 'free-shape') return [];
  // A view draws what its scope shows, as search reads it (ADR-0040).
  return project.views.filter((view) => {
    if (!showsPart(view)) return true;
    const shown = shownByScope(project, view);
    return target.kind === 'element' ? shown.element(target.id) : shown.relation(target.id);
  });
}
