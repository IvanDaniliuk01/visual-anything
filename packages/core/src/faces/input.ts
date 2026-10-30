/**
 * What a face is filled from (ADR 0083): an element's name, its component's name, what a collapsed
 * container holds, its attributes in order, its detail and its badges. `faceInputOf` gathers them from
 * the model; the read-only page, the app and Claude's tools pass values computed by package code over
 * the element's own, and those missing are simply missing.
 */
import type { AttributeDefinition, Id, JsonValue } from '@visual-anything/schema';
import { attributeValue, detailParts, type Typed } from '../appearance';
import type { Definitions } from '../definitions';
import { destinationKind, isDestination, webAddressHost } from '../destinations';
import { emphasisRuns, type EmphasisRun } from '../text/emphasis';
import { FACE_CAPS } from './limits';

/** One attribute of an element, as a face reads it. */
export interface FaceValue {
  name: string;
  /** Its value; `undefined` when it has none, such as a computed value without approval. */
  value: JsonValue | undefined;
  type?: AttributeDefinition['type'];
  unit?: string;
  format?: 'plain' | 'emphasis';
  /** How a destination is named: the view's name, the project's folder or the address's host. */
  label?: string;
}

export interface FaceInput {
  name: string;
  /** Its component's name. */
  component: string;
  /** What a collapsed container holds. */
  count?: number;
  /** Its attributes: the component's in their order of definition, then its own in the order added. */
  attributes: readonly FaceValue[];
  /** Its detail, as `appearance.detail` makes it: runs, each value read with its emphasis. */
  detail?: readonly EmphasisRun[];
  /** Its badges that hold, and an overlay's badge after them. */
  badges?: readonly string[];
  /** How tall its rows are, under the face. */
  rowsHeight?: number;
  /** How tall its expanded contents are, under the face. */
  contentsHeight?: number;
}

export interface FaceInputOptions {
  /** Reads an attribute in place of the element's own value and its default, as computed values do. */
  readValue?: (name: string) => JsonValue | undefined;
  /** The relation types of the relations it starts, for badges that show on them. */
  startedTypes?: ReadonlySet<Id>;
  count?: number;
  /** A view's name by its id, for destinations. */
  viewName?: (id: Id) => string | undefined;
  /** An overlay's badge, written after the others. */
  overlayBadge?: string;
}

/** What a face is filled from, for an element of the model. */
export function faceInputOf(
  element: Typed & { name: string },
  definitions: Definitions,
  options: FaceInputOptions = {},
): FaceInput {
  const component = definitions.component(element.component);
  const valueOf =
    options.readValue ?? ((name: string) => attributeValue(element, name, definitions));
  const defined = component?.attributes ?? [];
  const names = [...defined.map((each) => each.name)];
  for (const name of Object.keys(element.attributes ?? {})) {
    if (!names.includes(name)) names.push(name);
  }
  const byName = new Map(defined.map((each) => [each.name, each]));
  const attributes = names.map((name): FaceValue => {
    const definition = byName.get(name);
    const value = valueOf(name);
    const label = labelOf(value, options.viewName);
    return {
      name,
      value,
      ...(definition === undefined ? {} : { type: definition.type }),
      ...(definition?.unit === undefined ? {} : { unit: definition.unit }),
      ...(definition?.format === undefined ? {} : { format: definition.format }),
      ...(label === undefined ? {} : { label }),
    };
  });
  const parts = detailParts(element, definitions, options.startedTypes ?? new Set(), valueOf);
  const detail: EmphasisRun[] = [];
  const badges: string[] = [];
  for (const part of parts) {
    if (part.kind === 'badge') {
      badges.push(part.text);
      continue;
    }
    if (detail.length > 0) detail.push(plainRun(' · '));
    const takes = part.kind === 'attribute' && byName.get(part.attribute)?.format === 'emphasis';
    detail.push(...(takes ? emphasisRuns(part.text) : [plainRun(part.text)]));
  }
  if (options.overlayBadge !== undefined) badges.push(options.overlayBadge);
  return {
    name: element.name,
    component: component?.name ?? element.component,
    ...(options.count === undefined ? {} : { count: options.count }),
    attributes,
    ...(detail.length === 0 ? {} : { detail }),
    ...(badges.length === 0 ? {} : { badges }),
  };
}

export function plainRun(text: string): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
  };
}

/** How a destination is named. */
function labelOf(
  value: JsonValue | undefined,
  viewName: ((id: Id) => string | undefined) | undefined,
): string | undefined {
  if (!isDestination(value)) return undefined;
  switch (destinationKind(value)) {
    case 'view': {
      const view = (value as { view: Id }).view;
      return viewName?.(view) ?? view;
    }
    case 'project':
      return (value as { project: string }).project;
    case 'web': {
      const url = (value as { url: string }).url;
      return webAddressHost(url) ?? url;
    }
  }
}

/** Whether a value counts as one: not missing, empty or false, nor an empty list. */
export function hasValue(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === '' || value === false) return false;
  return !(Array.isArray(value) && value.length === 0);
}

/**
 * What a slot writes for an attribute's value, as the detail writes it: a text as it is, a number
 * with its unit, a boolean as the attribute's name while it is true, a destination by its label, a
 * list of texts and numbers with commas, and other JSON compactly. Cut to 2,000 characters.
 */
export function valueText(attribute: FaceValue): string | undefined {
  const { value } = attribute;
  if (!hasValue(value)) return undefined;
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number')
    text = attribute.unit === undefined ? String(value) : `${value} ${attribute.unit}`;
  else if (value === true) text = attribute.name;
  else if (attribute.label !== undefined) text = attribute.label;
  else if (
    Array.isArray(value) &&
    value.every((each) => typeof each === 'string' || typeof each === 'number')
  ) {
    text = value.join(', ');
  } else text = JSON.stringify(value);
  return capped(text);
}

/** A text cut to what a slot writes, ending in "…" when cut. */
export function capped(text: string): string {
  if (text.length <= FACE_CAPS.slotCharacters) return text;
  return `${[...text].slice(0, FACE_CAPS.slotCharacters - 1).join('')}…`;
}
