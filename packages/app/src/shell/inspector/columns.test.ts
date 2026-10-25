import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseColumns } from './columns';

describe('parseColumns', () => {
  it('reads a list typed by hand, one column a line', () => {
    expect(parseColumns('id uuid pk\nemail text not null unique\nname').columns).toEqual([
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'email', type: 'text', notNull: true, unique: true },
      { name: 'name' },
    ]);
  });

  it('reads a one-line list, keeping commas inside a type', () => {
    expect(parseColumns('id int, total numeric(10, 2), note varchar(255)').columns).toEqual([
      { name: 'id', type: 'int' },
      { name: 'total', type: 'numeric(10, 2)' },
      { name: 'note', type: 'varchar(255)' },
    ]);
  });

  it('reads a Postgres dump', () => {
    const parsed = parseColumns(`
      -- The appointments of the clinic.
      CREATE TABLE public.appointments (
          id uuid DEFAULT gen_random_uuid() NOT NULL,
          patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
          starts_at timestamp with time zone NOT NULL,
          status character varying(32) DEFAULT 'booked'::character varying,
          CONSTRAINT appointments_pkey PRIMARY KEY (id)
      );
    `);
    expect(parsed.table).toBe('appointments');
    expect(parsed.columns).toEqual([
      { name: 'id', type: 'uuid', notNull: true, primaryKey: true },
      {
        name: 'patient_id',
        type: 'uuid',
        notNull: true,
        references: { table: 'patients', column: 'id', onDelete: 'cascade' },
      },
      { name: 'starts_at', type: 'timestamp with time zone', notNull: true },
      { name: 'status', type: 'character varying(32)' },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it('reads a MySQL dump, with its quoted names, keys and table options', () => {
    const parsed = parseColumns(`
      CREATE TABLE IF NOT EXISTS \`patients\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`clinic_id\` int(11) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`patients_email\` (\`email\`),
        KEY \`patients_clinic\` (\`clinic_id\`),
        CONSTRAINT \`patients_clinic_fk\` FOREIGN KEY (\`clinic_id\`) REFERENCES \`clinics\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    expect(parsed.table).toBe('patients');
    expect(parsed.columns).toEqual([
      { name: 'id', type: 'int(11)', notNull: true, primaryKey: true },
      { name: 'email', type: 'varchar(255)', notNull: true, unique: true },
      { name: 'clinic_id', type: 'int(11)', references: { table: 'clinics', column: 'id' } },
    ]);
    expect(parsed.skipped.map((each) => each.reason)).toEqual(['an index, not a column']);
  });

  it('reads a SQLite dump, with a composite primary key and a table-level foreign key', () => {
    const parsed = parseColumns(`CREATE TABLE "visits" (
      "patient" INTEGER NOT NULL,
      "day" TEXT NOT NULL,
      [room] TEXT,
      PRIMARY KEY ("patient", "day"),
      FOREIGN KEY("patient") REFERENCES "patients"("id")
    );`);
    expect(parsed.columns).toEqual([
      {
        name: 'patient',
        type: 'INTEGER',
        notNull: true,
        primaryKey: true,
        references: { table: 'patients', column: 'id' },
      },
      { name: 'day', type: 'TEXT', notNull: true, primaryKey: true },
      { name: 'room', type: 'TEXT' },
    ]);
  });

  it('reads a reference that leaves out the column', () => {
    expect(parseColumns('owner int references users').columns).toEqual([
      { name: 'owner', type: 'int', references: { table: 'users' } },
    ]);
  });

  it('skips what it cannot read, and says why', () => {
    const parsed = parseColumns(
      'id int, CHECK (id > 0), PRIMARY KEY (missing), UNIQUE (a, b), a int, b int',
    );
    expect(parsed.columns.map((column) => column.name)).toEqual(['id', 'a', 'b']);
    expect(parsed.skipped).toEqual([
      { text: 'CHECK (id > 0)', reason: 'a check, not a column' },
      { text: 'PRIMARY KEY (missing)', reason: 'no column named “missing”' },
      { text: 'UNIQUE (a, b)', reason: 'a unique key over several columns' },
    ]);
  });

  it('reads nothing from nothing', () => {
    expect(parseColumns('')).toEqual({ columns: [], skipped: [] });
    expect(parseColumns('  -- only a comment\n  ')).toEqual({ columns: [], skipped: [] });
  });

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (text) => {
        const parsed = parseColumns(text);
        expect(Array.isArray(parsed.columns)).toBe(true);
        for (const column of parsed.columns) expect(column.name.length).toBeGreaterThan(0);
      }),
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            'create table t (',
            ')',
            '(',
            ',',
            '"',
            '`',
            '[',
            ']',
            ' primary key ',
            ' references ',
            ' foreign key ',
            ' not null',
            'id',
            ' int',
            '\n',
            '--',
            "'",
            ';',
          ),
          { maxLength: 40 },
        ),
        (parts) => {
          expect(() => parseColumns(parts.join(''))).not.toThrow();
        },
      ),
    );
  });
});
