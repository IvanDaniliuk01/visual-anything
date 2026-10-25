/**
 * How a spreadsheet's or a JSON file's text names an element: by the id or the name of an element of
 * the file, or of the project the import lands in. An element of the project that the file only
 * names joins the plan as an element it matched, which changes nothing of it, so that relations and
 * containment can end on it. Lookups go through maps built once, so that a file of 50,000 relations
 * against a project of 20,000 elements stays quick.
 */
import type { Element, Id } from '@visual-anything/schema';
import type { PlanBuilder } from './builder';
import { own } from './reader';

/** What an element of the project is matched by: its id, its name, or an attribute's value as text. */
export type MatchBy = { by: 'id' } | { by: 'name' } | { by: 'attribute'; name: string };

export class References {
  readonly #builder: PlanBuilder;
  readonly #project: readonly Element[];
  /** What follows "so" when what names nothing is left out, such as "the row is left out". */
  readonly #leftOut: string;
  readonly #ids = new Map<string, string>();
  readonly #names = new Map<string, string[]>();
  #projectIds: Map<string, Element> | undefined;
  #projectNames: Map<string, Element[]> | undefined;
  readonly #byAttribute = new Map<string, Map<string, Element[]>>();

  constructor(builder: PlanBuilder, elements: readonly Element[] | undefined, leftOut: string) {
    this.#builder = builder;
    this.#project = elements ?? [];
    this.#leftOut = leftOut;
  }

  /** Whether an element of the file already has this id. */
  hasId(id: string): boolean {
    return this.#ids.has(id);
  }

  /** Registers an element of the file, by its id and its name, under its key. */
  register(key: string, id: string, name: string): void {
    if (id !== '') this.#ids.set(id, key);
    if (name === '') return;
    const list = this.#names.get(name);
    if (list === undefined) this.#names.set(name, [key]);
    else list.push(key);
  }

  /**
   * The element of the project a value matches, or `several` when more than one does, which is
   * reported; undefined when none does.
   */
  match(how: MatchBy, value: string): { id: Id; name: string } | 'several' | undefined {
    if (value === '') return undefined;
    const found =
      how.by === 'id'
        ? [this.#projectId(value)].filter((each) => each !== undefined)
        : how.by === 'name'
          ? (this.#projectName(value) ?? [])
          : (this.#attributeIndex(how.name).get(value) ?? []);
    if (found.length > 1) {
      this.#builder.report(
        value,
        `"${value}" matches ${found.length} elements of the project, so ${this.#leftOut}.`,
      );
      return 'several';
    }
    const element = found[0];
    return element === undefined ? undefined : { id: element.id, name: element.name };
  }

  /**
   * The key of the element a text names: an element of the file by its id, or by a name only one
   * has; else an element of the project by its id, or by a name only one has. Reported with `why`
   * when it names none, and with its own reason when it names several.
   */
  resolve(text: string, why: string): string | undefined {
    const builder = this.#builder;
    const byId = this.#ids.get(text);
    if (byId !== undefined) return byId;
    const byName = this.#names.get(text) ?? [];
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      builder.report(
        text,
        `"${text}" names ${byName.length} elements of the file, so ${this.#leftOut}.`,
      );
      return undefined;
    }
    const exact = this.#projectId(text);
    const named = exact === undefined ? (this.#projectName(text) ?? []) : [exact];
    if (named.length > 1) {
      builder.report(
        text,
        `"${text}" names ${named.length} elements of the project, so ${this.#leftOut}.`,
      );
      return undefined;
    }
    const element = named[0];
    if (element !== undefined) return this.#reference(element.id, element.name);
    builder.report(text, why);
    return undefined;
  }

  #projectId(id: string): Element | undefined {
    this.#projectIds ??= new Map(this.#project.map((element) => [element.id, element]));
    return this.#projectIds.get(id);
  }

  #projectName(name: string): Element[] | undefined {
    if (this.#projectNames === undefined) {
      this.#projectNames = new Map();
      for (const element of this.#project) {
        const list = this.#projectNames.get(element.name);
        if (list === undefined) this.#projectNames.set(element.name, [element]);
        else list.push(element);
      }
    }
    return this.#projectNames.get(name);
  }

  /** The project's elements by their value of an attribute, as text, made once per attribute. */
  #attributeIndex(name: string): Map<string, Element[]> {
    let index = this.#byAttribute.get(name);
    if (index !== undefined) return index;
    index = new Map();
    for (const element of this.#project) {
      const value = own(element.attributes ?? {}, name);
      if (value === undefined || value === null) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const list = index.get(text);
      if (list === undefined) index.set(text, [element]);
      else list.push(element);
    }
    this.#byAttribute.set(name, index);
    return index;
  }

  /** The key of a planned element that only names an element of the project, made once. */
  #reference(id: Id, name: string): string {
    const builder = this.#builder;
    for (let attempt = 0; ; attempt++) {
      const key = attempt === 0 ? id : `project ${id}${attempt === 1 ? '' : ` ${attempt}`}`;
      const known = builder.element(key);
      if (known?.existing === id) return key;
      if (known === undefined) {
        builder.add({ key, name, kind: '', existing: id }, { label: '' });
        return key;
      }
    }
  }
}
