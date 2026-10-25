/**
 * What the element list shows (R42): the elements of a component, with those of the components
 * derived from it unless exactly that one, or those the open view's scope shows (ADR 0040), in the
 * model's order; their columns, the name, the component when several are listed, every attribute
 * their components define and any of their own, and their external identifiers by scheme (ADR 0056);
 * and each cell's value and text, by which the list sorts and filters. All of it is worked out from
 * the project, so that the list stays in step with the canvas and with every edit.
 */
import {
  componentOrEssence,
  isDestination,
  shownByScope,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { AttributeDefinition, Element, Id, JsonValue } from '@visual-anything/schema';
import { describeDestination } from '../destinations/follow';
import type { Translator } from '../i18n';
import { normalized } from '../search/find';
import { typeOfValue, type AttributeType } from '../shell/inspector/attributes';

/** Where the list takes its elements from. */
export type ListSource =
  /** What the open view shows: the whole model, or what its scope gives. */
  | { kind: 'view' }
  /** A component's elements, and those of the components derived from it unless `exactly`. */
  | { kind: 'component'; component: Id; exactly: boolean };

/** One column of the list. */
export type Column =
  | { kind: 'name' }
  | { kind: 'component' }
  /**
   * An attribute: its type is its definition's, the first that defines it among the listed
   * elements' components; absent for one only elements have, which is typed by its value.
   */
  | { kind: 'attribute'; name: string; type?: AttributeType; unit?: string }
  | { kind: 'id'; scheme: string };

/** Whether a column can be edited in place: every one but the component's. */
export function editable(column: Column): boolean {
  return column.kind !== 'component';
}

/** The elements the list lists, in the model's order; World is never one. */
export function listedElements(
  project: ProjectSnapshot,
  definitions: Definitions,
  viewId: Id | undefined,
  source: ListSource,
): readonly Element[] {
  const { elements } = project.model;
  if (source.kind === 'component') {
    if (source.exactly) return elements.filter((each) => each.component === source.component);
    return elements.filter((each) =>
      definitions.componentDerives(each.component, source.component),
    );
  }
  const view = project.views.find((each) => each.id === viewId);
  if (view?.scope === undefined) return elements;
  const shown = shownByScope(project, view);
  return elements.filter((each) => shown.element(each.id));
}

/** A column's key, which stays the same while the column does: for React and for sorting. */
export function columnKey(column: Column): string {
  switch (column.kind) {
    case 'name':
    case 'component':
      return column.kind;
    case 'attribute':
      return `attribute ${column.name}`;
    case 'id':
      return `id ${column.scheme}`;
  }
}

/**
 * The columns for these elements: the name; the component, when they come from more than one; each
 * attribute their components define, in the order of the first component that defines it, then the
 * attributes only elements have, by name; and each scheme of external identifiers, by name.
 */
export function columnsOf(definitions: Definitions, elements: readonly Element[]): Column[] {
  const components = new Set(elements.map((each) => each.component));
  const columns: Column[] = [{ kind: 'name' }];
  if (components.size > 1) columns.push({ kind: 'component' });
  const defined = new Map<string, AttributeDefinition>();
  for (const id of components) {
    for (const attribute of componentOrEssence(definitions, id).attributes) {
      if (!defined.has(attribute.name)) defined.set(attribute.name, attribute);
    }
  }
  const own = new Set<string>();
  const schemes = new Set<string>();
  for (const element of elements) {
    for (const name of Object.keys(element.attributes ?? {})) {
      if (!defined.has(name)) own.add(name);
    }
    for (const scheme of Object.keys(element.ids ?? {})) schemes.add(scheme);
  }
  for (const attribute of defined.values()) {
    columns.push({
      kind: 'attribute',
      name: attribute.name,
      type: attribute.type,
      ...(attribute.unit === undefined ? {} : { unit: attribute.unit }),
    });
  }
  for (const name of [...own].sort()) columns.push({ kind: 'attribute', name });
  for (const scheme of [...schemes].sort()) columns.push({ kind: 'id', scheme });
  return columns;
}

/** What a column's header says. */
export function columnLabel(t: Translator, column: Column): string {
  switch (column.kind) {
    case 'name':
      return t('Name');
    case 'component':
      return t('Component');
    case 'attribute':
      return column.unit === undefined ? column.name : `${column.name} (${column.unit})`;
    case 'id':
      return column.scheme;
  }
}

/**
 * A cell's value: the element's name, its component's name, an attribute's value, its own or else
 * its component's default, or its identifier in a scheme; `undefined` for an empty cell.
 */
export function cellValue(
  element: Element,
  column: Column,
  definitions: Definitions,
): JsonValue | undefined {
  switch (column.kind) {
    case 'name':
      return element.name;
    case 'component':
      return componentOrEssence(definitions, element.component).name;
    case 'attribute': {
      const own = element.attributes;
      if (own !== undefined && Object.hasOwn(own, column.name)) return own[column.name];
      return componentOrEssence(definitions, element.component).attributes.find(
        (each) => each.name === column.name,
      )?.default;
    }
    case 'id':
      return element.ids?.[column.scheme];
  }
}

/** Whether a cell holds the element's own value, rather than its component's default. */
export function ownValue(element: Element, column: Column): boolean {
  if (column.kind !== 'attribute') return true;
  return element.attributes !== undefined && Object.hasOwn(element.attributes, column.name);
}

/** A cell's value as the list writes it: text as it is, a destination by what it opens, JSON else. */
export function cellText(
  t: Translator,
  project: ProjectSnapshot,
  value: JsonValue | undefined,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isDestination(value)) return describeDestination(t, project, value);
  return JSON.stringify(value);
}

/** The text a cell is edited as: a destination and other JSON as JSON, the rest as written. */
export function editText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The type a cell is read as when edited: its column's, or else its value's, or else text. */
export function cellType(column: Column, value: JsonValue | undefined): AttributeType {
  if (column.kind !== 'attribute') return 'string';
  if (column.type !== undefined) return column.type;
  return value === undefined || value === null ? 'string' : typeOfValue(value);
}

/** Which way a column sorts. */
export type SortDirection = 'ascending' | 'descending';

/**
 * The elements sorted by a column: numbers as numbers, booleans false first, text as the language
 * reads it; empty cells last, either way; and ties in the order they came in.
 */
export function sortElements(
  elements: readonly Element[],
  column: Column,
  direction: SortDirection,
  definitions: Definitions,
): Element[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const keyed = elements.map((element, at) => ({
    element,
    at,
    value: cellValue(element, column, definitions),
  }));
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  keyed.sort((a, b) => {
    const empty = (value: JsonValue | undefined) =>
      value === undefined || value === null || value === '';
    if (empty(a.value) || empty(b.value)) {
      if (empty(a.value) && empty(b.value)) return a.at - b.at;
      return empty(a.value) ? 1 : -1;
    }
    const compared = compare(a.value, b.value, collator);
    return compared === 0 ? a.at - b.at : sign * compared;
  });
  return keyed.map((each) => each.element);
}

function compare(
  a: JsonValue | undefined,
  b: JsonValue | undefined,
  collator: Intl.Collator,
): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const text = (value: JsonValue | undefined) =>
    typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return collator.compare(text(a), text(b));
}

/**
 * The elements whose row holds every word of `text`, each in some cell, or in the cell of `within`
 * when it is given; the same list when there are no words. Case, accents and spaces do not count.
 */
export function filterElements(
  t: Translator,
  project: ProjectSnapshot,
  elements: readonly Element[],
  columns: readonly Column[],
  text: string,
  within: Column | undefined,
  definitions: Definitions,
): readonly Element[] {
  const words = normalized(text)
    .split(' ')
    .filter((word) => word !== '');
  if (words.length === 0) return elements;
  const searched = within === undefined ? columns : [within];
  return elements.filter((element) => {
    const cells = searched
      .map((column) => normalized(cellText(t, project, cellValue(element, column, definitions))))
      .join('\n');
    return words.every((word) => cells.includes(word));
  });
}
