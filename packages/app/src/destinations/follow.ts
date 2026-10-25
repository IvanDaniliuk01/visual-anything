/**
 * What following a destination does (ADR 0056), worked out before anything opens: a view of this
 * project opens at once in this tab, its elements selected and in sight; another project and a web
 * address open only after the person agrees, in a dialog that names the folder or the host. Each
 * value is read again here, strictly, whatever stored it: a value that is not a destination opens
 * nothing.
 */
import {
  definitionsIn,
  destinationsOf,
  readDestination,
  webAddressHost,
  type FoundDestination,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import type { Translator } from '../i18n';

/** What following a destination does. */
export type FollowPlan =
  /** Opens a view of this project in this tab, with these elements selected and in sight. */
  | { kind: 'view'; view: Id; viewName: string; select: Id[] }
  /** Asks, then opens another project in a tab of its own program. */
  | { kind: 'project'; project: string; folder: string; view?: Id }
  /** Asks, then opens a web address in a new tab, with nothing of this tab reachable from it. */
  | { kind: 'web'; url: string; host: string }
  /** Opens nothing: the view it names is not in the project. */
  | { kind: 'missing-view'; view: Id };

/**
 * The folder a path to another project names, as the dialog names it: its last part, such as
 * `billing` for `../billing/`; the path as written when it ends going up.
 */
export function folderOf(path: string): string {
  const parts = path.split('/').filter((part) => part !== '' && part !== '.');
  const last = parts.at(-1);
  return last === undefined || last === '..' ? path : last;
}

/** What following a value does, or `undefined` when it is not a destination. */
export function planFollow(project: ProjectSnapshot, value: unknown): FollowPlan | undefined {
  const read = readDestination(value);
  if (!read.ok) return undefined;
  const { destination } = read;
  if ('url' in destination) {
    const host = webAddressHost(destination.url);
    return host === undefined ? undefined : { kind: 'web', url: destination.url, host };
  }
  if ('project' in destination) {
    return {
      kind: 'project',
      project: destination.project,
      folder: folderOf(destination.project),
      ...(destination.view === undefined ? {} : { view: destination.view }),
    };
  }
  const view = project.views.find((each) => each.id === destination.view);
  if (view === undefined) return { kind: 'missing-view', view: destination.view };
  const known = new Set(project.model.elements.map((element) => element.id));
  return {
    kind: 'view',
    view: view.id,
    viewName: view.name,
    select: (destination.focus ?? []).filter((id) => known.has(id)),
  };
}

/**
 * Whether the browser reads a web address as the core does: `https:`, with the host the dialog
 * named, and no user name or password. A second reading, by the browser that will open it, so that
 * nothing the two read differently ever opens.
 */
export function browserAgrees(url: string, host: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.hostname.toLowerCase() === host
  );
}

/** The destinations of an element, as the canvas, the inspector and the element list follow them. */
export function elementDestinations(
  project: ProjectSnapshot,
  element: Element | undefined,
): FoundDestination[] {
  if (element === undefined) return [];
  const component = definitionsIn(project).component(element.component);
  return destinationsOf(element, component?.attributes ?? []);
}

/**
 * What a destination opens, in words that go after a verb, as "Opens …" in the inspector and the
 * shape's tooltip write it: "the view “Overview”", "a page of example.org".
 */
export function describeDestination(
  t: Translator,
  project: ProjectSnapshot,
  value: unknown,
): string {
  const plan = planFollow(project, value);
  switch (plan?.kind) {
    case 'view':
      return t('the view “{view}”', { view: plan.viewName });
    case 'project':
      return plan.view === undefined
        ? t('the project in “{folder}”', { folder: plan.folder })
        : t('the view {view} of the project in “{folder}”', {
            view: plan.view,
            folder: plan.folder,
          });
    case 'web':
      return t('a page of {host}', { host: plan.host });
    case 'missing-view':
      return t('the view {view}, which the project does not have', { view: plan.view });
    case undefined:
      return t('nothing, since this is not a destination');
  }
}
