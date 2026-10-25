/**
 * What search shows of what it found: grouped by the views that draw it, the open view first, each
 * thing once, under the view Enter takes it to; and what each says, in the language the app reads in.
 *
 * In v0.1 every view shows the whole model (ADR-0025), so every view draws every element and relation
 * and they are listed under the open view; a free shape is drawn only by its own view. Once a view
 * can show part of the model (R30), `viewsDrawing` is where that changes.
 */
import {
  componentOrEssence,
  relationTypeOrRelatesTo,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import type { Translator } from '../i18n';
import type { Shown } from '../view-state/applier';
import type { Entry, Found } from './find';

/** What a search found that one view draws. */
export interface FoundGroup {
  /** The view; absent for what no view draws, as in a project without views. */
  view: ViewFile | undefined;
  /** Whether it is the view open now. */
  open: boolean;
  found: Found[];
}

/** The views that draw what an entry stands for, in the project's order. */
export function viewsDrawing(project: ProjectSnapshot, entry: Entry): ViewFile[] {
  if (entry.kind === 'free-shape') return project.views.filter((view) => view.id === entry.view);
  return [...project.views];
}

/** What was found, under the view each is taken to: the open one when it draws it, else the first. */
export function groupsOf(
  found: readonly Found[],
  project: ProjectSnapshot,
  openViewId: Id | undefined,
): FoundGroup[] {
  const groups = new Map<Id | undefined, FoundGroup>();
  const order = (id: Id | undefined) =>
    id === openViewId
      ? -1
      : id === undefined
        ? project.views.length
        : project.views.findIndex((view) => view.id === id);
  for (const each of found) {
    const views = viewsDrawing(project, each.entry);
    const view = views.find((one) => one.id === openViewId) ?? views[0];
    let group = groups.get(view?.id);
    if (!group) {
      group = { view, open: view !== undefined && view.id === openViewId, found: [] };
      groups.set(view?.id, group);
    }
    group.found.push(each);
  }
  return [...groups.values()].sort((a, b) => order(a.view?.id) - order(b.view?.id));
}

/** The longest a note's text shows in a result before it is cut. */
const SHOWN_TEXT = 80;

/** What a result is called: an element's name, a relation as it reads, a note's text. */
export function titleOf(t: Translator, project: ProjectSnapshot, entry: Entry): string {
  switch (entry.kind) {
    case 'element':
      return entry.name;
    case 'relation': {
      const sentence = nameOfEnd(project, entry.id);
      return entry.name === '' ? sentence : `${sentence}, “${entry.name}”`;
    }
    case 'free-shape':
      if (entry.shape === 'arrow') return t('Arrow');
      return cut(entry.name.replace(/\s+/g, ' ').trim()) || t('Note');
  }
}

/** What a result is: its component or relation type, or the kind of free shape. */
export function kindOf(t: Translator, definitions: Definitions, entry: Entry): string {
  if (entry.kind === 'free-shape') return entry.shape === 'arrow' ? t('Arrow') : t('Note');
  const id = entry.definition ?? '';
  if (entry.kind === 'element') {
    const component = componentOrEssence(definitions, id);
    return t.definition(component.id, component.name);
  }
  const type = relationTypeOrRelatesTo(definitions, id);
  return t('Relation: {type}', { type: t.definition(type.id, type.name) });
}

/** Where a result matched, when it is not its name or its kind: its id, or an attribute's value. */
export function matchedText(t: Translator, found: Found): string | undefined {
  const { matched, entry } = found;
  if (matched.field === 'id') return t('id {id}', { id: entry.id });
  if (matched.field === 'attribute') {
    return t('{attribute}: {value}', { attribute: matched.attribute, value: cut(matched.value) });
  }
  return undefined;
}

/** What the app says once a result is brought into sight. */
export function shownText(
  t: Translator,
  project: ProjectSnapshot,
  definitions: Definitions,
  entry: Entry,
  view: ViewFile,
  shown: Shown,
): string {
  const name = titleOf(t, project, entry);
  const what = kindOf(t, definitions, entry);
  const where =
    shown.key === undefined
      ? t('{name}, {what}, is selected in {view}, which does not draw it now.', {
          name,
          what,
          view: view.name,
        })
      : shown.holder !== undefined
        ? t('{name}, {what}, is selected in {view}, inside the collapsed {container}.', {
            name,
            what,
            view: view.name,
            container: shown.holder,
          })
        : t('{name}, {what}, is selected in {view}.', { name, what, view: view.name });
  return shown.hidden ? `${where} ${t('The filters or focus mode hide it.')}` : where;
}

function cut(text: string): string {
  return text.length > SHOWN_TEXT ? `${text.slice(0, SHOWN_TEXT - 1)}…` : text;
}
