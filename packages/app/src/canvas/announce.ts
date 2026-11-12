/**
 * What the canvas says about what it selected, for screen readers: an element's name, component,
 * container and how many relations the view draws on it; a relation as the sentence it reads as, such
 * as "Booking agent communicates with Appointments API"; a free shape; or how much a selection holds.
 * Each is said in the language the app reads in when it is said.
 */
import {
  definitionsIn,
  modelIndexOf,
  plainText,
  relationTypeOrRelatesTo,
  solidsIn,
  type ModelIndex,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Relation } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t, type PluralText, type Translator } from '../i18n';
import type { IndexedScene } from './hit';
import { faceDetail } from './faces';
import { drawnRelations } from './navigation';
import { picturesOf, type ElementShape } from './scene';
import { isAnchoredSolidPart } from './solidMark';
import { detailPlainText } from '../text/detail';

/** Where a relation is among the relations of the element the keys step through. */
export interface RelationStep {
  element: Id;
  /** From 1. */
  position: number;
  count: number;
  /** The relation it ends on, when the keys reach it through that one rather than on the element. */
  through?: Id;
}

/** "Appointments API, Service, in Scheduling, 4 relations." */
export function describeShape(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  shape: ElementShape,
): string {
  const container =
    shape.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
  const others = (indexed.byElement.get(shape.element)?.length ?? 1) - 1;
  const inside = container?.name ?? t('World');
  const where =
    others > 0
      ? t('in {container} and {others}', {
          container: inside,
          others: t(OTHER_CONTAINERS, { count: others }),
        })
      : t('in {container}', { container: inside });
  const relations = drawnRelations(indexed.scene, project).around(shape.element).length;
  const component = modelIndexOf(project).element(shape.element)?.component;
  // A row says its detail and its place among its container's rows (ADR 0023).
  const componentName =
    component === undefined ? shape.componentName : t.definition(component, shape.componentName);
  // The whole detail by its plain text (ADR 0082), less the component's name it starts with, which is
  // said already; or what a face says, in reading order (ADR 0083).
  const said =
    faceDetail(shape, componentName) ??
    (shape.detail === undefined ? '' : withoutLeading(detailPlainText(shape), componentName));
  if (shape.row !== undefined && container?.rowCount !== undefined) {
    const values = {
      name: shape.name,
      component: componentName,
      detail: said,
      position: shape.row + 1,
      count: container.rowCount,
      container: container.name,
      relations: relations === 0 ? t('no relations') : t(RELATIONS, { count: relations }),
    };
    return withLeaving(
      shape,
      withSolid(
        project,
        shape,
        values.detail === ''
          ? t('{name}, {component}, row {position} of {count} in {container}, {relations}.', values)
          : t(
              '{name}, {component}, {detail}, row {position} of {count} in {container}, {relations}.',
              values,
            ),
      ),
    );
  }
  const values = {
    name: shape.name,
    component: componentName,
    detail: said,
    where,
    relations: relations === 0 ? t('no relations') : t(RELATIONS, { count: relations }),
  };
  return withLeaving(
    shape,
    withSolid(
      project,
      shape,
      values.detail === '' || values.detail === values.component
        ? t('{name}, {component}, {where}, {relations}.', values)
        : t('{name}, {component}, {detail}, {where}, {relations}.', values),
    ),
  );
}

/**
 * What a shape says of the solid it shows (ADR 0075): its description, which is its text alternative,
 * as the inspector and the outline in Markdown give it, or that its solid has no description. Empty
 * for a shape that shows no solid a package defines, or that is drawn as one of a solid's parts,
 * which is said as any shape is.
 */
export function solidNote(
  translate: Translator,
  project: ProjectSnapshot,
  shape: Pick<ElementShape, 'solid' | 'part'>,
): string {
  if (!shape.solid || isAnchoredSolidPart(shape)) return '';
  const definition = solidsIn(project).solid(shape.solid.id)?.definition;
  if (!definition) return '';
  const description = definition.description?.trim();
  return description
    ? translate(', with a solid: {description}', { description })
    : translate(', with the solid “{solid}”, which has no description', {
        solid: definition.name,
      });
}

/**
 * A shape's sentence with what it says of its solid at its end, after its relations, since a
 * description can be long: the sentence's own full stop moves after it, unless the description
 * ends a sentence of its own.
 */
function withSolid(project: ProjectSnapshot, shape: ElementShape, said: string): string {
  const note = solidNote(t, project, shape);
  if (note === '') return said;
  const sentence = said.endsWith('.') ? said.slice(0, -1) : said;
  return /[.!?…]$/.test(note) ? `${sentence}${note}` : `${sentence}${note}.`;
}

/**
 * A detail without the component's name it starts with, as a part of its own (`Table · placed` says
 * `placed`); the detail as it is when it does not start so.
 */
function withoutLeading(detail: string, component: string): string {
  const lead = `${component} · `;
  return component !== '' && detail.startsWith(lead) ? detail.slice(lead.length) : detail;
}

/** A shape's description, with how many relations leave the view from it, as its mark says (ADR-0040). */
function withLeaving(shape: ElementShape, said: string): string {
  const count = shape.leaving?.length ?? 0;
  if (count === 0) return said;
  const leaving = t(
    { one: '{count} relation leaves this view', other: '{count} relations leave this view' },
    { count },
  );
  return `${said} ${leaving}.`;
}

const RELATIONS: PluralText = { one: '{count} relation', other: '{count} relations' };
const ELEMENTS: PluralText = { one: '{count} element', other: '{count} elements' };
const FREE_SHAPES: PluralText = { one: '{count} free shape', other: '{count} free shapes' };
const OTHER_CONTAINERS: PluralText = {
  one: '{count} other container',
  other: '{count} other containers',
};

/**
 * "Booking agent communicates with Appointments API, “HTTPS”.", and where it is when stepping: which
 * relation it ends on, when it is reached through one, and its place among the element's.
 */
export function describeRelation(project: ProjectSnapshot, id: Id, step?: RelationStep): string {
  const index = modelIndexOf(project);
  const relation = index.relation(id);
  if (!relation) return t('A relation that no longer exists.');
  const named = relation.name ? `, “${relation.name}”` : '';
  const through =
    step?.through === undefined
      ? ''
      : t(', ending on {end}', { end: nameOfEnd(project, step.through) });
  const where = step
    ? t(', relation {position} of {count} of {element}', {
        position: step.position,
        count: step.count,
        element: nameIn(index, step.element),
      })
    : '';
  return `${sentenceOf(index, project, relation)}${named}${through}${where}.`;
}

/** The name of an end of a relation: an element's name, or the sentence a relation reads as. */
export function nameOfEnd(project: ProjectSnapshot, id: Id): string {
  const index = modelIndexOf(project);
  const relation = index.relation(id);
  return relation ? sentenceOf(index, project, relation) : nameIn(index, id);
}

/** What a selection holds: one thing described, or how many of each kind. */
export function describeSelection(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  selection: Selection,
  /** The shape the keys last reached, to say which container an element is described in. */
  current?: string,
): string {
  const { elements, relations, freeShapes } = selection;
  const total = elements.size + relations.size + freeShapes.size;
  if (total === 0) return t('Nothing is selected.');
  if (total === 1) {
    const [element] = elements;
    if (element !== undefined) {
      const shapes = indexed.byElement.get(element) ?? [];
      const shape = shapes.find((each) => each.key === current) ?? shapes[0];
      return shape ? describeShape(indexed, project, shape) : t('1 element selected.');
    }
    const [relation] = relations;
    if (relation !== undefined) return describeRelation(project, relation);
    const [free] = freeShapes;
    const picture = picturesOf(indexed.scene).find((each) => each.id === free);
    // A picture is said by its name (ADR 0098), a link card by its title and host (stage 3).
    if (picture?.link) {
      return asSentence(
        t('Link card: {title}, {host}', { title: picture.link.title, host: picture.link.host }),
      );
    }
    if (picture?.video) {
      return picture.named ? asSentence(t('Video: {name}', { name: picture.name })) : t('Video.');
    }
    if (picture) {
      return picture.named
        ? asSentence(t('Picture: {name}', { name: picture.name }))
        : t('Picture.');
    }
    const note = indexed.scene.notes.find((each) => each.id === free);
    // A note's text takes text emphasis (ADR 0082): it is said without its markers.
    return note ? asSentence(t('Note: {text}', { text: plainText(note.text) })) : t('Arrow.');
  }
  const parts: string[] = [];
  if (elements.size > 0) parts.push(t(ELEMENTS, { count: elements.size }));
  if (relations.size > 0) parts.push(t(RELATIONS, { count: relations.size }));
  if (freeShapes.size > 0) parts.push(t(FREE_SHAPES, { count: freeShapes.size }));
  return t('{things} selected.', { things: listed(parts) });
}

/** "Patient communicates with WhatsApp channel": the ends named one level deep only. */
function sentenceOf(index: ModelIndex, project: ProjectSnapshot, relation: Relation): string {
  const relationType = relationTypeOrRelatesTo(definitionsIn(project), relation.relationType);
  return `${shortNameIn(index, project, relation.from)} ${t.definition(relationType.id, relationType.name)} ${shortNameIn(index, project, relation.to)}`;
}

/** An element's name; for a relation, its type and its own name, without its ends. */
function shortNameIn(index: ModelIndex, project: ProjectSnapshot, id: Id): string {
  const relation = index.relation(id);
  if (!relation) return nameIn(index, id);
  const relationType = relationTypeOrRelatesTo(definitionsIn(project), relation.relationType);
  const name = t.definition(relationType.id, relationType.name);
  return relation.name ? `${name} “${relation.name}”` : name;
}

function nameIn(index: ModelIndex, id: Id): string {
  return index.element(id)?.name ?? id;
}

/** The text, ending with a full stop unless it already ends a sentence. */
function asSentence(text: string): string {
  const trimmed = text.trimEnd();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** "a", "a and b", "a, b and c", in the language the app reads in. */
export function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return t('{first} and {last}', {
    first: parts.slice(0, -1).join(', '),
    last: parts.at(-1) ?? '',
  });
}
