/**
 * What the outline's rows say, in the language the app reads in. The rows themselves come from
 * `outlineItems.ts`, which writes English; built-in components and relation types are named here by
 * their ids, and what people wrote stays as they wrote it.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import { nameOfEnd, solidNote } from '../canvas/announce';
import type { Translator } from '../i18n';
import { textOf, type OutlineItem, type RelationItem, type ShapeItem } from './outlineItems';

/**
 * What a shape's row says after its name, as `shapeNoteOf` says it in English: its component's name,
 * and on a collapsed container that it is collapsed and how many shapes it holds; then, for a shape
 * that shows a solid, the solid's description, its text alternative (ADR 0075).
 */
export function shapeNote(t: Translator, project: ProjectSnapshot, item: ShapeItem): string {
  const { shape } = item;
  const component = modelIndexOf(project).element(shape.element)?.component;
  const name =
    component === undefined ? shape.componentName : t.definition(component, shape.componentName);
  const note =
    shape.collapsed === undefined
      ? name
      : t('{component}, collapsed: {count} inside', {
          component: name,
          count: shape.collapsed.contents,
        });
  return `${note}${solidNote(t, project, shape)}`;
}

/** The name of a relation row's type: the language's for a built-in one. */
export function relationTypeName(
  t: Translator,
  project: ProjectSnapshot,
  item: RelationItem,
): string {
  const type = modelIndexOf(project).relation(item.relation)?.relationType;
  return type === undefined ? item.relationType : t.definition(type, item.relationType);
}

/** What `outlineOf` calls the far end of an aggregated relation that ends on no shape. */
const AGGREGATED_FAR_END = 'an aggregated relation';

/** The far end's name: what people wrote, or that it is an aggregated relation. */
export function farNameOf(t: Translator, item: RelationItem): string {
  return item.stands !== undefined && item.farName === AGGREGATED_FAR_END
    ? t(AGGREGATED_FAR_END)
    : item.farName;
}

/** The text typing a few letters matches; a note's and an arrow's in the language read in. */
export function typedTextOf(t: Translator, item: OutlineItem): string {
  // A picture's own name is the person's text; "Picture" is the app's.
  if (item.kind === 'picture') {
    if (item.picture.named) return item.picture.name;
    return item.picture.video ? t('Video') : t('Picture');
  }
  return item.kind === 'note' || item.kind === 'arrow' ? t(textOf(item)) : textOf(item);
}

/** A relation's row is heard as the sentence it reads as; the other rows as they read. */
export function labelOf(
  t: Translator,
  project: ProjectSnapshot,
  item: OutlineItem,
): string | undefined {
  if (item.kind !== 'relation') return undefined;
  const sentence = sentenceOf(t, project, item);
  return item.name === undefined ? sentence : `${sentence}, “${item.name}”`;
}

/** The sentence a relation row reads as, or an aggregated relation's. */
function sentenceOf(t: Translator, project: ProjectSnapshot, item: RelationItem): string {
  if (item.stands !== undefined) {
    const near = modelIndexOf(project).element(item.near)?.name ?? item.near;
    // `outlineOf` writes the ends in the order the relations go, which an undirected type does not
    // say otherwise.
    const fromHere = item.sentence.endsWith(` from ${near} to ${item.farName}, aggregated`);
    const far = farNameOf(t, item);
    const [from, to] = fromHere ? [near, far] : [far, near];
    return t(
      {
        one: '{count} relation "{type}" from {from} to {to}, aggregated',
        other: '{count} relations "{type}" from {from} to {to}, aggregated',
      },
      { count: item.stands.length, type: relationTypeName(t, project, item), from, to },
    );
  }
  return nameOfEnd(project, item.relation);
}
