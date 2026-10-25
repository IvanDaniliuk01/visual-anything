/**
 * The commands that add, type, paste and reorder rows (ADR 0023): the canvas's Ctrl+Enter and
 * Shift+Up and Shift+Down, and the inspector's Columns section, send them. Pure.
 *
 * A row is added through the nesting relation type that holds the two (`nestingTypeFor`), and the
 * view starts nesting by that type in the same action when it does not yet, so that the new row
 * shows. A row's place is its place in the model's order, so adding one below another places it
 * before the row after it, and moving one places it before another.
 */
import {
  ESSENCE,
  contentsInView,
  definitionsIn,
  freshId,
  modelIndexOf,
  nestingTypeFor,
  nestingTypesInView,
  randomIds,
  slug,
  type Command,
  type CreateElementCommand,
  type IdGenerator,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Attributes, Id, ViewFile } from '@visual-anything/schema';
import { t } from '../i18n';
import type { ParsedColumn } from '../shell/inspector/columns';
import { madeIn } from './scope';

/** The component every table derives from, and the one its columns are made from. */
export const TABLE = 'data-modeling.table';
export const COLUMN = 'data-modeling.column';
const REFERENCES = 'data-modeling.references';

/** Whether an element is a table: created from Table or a component derived from it. */
export function isTable(project: ProjectSnapshot, element: Id): boolean {
  const found = modelIndexOf(project).element(element);
  return found !== undefined && definitionsIn(project).componentDerives(found.component, TABLE);
}

/** The rows a container draws in a view: what it holds through the view's nesting relation types, in the model's order. */
export function rowsInView(project: ProjectSnapshot, view: ViewFile, container: Id): Id[] {
  return contentsInView(project, view, container);
}

/**
 * The component a new row of a container is made from: Column in a table; elsewhere, its last row's
 * component, or Essence when it has none.
 */
export function rowComponentOf(project: ProjectSnapshot, view: ViewFile, container: Id): Id {
  if (isTable(project, container)) return COLUMN;
  const index = modelIndexOf(project);
  const last = rowsInView(project, view, container).at(-1);
  return (last === undefined ? undefined : index.element(last)?.component) ?? ESSENCE.id;
}

/** The commands that make the view nest by the relation type that holds a new row, and that type. */
function nestingFor(
  project: ProjectSnapshot,
  view: ViewFile,
  component: Id,
  container: Id,
): { relationType: Id; first: Command[] } | undefined {
  const choice = nestingTypeFor(project, view, component, container);
  if (!choice) return undefined;
  return {
    relationType: choice.relationType,
    first: choice.addToView
      ? [
          {
            type: 'update-view',
            id: view.id,
            changes: {
              nestingRelationTypes: [...nestingTypesInView(project, view), choice.relationType],
            },
          },
        ]
      : [],
  };
}

/** The element a new row goes before, to land below `below`, or last when absent or the last row. */
function beforeFor(rows: readonly Id[], below: Id | undefined): Id | undefined {
  if (below === undefined) return undefined;
  const at = rows.indexOf(below);
  return at === -1 ? undefined : rows[at + 1];
}

/**
 * The command that adds a row to a container, at the end or below `below`, named after its
 * component; with the id it gives the new row, so that the canvas can open its name for editing.
 */
export function addRowCommand(
  project: ProjectSnapshot,
  viewId: Id,
  container: Id,
  below?: Id,
  generate: IdGenerator = randomIds(),
): { command: Command; id: Id } | undefined {
  const view = project.views.find((each) => each.id === viewId);
  if (!view || container === project.model.world.id) return undefined;
  const component = rowComponentOf(project, view, container);
  const definition = definitionsIn(project).component(component);
  const nesting = nestingFor(project, view, component, container);
  if (!definition || !nesting) return undefined;
  const index = modelIndexOf(project);
  const id = freshId(generate, slug(definition.name, 'row'), (each) => index.has(each));
  const before = beforeFor(rowsInView(project, view, container), below);
  const create: CreateElementCommand = {
    type: 'create-element',
    element: { id, component, name: t.definition(component, definition.name) },
    ...madeIn(view),
    containers: [{ container, relationType: nesting.relationType }],
    ...(before === undefined ? {} : { before }),
  };
  const commands = [...nesting.first, create];
  const name = index.element(container)?.name ?? container;
  return {
    command:
      commands.length === 1 ? create : { type: 'batch', label: `Add a row to "${name}"`, commands },
    id,
  };
}

/**
 * The command that moves a row up or down among its container's rows in a view: before the row
 * above it, or before the one after the row below it. `undefined` at the top or the bottom.
 */
export function moveRowCommand(
  project: ProjectSnapshot,
  view: ViewFile,
  container: Id,
  row: Id,
  direction: 'up' | 'down',
): Command | undefined {
  const rows = rowsInView(project, view, container);
  const at = rows.indexOf(row);
  if (at === -1) return undefined;
  if (direction === 'up') {
    const above = rows[at - 1];
    return above === undefined
      ? undefined
      : { type: 'reorder-elements', elements: [row], before: above };
  }
  if (at === rows.length - 1) return undefined;
  const after = rows[at + 2];
  return {
    type: 'reorder-elements',
    elements: [row],
    ...(after === undefined ? {} : { before: after }),
  };
}

/** A reference that could not be related, and why. */
export interface Unrelated {
  text: string;
  reason: string;
}

/**
 * The command that adds typed or pasted columns to a table, as one action: the view's new nesting
 * relation type when it needs one, a `create-element` for each column with only the attributes it
 * has, and a "references" relation for each reference whose table and column can be found, among
 * the project's tables and the columns being added. The references that cannot be found are listed,
 * and never invented.
 */
export function addColumnsCommand(
  project: ProjectSnapshot,
  viewId: Id,
  table: Id,
  columns: readonly ParsedColumn[],
  generate: IdGenerator = randomIds(),
): { command?: Command; ids: Id[]; unrelated: Unrelated[] } {
  const view = project.views.find((each) => each.id === viewId);
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const tableElement = index.element(table);
  if (!view || !tableElement || columns.length === 0) return { ids: [], unrelated: [] };
  const nesting = nestingFor(project, view, COLUMN, table);
  if (!nesting) return { ids: [], unrelated: [] };

  const made = new Set<Id>();
  const taken = (id: Id) => index.has(id) || made.has(id);
  const commands: Command[] = [...nesting.first];
  const ids: Id[] = [];
  const added: { id: Id; column: ParsedColumn }[] = [];
  for (const column of columns) {
    const id = freshId(generate, slug(column.name, 'column'), taken);
    made.add(id);
    ids.push(id);
    added.push({ id, column });
    const attributes: Attributes = {};
    if (column.type !== undefined) attributes.type = column.type;
    if (column.primaryKey) attributes.primaryKey = true;
    if (column.notNull) attributes.notNull = true;
    if (column.unique) attributes.unique = true;
    commands.push({
      type: 'create-element',
      element: {
        id,
        component: COLUMN,
        name: column.name,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      },
      containers: [{ container: table, relationType: nesting.relationType }],
      ...madeIn(view),
    });
  }

  // The tables a reference may name, by name: every table of the project.
  const tables = project.model.elements.filter((element) =>
    definitions.componentDerives(element.component, TABLE),
  );
  const columnsOf = (target: Id): { id: Id; name: string; primaryKey: boolean }[] => {
    const existing = index.contentsOf(target).flatMap((id) => {
      const element = index.element(id);
      return element && definitions.componentDerives(element.component, COLUMN)
        ? [{ id, name: element.name, primaryKey: element.attributes?.primaryKey === true }]
        : [];
    });
    const fresh =
      target === table
        ? added.map(({ id, column }) => ({
            id,
            name: column.name,
            primaryKey: column.primaryKey === true,
          }))
        : [];
    return [...existing, ...fresh];
  };
  const unrelated: Unrelated[] = [];
  for (const { id, column } of added) {
    const reference = column.references;
    if (!reference) continue;
    const text = `${reference.table}${reference.column === undefined ? '' : `(${reference.column})`}`;
    const target = tables.find(
      (element) => element.name.toLowerCase() === reference.table.toLowerCase(),
    );
    if (!target) {
      unrelated.push({ text, reason: t('no table named “{name}”', { name: reference.table }) });
      continue;
    }
    const candidates = columnsOf(target.id);
    let to: Id | undefined;
    if (reference.column !== undefined) {
      const wanted = reference.column.toLowerCase();
      to = candidates.find((each) => each.name.toLowerCase() === wanted)?.id;
      if (to === undefined) {
        unrelated.push({
          text,
          reason: t('no column named “{column}” in “{table}”', {
            column: reference.column,
            table: target.name,
          }),
        });
        continue;
      }
    } else {
      const keys = candidates.filter((each) => each.primaryKey);
      if (keys.length !== 1) {
        unrelated.push({
          text,
          reason: t('no single primary key column in “{name}”', { name: target.name }),
        });
        continue;
      }
      to = (keys[0] as { id: Id }).id;
    }
    commands.push({
      type: 'create-relation',
      relation: {
        relationType: REFERENCES,
        from: id,
        to,
        ...(reference.onDelete === undefined
          ? {}
          : { attributes: { onDelete: reference.onDelete } }),
      },
    });
  }
  const label =
    columns.length === 1
      ? `Add 1 column to "${tableElement.name}"`
      : `Add ${columns.length} columns to "${tableElement.name}"`;
  return { command: { type: 'batch', label, commands }, ids, unrelated };
}
