/**
 * `va.data`, version 1 (ADR 0107): what an explorable reads of the project. For one shown by an
 * element, or loose and bound to one: that element with its attributes, read as everything else
 * reads them (a simulated value over a live one, a live value over a computed one, a computed value
 * over the stored one, the stored one over the default), each beside its definition's kind and unit;
 * what it contains, one level down; and its relations, each with the element at its other end. At
 * most 500 elements in all, and never more than a message to the frame carries, the rest counted.
 */
import type {
  AttributeDefinition,
  Element,
  ExplorableParameter,
  ExplorableParameterValue,
  Id,
  JsonValue,
} from '@visual-anything/schema';
import { readAttribute, type AttributeSources } from '../live/reading';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { explorablesIn } from './catalog';
import { MAX_PARAMETER_TEXT, MAX_FRAME_SIDE, plainDataBytes } from './messages';
import {
  MAX_DATA_ELEMENTS,
  MAX_FRAME_MESSAGE_BYTES,
  VA_API,
  type VaAttribute,
  type VaData,
  type VaElement,
  type VaRelation,
} from './types';

/** What an explorable shown by an element, or loose, reads as `va.data` (ADR 0107). */
export interface ExplorableDataInput {
  explorable: Id;
  /** The element that shows it, or a loose one is bound to. */
  element?: Id;
  /** The values a tour step sets; the defaults fill the rest. */
  parameters?: Record<string, ExplorableParameterValue>;
  theme: VaData['theme'];
  language: VaData['language'];
  size: VaData['size'];
  step?: VaData['step'];
  /**
   * What an element's or relation's attributes read from besides the model, by its id: the values
   * package code computed (ADR 0086), live values and a simulation's (added in A10.0). Left out, the
   * model's own values and the defaults.
   */
  sources?: (id: Id) => Omit<AttributeSources, 'own' | 'defaultOf'> | undefined;
}

/** The room `va.data` leaves in a message for the message's own envelope. */
const ENVELOPE = 4 * 1024;

export function explorableData(state: ProjectSnapshot, input: ExplorableDataInput): VaData {
  const defined = explorablesIn(state).explorable(input.explorable);
  const side = (value: number) =>
    Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_FRAME_SIDE) : 0;
  const data: VaData = {
    api: VA_API,
    parameters: parameterValues(defined?.definition.parameters ?? [], input.parameters),
    theme: input.theme === 'dark' ? 'dark' : 'light',
    language: input.language === 'es' ? 'es' : 'en',
    size: { width: side(input.size.width), height: side(input.size.height) },
  };
  if (input.step !== undefined) data.step = { ...input.step };
  const index = modelIndexOf(state);
  const element = input.element === undefined ? undefined : index.element(input.element);
  if (element === undefined) return data;

  const definitions = definitionsIn(state);
  const read = (each: Element): VaElement => {
    const definitionsOf = definitions.component(each.component)?.attributes ?? [];
    const byName = new Map(definitionsOf.map((attribute) => [attribute.name, attribute]));
    const extra = input.sources?.(each.id);
    const sources: AttributeSources = {
      own: each.attributes,
      defaultOf: (name) => byName.get(name)?.default,
      ...extra,
    };
    const names = [
      ...definitionsOf.map((attribute) => attribute.name),
      ...Object.keys(each.attributes ?? {}),
      ...[extra?.computed, extra?.live, extra?.simulated].flatMap((map) => [
        ...(map?.keys() ?? []),
      ]),
    ];
    const attributes: VaAttribute[] = [];
    for (const name of new Set(names)) {
      const reading = readAttribute(sources, name);
      if (reading === undefined) continue;
      attributes.push(vaAttribute(name, reading.value, reading.origin, byName.get(name)));
    }
    return {
      id: each.id,
      name: each.name,
      component: each.component,
      ...(each.description === undefined ? {} : { description: each.description }),
      attributes,
    };
  };

  let budget = MAX_FRAME_MESSAGE_BYTES - ENVELOPE - (plainDataBytes(data, Infinity) ?? 0);
  let room = MAX_DATA_ELEMENTS;
  let omitted = 0;
  /** Whether a part fits what is left, and takes its room if it does. */
  const fits = (part: unknown): boolean => {
    if (room === 0) return false;
    const bytes = plainDataBytes(part, budget);
    if (bytes === undefined) return false;
    budget -= bytes + 1;
    room -= 1;
    return true;
  };

  const own = read(element);
  if (!fits({ element: own })) {
    data.omitted = 1;
    return data;
  }
  data.element = own;
  const contents: VaElement[] = [];
  for (const id of index.contentsOf(element.id)) {
    const content = index.element(id);
    if (!content) continue;
    const part = read(content);
    if (fits(part)) contents.push(part);
    else omitted += 1;
  }
  const relations: VaRelation[] = [];
  for (const relation of index.relationsOn(element.id)) {
    const outgoing = relation.from === element.id;
    const other = index.element(outgoing ? relation.to : relation.from);
    // A relation that ends on a relation has no element at its other end to give.
    if (!other) continue;
    const part: VaRelation = {
      id: relation.id,
      type: relation.relationType,
      direction: outgoing ? 'out' : 'in',
      other: read(other),
    };
    if (fits(part)) relations.push(part);
    else omitted += 1;
  }
  if (contents.length > 0) data.contents = contents;
  if (relations.length > 0) data.relations = relations;
  if (omitted > 0) data.omitted = omitted;
  return data;
}

function vaAttribute(
  name: string,
  value: JsonValue,
  origin: string,
  definition: AttributeDefinition | undefined,
): VaAttribute {
  const attribute: VaAttribute = { name, value };
  if (origin === 'computed' || origin === 'live' || origin === 'simulated') {
    attribute.source = origin;
  }
  if (definition) {
    attribute.kind = definition.type;
    if (definition.unit !== undefined) attribute.unit = definition.unit;
    if (definition.description !== undefined) attribute.description = definition.description;
    if (definition.choices !== undefined) attribute.choices = [...definition.choices];
  }
  return attribute;
}

/** Why a value does not fit a parameter, in words; `undefined` when it fits. */
export function explorableParameterProblem(
  parameter: ExplorableParameter,
  value: unknown,
): string | undefined {
  switch (parameter.kind) {
    case 'number':
    case 'integer': {
      const whole = parameter.kind === 'integer';
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (whole && !Number.isInteger(value))
      ) {
        return `"${parameter.name}" takes ${whole ? 'a whole number' : 'a number'}.`;
      }
      if (value < parameter.min || value > parameter.max) {
        return `"${parameter.name}" takes a number from ${parameter.min} to ${parameter.max}.`;
      }
      return undefined;
    }
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `"${parameter.name}" takes true or false.`;
    case 'choice':
      return typeof value === 'string' &&
        value.length <= MAX_PARAMETER_TEXT &&
        parameter.choices.includes(value)
        ? undefined
        : `"${parameter.name}" takes one of ${parameter.choices.map((each) => JSON.stringify(each)).join(', ')}.`;
  }
}

export function parameterValues(
  parameters: readonly ExplorableParameter[],
  given: Record<string, ExplorableParameterValue> | undefined,
): Record<string, ExplorableParameterValue> {
  return Object.fromEntries(
    parameters.map((parameter) => {
      const value =
        given !== undefined && Object.hasOwn(given, parameter.name)
          ? given[parameter.name]
          : undefined;
      return [
        parameter.name,
        value !== undefined && explorableParameterProblem(parameter, value) === undefined
          ? value
          : parameter.default,
      ];
    }),
  );
}
