/**
 * What a recipe is: how Claude turns one kind of material that already exists, such as Mermaid or SQL
 * DDL, into a model, views and scenarios with the tools it already has (R29). The MCP server offers
 * each recipe as a prompt, and its worked example is run through the real bridge by the tests.
 */

/** One concept of the material, and what it becomes in the model. */
export interface Mapping {
  /** The concept as the material writes it, such as "`CREATE TABLE name`". */
  readonly from: string;
  /** What it becomes: a component, a relation type, a container, an attribute, or nothing. */
  readonly to: string;
}

/** One call of a worked example, as Claude makes it. */
export interface ExampleCall {
  /** The tool, by name. */
  readonly tool: string;
  /** Why this call, in a sentence. */
  readonly why: string;
  /**
   * The arguments. A string `<id of x>` stands for the id an earlier answer gave for x: the `ids`
   * of an `add_to_model` answer for its refs, or the id a call named with `as` made.
   */
  readonly args: Readonly<Record<string, unknown>>;
  /** A name for the id this call makes, a view's or a scenario's, that later calls write `<id of …>`. */
  readonly as?: string;
}

/** A small input of the material, and how the recipe builds it. */
export interface WorkedExample {
  /** Where such an input usually is, such as "docs/architecture.md". */
  readonly file: string;
  /** The input, as the person has it. */
  readonly input: string;
  /** The calls that build it, in order. */
  readonly calls: readonly ExampleCall[];
  /** What the input holds that matched nothing, quoted as the input writes it, and why. */
  readonly leftOut: readonly { readonly quote: string; readonly why: string }[];
}

/** How to build from one kind of material. */
export interface Recipe {
  /** The MCP prompt's name, such as `build_from_mermaid`. */
  readonly name: string;
  /** The material as a sentence names it, such as "Mermaid diagrams". */
  readonly material: string;
  /** The prompt's title, where the person picks it. */
  readonly title: string;
  /** One sentence for the list of prompts. */
  readonly description: string;
  /** Where the material usually is, and how to read it. */
  readonly read: readonly string[];
  /** How the material's concepts map onto components, relation types, containers and attributes. */
  readonly mapping: readonly Mapping[];
  /** What becomes views. */
  readonly views: readonly string[];
  /** What becomes scenarios, or where one can come from. */
  readonly scenarios: readonly string[];
  /** What usually matches nothing, to report and ask about. */
  readonly unmatched: readonly string[];
  /**
   * How a large input of this material goes in batches, beyond the rule every recipe gives: the ids
   * to choose and what each batch holds. Left out where the rule says enough.
   */
  readonly batches?: readonly string[];
  /** A small input worked through, call by call. */
  readonly example: WorkedExample;
}

/** The pattern of a stand-in for an id an earlier call made: `<id of x>`. */
export const ID_STAND_IN = /^<id of ([^<>]+)>$/;
