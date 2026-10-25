/** The recipe for SQL DDL: tables become Tables with their columns as rows, foreign keys references. */
import type { Recipe } from './recipe';

const INPUT = `-- The shop's orders database (PostgreSQL).
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  placed_at timestamptz NOT NULL DEFAULT now(),
  total_cents integer NOT NULL CHECK (total_cents >= 0)
);

CREATE TABLE order_items (
  order_id uuid NOT NULL,
  product_sku varchar(32) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_sku),
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE INDEX orders_by_customer ON orders (customer_id);

CREATE TRIGGER orders_touch BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
`;

const column = (ref: string, table: string, name: string, attributes: Record<string, unknown>) => ({
  ref,
  component: 'data-modeling.column',
  name,
  inside: [table],
  nestingRelationType: 'data-modeling.is-column-of',
  attributes,
});

export const SQL_DDL: Recipe = {
  name: 'build_from_sql_ddl',
  material: 'SQL DDL',
  title: 'Build from SQL DDL',
  description:
    'Build tables with their columns and foreign keys from SQL DDL: CREATE TABLE statements, migrations or a schema dump.',
  read: [
    '`CREATE TABLE` statements are in migration folders (`migrations/`, `db/migrate/`, `prisma/migrations/`, `alembic/versions/`), in a dump made with `pg_dump --schema-only` or `mysqldump --no-data`, or pasted. Read migrations in order, applying each `ALTER TABLE` to what the earlier ones made, and model the end result.',
    'Note the dialect (PostgreSQL, MySQL, SQLite, SQL Server): types are kept as written, in that dialect.',
    'Tables use the built-in Data modeling package. When get_project does not list `data-modeling`, add it with update_project, giving every package the project uses already, then `data-modeling`.',
  ],
  mapping: [
    {
      from: '`CREATE TABLE name`',
      to: 'a `data-modeling.table` named as the table is (`order_items` stays `order_items`), described by its `COMMENT ON TABLE`',
    },
    {
      from: 'Each column',
      to: 'a `data-modeling.column` inside its table, given `nestingRelationType: "data-modeling.is-column-of"` (left out, another nesting relation type may be chosen), in the table’s order, which is the order of its rows; its type, as written (`varchar(255)`), is the `type` attribute',
    },
    {
      from: '`PRIMARY KEY`, inline or as a table constraint, `NOT NULL` and `UNIQUE`',
      to: '`primaryKey`, `notNull` and `unique` set to true on each column they name (every column of a composite key); leave the others out, since an absent flag reads as false',
    },
    {
      from: '`DEFAULT …` and `CHECK (…)`',
      to: 'the column’s `default` and `check` attributes, as the text written; they are data, and never run',
    },
    {
      from: '`REFERENCES other (column)`, inline or as `FOREIGN KEY (…) REFERENCES …`',
      to: 'a `data-modeling.references` from the column to the column it references, with `onDelete` (`cascade`, `set null`, `set default`, `restrict` or `no action`) when `ON DELETE` is given; one relation per column of a composite key',
    },
    {
      from: '`CREATE SCHEMA billing`, or tables named `billing.invoices`',
      to: 'when the project uses Systems, a `systems.database` named by the schema, which its tables are part of (`systems.is-part-of`); otherwise ask',
    },
    {
      from: 'A reference to a table the material does not create',
      to: 'nothing: ask about it, and never make the missing table up',
    },
  ],
  views: [
    'One view of the tables, perspective "Data structure", arranged by `data-modeling.is-column-of` (and `systems.is-part-of` when tables sit in a database), so that each table draws its columns as rows, with PK and FK badges.',
    'With many tables, more than about thirty, offer one view per schema or per area the person names.',
  ],
  scenarios: [
    'DDL holds no sequence. Offer a scenario from a log of the queries that touch these tables, once the services that run them are in the model (the logs and traces recipe).',
  ],
  unmatched: [
    '`CREATE INDEX`, `CREATE SEQUENCE`, and enum types (`CREATE TYPE … AS ENUM`, whose values you can offer as a column’s description).',
    '`CREATE VIEW` and materialized views, triggers, functions and procedures: they are code, which the project never holds.',
    '`GRANT`, row-level security policies, partitions, and `INSERT`s of seed data.',
  ],
  example: {
    file: 'db/shop.sql',
    input: INPUT,
    calls: [
      { tool: 'get_project', why: 'The project uses only `systems`.', args: {} },
      {
        tool: 'update_project',
        why: 'Use the built-in Data modeling package, keeping Systems.',
        args: { packages: ['systems', 'data-modeling'] },
      },
      {
        tool: 'list_definitions',
        why: 'Read the Table and Column components and their attributes.',
        args: { package: 'data-modeling' },
      },
      {
        tool: 'add_to_model',
        why: 'Every table with its columns, in order, and both foreign keys, as one action. The trigger and the index are left out.',
        args: {
          label: 'Import the shop tables from db/shop.sql',
          elements: [
            { ref: 'customers', component: 'data-modeling.table', name: 'customers' },
            column('customers-id', 'customers', 'id', { type: 'uuid', primaryKey: true }),
            column('customers-email', 'customers', 'email', {
              type: 'varchar(255)',
              notNull: true,
              unique: true,
            }),
            column('customers-name', 'customers', 'name', { type: 'text', notNull: true }),
            { ref: 'orders', component: 'data-modeling.table', name: 'orders' },
            column('orders-id', 'orders', 'id', { type: 'uuid', primaryKey: true }),
            column('orders-customer-id', 'orders', 'customer_id', { type: 'uuid', notNull: true }),
            column('orders-placed-at', 'orders', 'placed_at', {
              type: 'timestamptz',
              notNull: true,
              default: 'now()',
            }),
            column('orders-total-cents', 'orders', 'total_cents', {
              type: 'integer',
              notNull: true,
              check: 'total_cents >= 0',
            }),
            { ref: 'order-items', component: 'data-modeling.table', name: 'order_items' },
            column('order-items-order-id', 'order-items', 'order_id', {
              type: 'uuid',
              notNull: true,
              primaryKey: true,
            }),
            column('order-items-product-sku', 'order-items', 'product_sku', {
              type: 'varchar(32)',
              notNull: true,
              primaryKey: true,
            }),
            column('order-items-quantity', 'order-items', 'quantity', {
              type: 'integer',
              notNull: true,
              default: '1',
            }),
          ],
          relations: [
            {
              relationType: 'data-modeling.references',
              from: 'orders-customer-id',
              to: 'customers-id',
              attributes: { onDelete: 'cascade' },
            },
            {
              relationType: 'data-modeling.references',
              from: 'order-items-order-id',
              to: 'orders-id',
              attributes: { onDelete: 'cascade' },
            },
          ],
        },
      },
      {
        tool: 'create_view',
        why: 'A view where each table draws its columns as rows.',
        args: {
          name: 'Shop tables',
          perspective: {
            name: 'Data structure',
            description: 'The tables of the orders database, their columns and foreign keys.',
          },
          nestingRelationTypes: ['data-modeling.is-column-of'],
        },
      },
    ],
    leftOut: [
      {
        quote: 'CREATE INDEX orders_by_customer',
        why: 'an index, which the model does not hold; ask whether to note it on the column',
      },
      {
        quote: 'CREATE TRIGGER orders_touch',
        why: 'a trigger is code, which the project never holds',
      },
    ],
  },
};
