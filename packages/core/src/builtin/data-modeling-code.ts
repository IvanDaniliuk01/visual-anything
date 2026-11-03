/**
 * The code of the built-in "Data modeling" package (ADR 0089's M14.6 clarification): an exporter of
 * SQL DDL and the action "Find tables no relation reaches", run by the app's code worker in QuickJS as
 * any package's code is, within ADR 0054's limits. Built-in code ships with the program, so it runs as
 * the program's own, without the person's approval, and can be turned off on a computer in
 * "Packages…".
 *
 * The code is JavaScript text, as a package file holds it. It reads the model through `context.model`
 * (`model:read`) and answers plain data: a text for the exporter, changes for the person's review for
 * the action. It never writes anything itself.
 */
import type { PackageExtensions } from '@visual-anything/schema';

/** What the code adds to the app, declared in the package file so that menus list it. */
export const DATA_MODELING_EXTENSIONS: PackageExtensions = {
  actions: [
    {
      id: 'find-unreached',
      label: 'Find tables no relation reaches',
      description:
        'Marks, for your review, the tables no reference starts or ends on, at the table or at one of its columns: those of the selection, or every table when none is selected.',
      where: ['selection', 'packages-menu'],
      components: ['data-modeling.table'],
    },
  ],
  exporters: [{ id: 'sql-ddl', label: 'SQL DDL (CREATE TABLE)', extension: '.sql' }],
};

/** The color and the dash a table no relation reaches is marked with: red, 3:1 on both canvases. */
export const UNREACHED_MARK = { stroke: '#C4320A', dash: 'dashed' } as const;

/**
 * The module's text. It avoids template literals, so that it can sit in this one, and keeps every
 * line within the package file's 10,000 characters.
 */
const SOURCE = String.raw`// The built-in package "Data modeling" of Visual Anything: an exporter of SQL DDL, and the action
// "Find tables no relation reaches". It reads the model through context.model, and never writes.
const TABLE = 'data-modeling.table';
const COLUMN = 'data-modeling.column';
const ENUM = 'data-modeling.enum';
const COLUMN_OF = 'data-modeling.is-column-of';
const REFERENCES = 'data-modeling.references';
const MARK = { stroke: '${UNREACHED_MARK.stroke}', dash: '${UNREACHED_MARK.dash}' };

// Words SQL keeps for itself, which a name is quoted to use.
const RESERVED = new Set([
  'all', 'and', 'any', 'as', 'asc', 'between', 'by', 'case', 'check', 'column', 'constraint',
  'create', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'exists', 'false',
  'for', 'foreign', 'from', 'grant', 'group', 'having', 'in', 'index', 'insert', 'into', 'is',
  'join', 'key', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or', 'order', 'primary',
  'references', 'select', 'set', 'table', 'then', 'to', 'true', 'union', 'unique', 'update',
  'user', 'using', 'values', 'view', 'when', 'where', 'with',
]);

function relationsOf(model, id) {
  const found = [];
  const ids = model.relationsOn(id);
  for (let at = 0; at < ids.length; at += 1) {
    const relation = model.relation(ids[at]);
    if (relation) found.push(relation);
  }
  return found;
}

// The columns of a table, in the model's order, which is the order of its rows.
function columnsOf(model, table, order) {
  const columns = [];
  const relations = relationsOf(model, table);
  for (let at = 0; at < relations.length; at += 1) {
    const relation = relations[at];
    if (relation.relationType !== COLUMN_OF || relation.to !== table) continue;
    const column = model.element(relation.from);
    if (column && order.has(column.id)) columns.push(column);
  }
  columns.sort(function (a, b) { return order.get(a.id) - order.get(b.id); });
  return columns;
}

// The table each column is a column of.
function tablesOfColumns(model, tables, order) {
  const of = new Map();
  for (let at = 0; at < tables.length; at += 1) {
    const columns = columnsOf(model, tables[at].id, order);
    for (let each = 0; each < columns.length; each += 1) {
      if (!of.has(columns[each].id)) of.set(columns[each].id, tables[at]);
    }
  }
  return of;
}

function elementsOf(model, component) {
  const found = [];
  const ids = model.elements(component);
  for (let at = 0; at < ids.length; at += 1) {
    const element = model.element(ids[at]);
    if (element) found.push(element);
  }
  return found;
}

function positions(model, component) {
  const order = new Map();
  const ids = model.elements(component);
  for (let at = 0; at < ids.length; at += 1) order.set(ids[at], at);
  return order;
}

// ——— The exporter ———

function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function name(text) {
  const plain = oneLine(text);
  if (/^[a-z_][a-z0-9_]*$/.test(plain) && !RESERVED.has(plain)) return plain;
  return '"' + plain.replace(/"/g, '""') + '"';
}

function qualified(element) {
  const schema = element.attributes.schema;
  const own = name(element.name === '' ? element.id : element.name);
  return typeof schema === 'string' && oneLine(schema) !== '' ? name(schema) + '.' + own : own;
}

function text(value) {
  return typeof value === 'string' ? oneLine(value) : '';
}

function comment(lines, description) {
  if (typeof description !== 'string' || description.trim() === '') return;
  const parts = description.split(/\r?\n/);
  for (let at = 0; at < parts.length; at += 1) lines.push('-- ' + parts[at].trim());
}

function literal(value) {
  return "'" + value.replace(/'/g, "''") + "'";
}

function columnLine(column) {
  const values = column.attributes;
  const type = text(values.type);
  const parts = [name(column.name === '' ? column.id : column.name), type === '' ? 'text' : type];
  if (values.notNull === true) parts.push('NOT NULL');
  if (values.unique === true) parts.push('UNIQUE');
  const fallback = text(values.default);
  if (fallback !== '') parts.push('DEFAULT ' + fallback);
  const check = text(values.check);
  if (check !== '') parts.push('CHECK (' + check + ')');
  return { sql: parts.join(' '), note: type === '' ? 'the model gives it no type' : undefined };
}

function tableStatement(model, table, order) {
  const lines = [];
  comment(lines, table.description);
  const columns = columnsOf(model, table.id, order);
  const entries = columns.map(columnLine);
  const keys = columns.filter(function (column) { return column.attributes.primaryKey === true; });
  if (keys.length > 0) {
    entries.push({
      sql: 'PRIMARY KEY (' + keys.map(function (column) { return name(column.name); }).join(', ') + ')',
    });
  }
  if (entries.length === 0) {
    lines.push('-- The model gives it no columns.');
    lines.push('CREATE TABLE ' + qualified(table) + ' ();');
    return lines.join('\n');
  }
  lines.push('CREATE TABLE ' + qualified(table) + ' (');
  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at];
    lines.push(
      '  ' + entry.sql + (at < entries.length - 1 ? ',' : '') + (entry.note ? ' -- ' + entry.note : ''),
    );
  }
  lines.push(');');
  return lines.join('\n');
}

function foreignKeys(model, tables, order) {
  const lines = [];
  const of = tablesOfColumns(model, tables, order);
  const tableIds = new Set(tables.map(function (table) { return table.id; }));
  const seen = new Set();
  const ends = new Set();
  for (let at = 0; at < tables.length; at += 1) {
    ends.add(tables[at].id);
    const columns = columnsOf(model, tables[at].id, order);
    for (let each = 0; each < columns.length; each += 1) ends.add(columns[each].id);
  }
  ends.forEach(function (end) {
    const relations = relationsOf(model, end);
    for (let at = 0; at < relations.length; at += 1) {
      const relation = relations[at];
      if (relation.relationType !== REFERENCES || relation.from !== end || seen.has(relation.id)) {
        continue;
      }
      seen.add(relation.id);
      const fromTable = of.get(relation.from);
      const toTable = of.get(relation.to);
      if (fromTable && toTable) {
        const from = model.element(relation.from);
        const to = model.element(relation.to);
        const onDelete = text(relation.attributes.onDelete);
        lines.push(
          'ALTER TABLE ' + qualified(fromTable) + '\n  ADD FOREIGN KEY (' + name(from.name) +
            ') REFERENCES ' + qualified(toTable) + ' (' + name(to.name) + ')' +
            (onDelete === '' ? '' : ' ON DELETE ' + onDelete.toUpperCase()) + ';',
        );
      } else {
        const from = model.element(relation.from);
        const to = model.element(relation.to);
        if (!from || !to) continue;
        const fromName = tableIds.has(from.id) ? qualified(from) : from.name;
        const toName = tableIds.has(to.id) ? qualified(to) : to.name;
        lines.push('-- ' + oneLine(fromName) + ' references ' + oneLine(toName) + ', with no columns to write as a foreign key.');
      }
    }
  });
  return lines;
}

function enumStatement(element) {
  const values = text(element.attributes.values);
  const list = values === '' ? [] : values.split(',').map(function (each) { return each.trim(); }).filter(Boolean);
  const lines = [];
  comment(lines, element.description);
  lines.push('CREATE TYPE ' + qualified(element) + ' AS ENUM (' + list.map(literal).join(', ') + ');');
  return lines.join('\n');
}

function sqlDdl(model) {
  const order = positions(model, COLUMN);
  const tables = elementsOf(model, TABLE);
  const enums = elementsOf(model, ENUM);
  const parts = [
    '-- Written by the built-in package "Data modeling" of Visual Anything: the tables of the model,',
    '-- their columns, primary keys and foreign keys. Views, functions, triggers and sequences are left',
    '-- out, as the model holds none of their code.',
  ];
  const schemas = [];
  for (let at = 0; at < tables.length; at += 1) {
    const schema = tables[at].attributes.schema;
    if (typeof schema === 'string' && oneLine(schema) !== '' && schemas.indexOf(name(schema)) < 0) {
      schemas.push(name(schema));
    }
  }
  const blocks = [parts.join('\n')];
  if (schemas.length > 0) {
    blocks.push(schemas.map(function (schema) { return 'CREATE SCHEMA IF NOT EXISTS ' + schema + ';'; }).join('\n'));
  }
  for (let at = 0; at < enums.length; at += 1) blocks.push(enumStatement(enums[at]));
  for (let at = 0; at < tables.length; at += 1) blocks.push(tableStatement(model, tables[at], order));
  if (tables.length === 0) blocks.push('-- The model holds no tables.');
  const keys = foreignKeys(model, tables, order);
  if (keys.length > 0) blocks.push(keys.join('\n\n'));
  return blocks.join('\n\n') + '\n';
}

export function exportFile(input, context) {
  if (input.exporter !== 'sql-ddl') throw new Error('Data modeling writes no "' + input.exporter + '".');
  if (!context.model) throw new Error('Writing SQL DDL needs to read the model.');
  return sqlDdl(context.model);
}

// ——— The action ———

// Whether a reference starts or ends on the table, or on one of its columns.
function reached(model, table, order) {
  const ends = [table.id].concat(columnsOf(model, table.id, order).map(function (column) { return column.id; }));
  for (let at = 0; at < ends.length; at += 1) {
    const relations = relationsOf(model, ends[at]);
    for (let each = 0; each < relations.length; each += 1) {
      if (relations[each].relationType === REFERENCES) return true;
    }
  }
  return false;
}

export function act(input, context) {
  if (input.action !== 'find-unreached') throw new Error('Data modeling has no action "' + input.action + '".');
  if (!context.model) throw new Error('Finding tables needs to read the model.');
  const model = context.model;
  const order = positions(model, COLUMN);
  const all = elementsOf(model, TABLE);
  const chosen = new Set(input.selection);
  const tables = chosen.size === 0 ? all : all.filter(function (table) { return chosen.has(table.id); });
  const unreached = tables.filter(function (table) { return !reached(model, table, order); });
  const names = unreached.map(function (table) { return table.name; });
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '');
  return {
    label:
      unreached.length === 1
        ? 'Mark the table no relation reaches: ' + shown
        : 'Mark the ' + unreached.length + ' tables no relation reaches: ' + shown,
    commands: unreached.map(function (table) {
      return { type: 'update-element', id: table.id, changes: { appearanceTraits: MARK } };
    }),
  };
}`;

/** The code's lines, as the package file holds them. */
export const DATA_MODELING_CODE: readonly string[] = SOURCE.split('\n');
