/** What the conflicts in the Changes tab say (ADR 0072), in the language the app reads in. */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { FileConflict, Id } from '@visual-anything/schema';
import type { Translator } from '../../i18n';
import type { ConflictedFile } from './conflicts';

/** A file that holds conflicts, as a heading names it: “The model”, “View “Overview””. */
export function fileTitle(t: Translator, file: ConflictedFile): string {
  const name = file.name ?? ('id' in file.file ? file.file.id : '');
  switch (file.file.kind) {
    case 'project':
      return t('The project file');
    case 'model':
      return t('The model');
    case 'package':
      return t('Package “{name}”', { name });
    case 'view':
      return t('View “{name}”', { name });
    case 'scenario':
      return t('Scenario “{name}”', { name });
    case 'tour':
      return t('Tour “{name}”', { name });
    case 'comment':
      return t('Thread “{name}”', { name });
  }
}

/** What a conflict is about, in a few words, then where inside it: “SMS channel › name”. */
export function conflictTitle(
  t: Translator,
  project: ProjectSnapshot,
  file: ConflictedFile,
  conflict: FileConflict,
): string {
  const [kind = '', ...rest] = conflict.item.split(':');
  const key = rest.join(':');
  const index = modelIndexOf(project);
  const element = (id: Id) => index.element(id)?.name ?? id;
  const relation = (id: Id) => {
    const found = index.relation(id);
    if (!found) return id;
    return found.name ?? t('{from} to {to}', { from: element(found.from), to: element(found.to) });
  };
  const inPackage = (list: 'components' | 'relationTypes' | 'images') => {
    const found = project.packages.find((each) => 'id' in file.file && each.id === file.file.id);
    const named = (found?.[list] as readonly { id: Id; name?: string }[] | undefined)?.find(
      (each) => each.id === key,
    );
    return named?.name ?? key;
  };
  let what: string;
  switch (kind) {
    case 'world':
      what = t('World');
      break;
    case 'order':
      what = t('The order of elements');
      break;
    case 'element':
      what = element(key);
      break;
    case 'relation':
      what = relation(key);
      break;
    case 'component':
      what = inPackage('components');
      break;
    case 'relation-type':
      what = inPackage('relationTypes');
      break;
    case 'image':
      what = inPackage('images');
      break;
    case 'position': {
      const [placed = key] = key.split(' in ');
      what = t('The place of “{name}”', { name: element(placed) });
      break;
    }
    case 'free-shape':
      what = t('The free shape “{id}”', { id: key });
      break;
    case 'stacking':
      what = t('The stacking order inside “{name}”', { name: element(key) });
      break;
    case 'route':
      what = t('The route of “{name}”', { name: relation(key) });
      break;
    case 'step':
      what = t('The step “{id}”', { id: key });
      break;
    case 'tour-step':
      what = t('The tour step “{id}”', { id: key });
      break;
    case 'comment':
      what = t('The comment “{id}”', { id: key });
      break;
    default:
      what = fileTitle(t, file);
  }
  return conflict.path.length === 0 ? what : `${what} › ${conflict.path.join(' › ')}`;
}

/** Why a merge could not join, in words. */
export function whyText(t: Translator, why: FileConflict['why']): string {
  switch (why) {
    case 'both-changed':
      return t('Both sides changed it, differently.');
    case 'removed-and-changed':
      return t('One side removed it, and the other changed it.');
    case 'both-added':
      return t('Both sides added it, differently.');
    case 'needs-removed':
      return t('One side removed it, but what the other side added or changed needs it.');
    case 'cycle':
      return t('With what the other side added, it would close a containment cycle.');
    case 'order':
      return t('Both sides put this list in a different order.');
  }
}

/** Whose value a side is, by the name git gave it when it gave one: “main”, or “ours”. */
export function sideName(t: Translator, conflict: FileConflict, side: 'kept' | 'other'): string {
  const whose = side === 'kept' ? conflict.kept : conflict.kept === 'ours' ? 'theirs' : 'ours';
  return conflict.sides?.[whose] ?? (whose === 'ours' ? t('our side') : t('their side'));
}

/** How many conflicts a file holds. */
export function conflictsText(t: Translator, count: number): string {
  return t({ one: '{count} conflict', other: '{count} conflicts' }, { count });
}
