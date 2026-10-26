import { DATA_MODELING, SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Element,
  PackageFile,
  Relation,
  ShapePosition,
  ViewFile,
} from '@visual-anything/schema';

/** A column of a table in `tablesProject`. */
export interface ColumnSpec {
  id: string;
  name?: string;
  type?: string;
  primaryKey?: boolean;
}

/** A table in `tablesProject`, with its columns in order. */
export interface TableSpec {
  id: string;
  name?: string;
  columns: ColumnSpec[];
  /** Where the view places it; absent, the stand-in row does. */
  at?: { x: number; y: number; width?: number; height?: number };
  /** The element it sits in, through "is part of". */
  in?: string;
}

export interface TablesFixture {
  tables: TableSpec[];
  /** Foreign keys, column to column (or table), by id. */
  references?: { id: string; from: string; to: string }[];
  /** Other elements, with their relations. */
  elements?: Element[];
  relations?: Relation[];
  positions?: ShapePosition[];
  /** The view's nesting relation types; by default "is part of" and "is column of". */
  nesting?: string[];
  collapsed?: string[];
  packages?: PackageFile[];
}

export const VIEW = 'tables';

/**
 * A project that uses the Systems and Data modeling packages, with tables whose columns are held by
 * "is column of", and one view, `tables`, that nests by "is part of" and "is column of".
 */
export function tablesProject(fixture: TablesFixture): ProjectSnapshot {
  const elements: Element[] = [...(fixture.elements ?? [])];
  const relations: Relation[] = [...(fixture.relations ?? [])];
  const positions: ShapePosition[] = [...(fixture.positions ?? [])];
  for (const table of fixture.tables) {
    elements.push({ id: table.id, component: 'data-modeling.table', name: table.name ?? table.id });
    if (table.in !== undefined) {
      relations.push({
        id: `${table.id}-in`,
        relationType: 'systems.is-part-of',
        from: table.id,
        to: table.in,
      });
    }
    if (table.at) {
      positions.push({
        element: table.id,
        ...(table.in === undefined ? {} : { container: table.in }),
        ...table.at,
      });
    }
    for (const column of table.columns) {
      const attributes: Record<string, string | boolean> = {};
      if (column.type !== undefined) attributes.type = column.type;
      if (column.primaryKey) attributes.primaryKey = true;
      elements.push({
        id: column.id,
        component: 'data-modeling.column',
        name: column.name ?? column.id,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      });
      relations.push({
        id: `${column.id}-of`,
        relationType: 'data-modeling.is-column-of',
        from: column.id,
        to: table.id,
      });
    }
  }
  for (const reference of fixture.references ?? []) {
    relations.push({ ...reference, relationType: 'data-modeling.references' });
  }
  const own = fixture.packages ?? [];
  const view: ViewFile = {
    id: VIEW,
    name: 'Tables',
    perspective: { name: 'Data' },
    nestingRelationTypes: fixture.nesting ?? ['systems.is-part-of', 'data-modeling.is-column-of'],
    positions,
    freeShapes: [],
    ...(fixture.collapsed ? { collapsed: [...fixture.collapsed].sort() } : {}),
  };
  return {
    project: {
      schemaVersion: 1,
      name: 'Tables',
      packages: ['systems', 'data-modeling', ...own.map((pack) => pack.id)],
    },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [SYSTEMS, DATA_MODELING, ...own],
    views: [view],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

/** Users and orders, related by a foreign key from orders.user_id to users.id. */
export function usersAndOrders(extra: Partial<TablesFixture> = {}): ProjectSnapshot {
  return tablesProject({
    tables: [
      {
        id: 'users',
        at: { x: 0, y: 0 },
        columns: [
          { id: 'users-id', name: 'id', type: 'uuid', primaryKey: true },
          { id: 'users-email', name: 'email', type: 'text' },
          { id: 'users-name', name: 'name', type: 'text' },
        ],
      },
      {
        id: 'orders',
        at: { x: 480, y: 120 },
        columns: [
          { id: 'orders-id', name: 'id', type: 'uuid', primaryKey: true },
          { id: 'orders-user', name: 'user_id', type: 'uuid' },
          { id: 'orders-total', name: 'total', type: 'numeric(10, 2)' },
        ],
      },
    ],
    references: [{ id: 'orders-user-fk', from: 'orders-user', to: 'users-id' }],
    ...extra,
  });
}
