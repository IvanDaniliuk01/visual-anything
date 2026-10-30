/**
 * What Claude's tools say of text emphasis (ADR 0082): which texts take Markdown, and the subset
 * they take. Claude writes markers on purpose, and writes the text of outside material as text: with
 * `escapeText: true`, the program escapes the texts a call sets before the command, so that they
 * read as the material writes them.
 */
import {
  componentOrEssence,
  definitionsIn,
  escapeEmphasis,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { AttributeDefinition, Attributes, Id } from '@visual-anything/schema';
import { z } from 'zod';
import type { Program } from './bridge';

/** The subset, as a text of several lines takes it. */
export const MARKDOWN_SUBSET =
  'Markdown, kept as typed: **bold**, *italic*, ~~struck~~, `code`, ==highlight== and ++underline++; headings `#` to `###`; lists nested to three levels and task lists (`- [ ]`, `- [x]`); `>` quotes; `---` rules; fenced code; GitHub tables of at most 12 columns and 50 rows; and [links](https://…) to http, https and mailto addresses. Raw HTML and images are drawn as the characters they are, and a backslash writes a marker as a character.';

/** What a field that takes Markdown says of itself. */
export const TAKES_MARKDOWN = `Takes ${MARKDOWN_SUBSET}`;

/** What the texts `escapeText` escapes are, as the tools and the instructions name them. */
const ESCAPED_TEXTS =
  'the descriptions this call sets (of elements, relations, components, relation types and their attributes, views and their perspectives, scenarios, tours, packages and the project), a note’s text, a tour step’s caption text, its reveals’ texts and its speaker notes, and the values of attributes whose definition has "format": "emphasis"';

/** The `escapeText` input of the tools that set a text that takes Markdown. */
export const escapeTextInput = () =>
  z
    .boolean()
    .optional()
    .describe(
      `true to write ${ESCAPED_TEXTS} as the characters they are: the program puts a backslash before each marker, so that a * or a _ stays a character. Use it for the text of outside material, such as a file’s comments or a table’s remarks. Left out, the texts are written as given, and their markers are emphasis.`,
    );

/** What the instructions say of text emphasis. */
export const EMPHASIS_INSTRUCTIONS = `Descriptions (of elements, relations, components, relation types, attributes, views, scenarios, tours, packages and the project), a note's text, a tour step's caption text, its reveals' text and its speaker notes take ${MARKDOWN_SUBSET} A string attribute takes the inline part of it (bold, italic, strikethrough, code, highlight, underline) only when its definition sets "format": "emphasis" (define_component, update_component); every other attribute, and every name, is plain, so that identifiers such as col_*_id and SQL such as '**'::text stay as written. Use emphasis to point at what matters, sparingly. When you put the text of outside material into a text that takes it, give escapeText: true to the tool that writes it (add_to_model, update_element, run_commands, create_tour, add_tour_step, update_tour_step and the others that set a description, a note, a caption's text, a reveal's text or speaker notes), and the program writes it as text; do not escape it by hand. Find, filters and sorting read texts without their markers.`;

/** A text escaped, or what is not a text as it is: `null` takes a text out, and stays `null`. */
function escaped<T>(value: T): T {
  return (typeof value === 'string' ? escapeEmphasis(value) : value) as T;
}

/** An object with its `description` escaped, when it has one. */
function withDescription<T>(value: T): T {
  if (value === null || typeof value !== 'object' || !('description' in value)) return value;
  return { ...value, description: escaped(value.description) };
}

/** Attribute definitions with their descriptions escaped. */
function definitionsEscaped<T>(list: T): T {
  return (Array.isArray(list) ? list.map(withDescription) : list) as T;
}

/**
 * A command with the texts it sets that take Markdown escaped (ADR 0082), so that they read as the
 * characters they are: the descriptions of what it creates or changes, a note's text, and the values
 * of attributes whose definition, along its chain, takes text emphasis. A batch has each of its
 * commands escaped; an element or relation it creates first has its values read by the definition
 * it comes from. Steps, tour captions and every other part stay as given, and so does a command of
 * another kind or of a shape the core will refuse.
 */
export function escapeTexts(state: ProjectSnapshot, command: Command): Command {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  // What the elements and relations a batch creates come from, by id, for its later updates.
  const madeFrom = new Map<Id, Id>();
  const attributesOf = (kind: 'component' | 'relation-type', id: unknown) => {
    if (typeof id !== 'string') return [];
    try {
      return kind === 'component'
        ? componentOrEssence(definitions, id).attributes
        : relationTypeOrRelatesTo(definitions, id).attributes;
    } catch {
      // A definition the core will refuse: its values are left as given.
      return [];
    }
  };
  const values = (attributes: unknown, defined: readonly AttributeDefinition[]): unknown => {
    if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return attributes;
    }
    const emphasised = new Set(
      defined.filter((each) => each.format === 'emphasis').map((each) => each.name),
    );
    if (emphasised.size === 0) return attributes;
    return Object.fromEntries(
      Object.entries(attributes as Attributes).map(([name, value]) => [
        name,
        emphasised.has(name) ? escaped(value) : value,
      ]),
    );
  };
  /** An element's or relation's new traits: its description and the values it sets. */
  const traits = <T>(given: T, defined: readonly AttributeDefinition[]): T => {
    if (given === null || typeof given !== 'object') return given;
    const object = given as Record<string, unknown>;
    return {
      ...object,
      ...('description' in object ? { description: escaped(object.description) } : {}),
      ...('attributes' in object ? { attributes: values(object.attributes, defined) } : {}),
    } as T;
  };
  /** A definition's attribute changes, with the descriptions of the attributes it sets escaped. */
  const attributeChanges = <T>(changes: T): T =>
    changes !== null && typeof changes === 'object' && 'set' in changes
      ? { ...changes, set: definitionsEscaped(changes.set) }
      : changes;
  /** A definition, a component or a relation type, with its descriptions escaped. */
  const definition = <T>(given: T): T => {
    const described = withDescription(given);
    return described !== null && typeof described === 'object' && 'attributes' in described
      ? { ...described, attributes: definitionsEscaped(described.attributes) }
      : described;
  };
  const note = <T>(shape: T): T =>
    shape !== null && typeof shape === 'object' && 'kind' in shape && shape.kind === 'note'
      ? { ...shape, text: escaped((shape as { text?: unknown }).text) }
      : shape;
  const changes = <C extends { changes: unknown }>(each: C, map: (given: object) => object): C =>
    each.changes !== null && typeof each.changes === 'object'
      ? { ...each, changes: map(each.changes) }
      : each;

  const walk = (each: Command): Command => {
    switch (each.type) {
      case 'batch':
        return Array.isArray(each.commands) ? { ...each, commands: each.commands.map(walk) } : each;
      case 'create-element': {
        const component = each.element?.component;
        if (typeof each.element?.id === 'string' && typeof component === 'string') {
          madeFrom.set(each.element.id, component);
        }
        return { ...each, element: traits(each.element, attributesOf('component', component)) };
      }
      case 'update-element': {
        const given = each.changes as { component?: unknown } | undefined;
        const component =
          given?.component ??
          madeFrom.get(each.id) ??
          (each.id === state.model.world.id
            ? state.model.world.component
            : index.element(each.id)?.component);
        return changes(each, (object) => traits(object, attributesOf('component', component)));
      }
      case 'create-relation': {
        const relationType = each.relation?.relationType;
        if (typeof each.relation?.id === 'string' && typeof relationType === 'string') {
          madeFrom.set(each.relation.id, relationType);
        }
        return {
          ...each,
          relation: traits(each.relation, attributesOf('relation-type', relationType)),
        };
      }
      case 'update-relation': {
        const given = each.changes as { relationType?: unknown } | undefined;
        const relationType =
          given?.relationType ?? madeFrom.get(each.id) ?? index.relation(each.id)?.relationType;
        return changes(each, (object) =>
          traits(object, attributesOf('relation-type', relationType)),
        );
      }
      case 'create-package':
        return { ...each, package: withDescription(each.package) };
      case 'update-package':
      case 'update-project':
      case 'update-scenario':
      case 'update-tour':
        return changes(each, withDescription);
      case 'define-component':
        return { ...each, component: definition(each.component) };
      case 'define-relation-type':
        return { ...each, relationType: definition(each.relationType) };
      case 'update-component':
      case 'update-relation-type':
        return changes(each, (object) => {
          const described = withDescription(object);
          return 'attributes' in described
            ? { ...described, attributes: attributeChanges(described.attributes) }
            : described;
        });
      case 'create-view': {
        const view = withDescription(each.view);
        return view !== null && typeof view === 'object' && 'perspective' in view
          ? { ...each, view: { ...view, perspective: withDescription(view.perspective) } }
          : { ...each, view };
      }
      case 'update-view':
        return changes(each, (object) => {
          const described = withDescription(object);
          return 'perspective' in described
            ? { ...described, perspective: withDescription(described.perspective) }
            : described;
        });
      case 'create-free-shape':
        return { ...each, shape: note(each.shape) };
      case 'update-free-shape':
        return { ...each, shape: note(each.shape) };
      case 'create-scenario':
        return { ...each, scenario: withDescription(each.scenario) };
      case 'create-tour':
        return { ...each, tour: withDescription(each.tour) };
      default:
        return each;
    }
  };
  return walk(command);
}

/** One text a tool sets, escaped with `escapeText`; `null`, which takes a text out, stays `null`. */
export function escapedIf<T extends string | null | undefined>(
  escapeText: boolean | undefined,
  text: T,
): T {
  return escapeText === true ? escaped(text) : text;
}

/** The command a tool sends: with `escapeText`, its texts escaped as {@link escapeTexts} says. */
export async function escapeTextsIf(
  program: Program,
  escapeText: boolean | undefined,
  command: Command,
): Promise<Command> {
  return escapeText === true ? escapeTexts(await program.project(), command) : command;
}
