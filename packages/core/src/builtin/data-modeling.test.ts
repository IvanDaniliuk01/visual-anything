import type { Element, PackageFile, Relation } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { contrastRatio } from '../colors';
import { definitionsOf } from '../definitions';
import {
  compileFace,
  faceDrawingText,
  faceInputOf,
  facePalette,
  faceProblems,
  layOutFace,
} from '../faces';
import type { ProjectSnapshot } from '../snapshot';
import { DATA_MODELING } from './data-modeling';
import { BUILTIN_PACKAGES, RESERVED_PACKAGE_IDS, builtinPackage } from './index';
import { SYSTEMS } from './systems';

const component = (id: string) => {
  const found = DATA_MODELING.components.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No component ${id}`);
  return found;
};

const relationType = (id: string) => {
  const found = DATA_MODELING.relationTypes.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No relation type ${id}`);
  return found;
};

const attributeNames = (id: string) => (component(id).attributes ?? []).map((each) => each.name);

/** A project with Systems, Data modeling and whatever packages of its own are given. */
function project(
  elements: Element[],
  relations: Relation[],
  own: PackageFile[] = [],
): ProjectSnapshot {
  return {
    project: {
      schemaVersion: 1,
      name: 'Shop',
      packages: ['systems', 'data-modeling', ...own.map((each) => each.id)],
    },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [SYSTEMS, DATA_MODELING, ...own],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const element = (id: string, componentId: string, attributes?: Element['attributes']): Element => ({
  id,
  component: componentId,
  name: id,
  ...(attributes === undefined ? {} : { attributes }),
});

const relation = (from: string, type: string, to: string): Relation => ({
  id: `${from}-${type}-${to}`,
  relationType: type,
  from,
  to,
});

describe('the built-in Data modeling package', () => {
  it('is a valid package file', () => {
    expect(validateFile('package', DATA_MODELING)).toEqual({ ok: true, value: DATA_MODELING });
  });

  it('defines what a whole database holds, each id starting with "data-modeling."', () => {
    expect(DATA_MODELING.components.map((each) => each.name)).toEqual([
      'Table',
      'Column',
      'Schema',
      'View',
      'Materialized view',
      'Enum',
      'Function',
      'Trigger',
      'Sequence',
    ]);
    expect(DATA_MODELING.relationTypes.map((each) => each.name)).toEqual([
      'is column of',
      'references',
      'reads from',
      'writes to',
      'fires on',
      'runs',
      'has type',
    ]);
    for (const { id } of [
      ...DATA_MODELING.components,
      ...DATA_MODELING.relationTypes,
      ...(DATA_MODELING.images ?? []),
    ]) {
      expect(id.startsWith('data-modeling.')).toBe(true);
    }
  });

  it('keeps the ids projects already use, and adds the new ones after them', () => {
    expect(DATA_MODELING.components.map((each) => each.id)).toEqual([
      'data-modeling.table',
      'data-modeling.column',
      'data-modeling.schema',
      'data-modeling.view',
      'data-modeling.materialized-view',
      'data-modeling.enum',
      'data-modeling.function',
      'data-modeling.trigger',
      'data-modeling.sequence',
    ]);
    expect(DATA_MODELING.relationTypes.map((each) => each.id)).toEqual([
      'data-modeling.is-column-of',
      'data-modeling.references',
      'data-modeling.reads-from',
      'data-modeling.writes-to',
      'data-modeling.fires-on',
      'data-modeling.runs',
      'data-modeling.has-type',
    ]);
  });

  it('derives everything up to Essence and "relates to", needing no other package', () => {
    const alone = definitionsOf([DATA_MODELING]);
    expect(alone.problems).toEqual([]);
    for (const { id } of DATA_MODELING.components) {
      expect(alone.component(id)?.lineage.at(-1), id).toBe('essence');
    }
    for (const { id } of DATA_MODELING.relationTypes) {
      expect(alone.relationType(id)?.lineage.at(-1), id).toBe('relates-to');
    }
    const definitions = definitionsOf([SYSTEMS, DATA_MODELING]);
    expect(definitions.problems).toEqual([]);
    expect(definitions.relationType('data-modeling.is-column-of')?.nests).toBe(true);
    for (const id of ['references', 'reads-from', 'writes-to', 'fires-on', 'runs', 'has-type']) {
      expect(definitions.relationType(`data-modeling.${id}`)?.nests, id).toBe(false);
    }
    expect(definitions.component('data-modeling.table')?.appearance.contentsAsRows).toBe(true);
  });

  it('gives a column its default and its check, as text', () => {
    expect(attributeNames('data-modeling.column')).toEqual([
      'type',
      'primaryKey',
      'notNull',
      'unique',
      'default',
      'check',
    ]);
    for (const name of ['default', 'check']) {
      expect(
        component('data-modeling.column').attributes?.find((each) => each.name === name),
      ).toMatchObject({ type: 'string' });
    }
  });

  it('draws a view’s columns as its rows, and a materialized view is a view', () => {
    const definitions = definitionsOf([DATA_MODELING]);
    const view = definitions.component('data-modeling.view');
    expect(view?.lineage).toEqual(['data-modeling.view', 'essence']);
    expect(view?.appearance.contentsAsRows).toBe(true);
    const materialized = definitions.component('data-modeling.materialized-view');
    expect(materialized?.lineage[1]).toBe('data-modeling.view');
    expect(materialized?.appearance.contentsAsRows).toBe(true);
    expect(materialized?.appearance.fill).not.toBe(view?.appearance.fill);
    expect(relationType('data-modeling.is-column-of').limits).toEqual({
      from: ['data-modeling.column'],
      to: ['data-modeling.table', 'data-modeling.view'],
    });
  });

  it('describes enums, functions, triggers and sequences by attributes, never by their code', () => {
    expect(attributeNames('data-modeling.schema')).toEqual([]);
    expect(attributeNames('data-modeling.view')).toEqual([]);
    expect(attributeNames('data-modeling.enum')).toEqual(['values']);
    expect(attributeNames('data-modeling.function')).toEqual(['language', 'arguments', 'returns']);
    expect(attributeNames('data-modeling.trigger')).toEqual(['timing', 'events', 'level']);
    expect(attributeNames('data-modeling.sequence')).toEqual(['type', 'start', 'increment']);
    const trigger = component('data-modeling.trigger').attributes ?? [];
    expect(trigger.find((each) => each.name === 'timing')?.choices).toEqual([
      'before',
      'after',
      'instead of',
    ]);
    expect(trigger.find((each) => each.name === 'level')?.choices).toEqual(['row', 'statement']);
    const names = DATA_MODELING.components.flatMap((each) =>
      (each.attributes ?? []).map((attribute) => attribute.name),
    );
    for (const code of ['body', 'definition', 'query', 'source', 'code', 'sql']) {
      expect(names).not.toContain(code);
    }
  });

  it('says what reads from, writes to, fires on and runs what, in its limits', () => {
    expect(relationType('data-modeling.reads-from').limits).toEqual({
      from: ['data-modeling.view', 'data-modeling.function'],
      to: ['data-modeling.table', 'data-modeling.view'],
    });
    expect(relationType('data-modeling.writes-to').limits).toEqual({
      from: ['data-modeling.function'],
      to: ['data-modeling.table', 'data-modeling.view', 'data-modeling.sequence'],
    });
    expect(relationType('data-modeling.fires-on').limits).toEqual({
      from: ['data-modeling.trigger'],
      to: ['data-modeling.table', 'data-modeling.view'],
    });
    expect(relationType('data-modeling.runs').limits).toEqual({
      from: ['data-modeling.trigger'],
      to: ['data-modeling.function'],
    });
    expect(relationType('data-modeling.has-type').limits).toEqual({
      from: ['data-modeling.column'],
      to: ['data-modeling.enum'],
    });
    for (const each of DATA_MODELING.relationTypes)
      expect(each.direction, each.id).toBe('directed');
  });

  it('holds a whole database, schemas inside it through Systems’ "is part of", with nothing to warn about', () => {
    const state = project(
      [
        element('audit', 'systems.database', { engine: 'postgres' }),
        element('billing', 'data-modeling.schema'),
        element('status', 'data-modeling.enum', { values: 'draft, paid, void' }),
        element('invoices', 'data-modeling.table'),
        element('invoices-id', 'data-modeling.column', { type: 'uuid', primaryKey: true }),
        element('invoices-status', 'data-modeling.column', {
          type: 'status',
          notNull: true,
          default: "'draft'::status",
          check: "status <> 'void' or total = 0",
        }),
        element('invoice-numbers', 'data-modeling.sequence', {
          type: 'bigint',
          start: 1,
          increment: 1,
        }),
        element('open-invoices', 'data-modeling.view'),
        element('open-invoices-id', 'data-modeling.column', { type: 'uuid' }),
        element('totals', 'data-modeling.materialized-view'),
        element('touch', 'data-modeling.function', {
          language: 'plpgsql',
          arguments: '',
          returns: 'trigger',
        }),
        element('invoices-touch', 'data-modeling.trigger', {
          timing: 'before',
          events: 'insert, update',
          level: 'row',
        }),
      ],
      [
        relation('billing', 'systems.is-part-of', 'audit'),
        ...['status', 'invoices', 'invoice-numbers', 'open-invoices', 'totals', 'touch'].map(
          (each) => relation(each, 'systems.is-part-of', 'billing'),
        ),
        relation('invoices-touch', 'systems.is-part-of', 'billing'),
        relation('invoices-id', 'data-modeling.is-column-of', 'invoices'),
        relation('invoices-status', 'data-modeling.is-column-of', 'invoices'),
        relation('open-invoices-id', 'data-modeling.is-column-of', 'open-invoices'),
        relation('open-invoices-id', 'data-modeling.references', 'invoices-id'),
        relation('open-invoices', 'data-modeling.reads-from', 'invoices'),
        relation('totals', 'data-modeling.reads-from', 'open-invoices'),
        relation('touch', 'data-modeling.reads-from', 'invoices'),
        relation('touch', 'data-modeling.writes-to', 'invoices'),
        relation('touch', 'data-modeling.writes-to', 'invoice-numbers'),
        relation('invoices-touch', 'data-modeling.fires-on', 'invoices'),
        relation('invoices-touch', 'data-modeling.runs', 'touch'),
        relation('invoices-status', 'data-modeling.has-type', 'status'),
      ],
    );
    expect(checkProject(state)).toEqual({ errors: [], warnings: [] });
  });

  it('warns, and only warns, about a trigger that fires on a function', () => {
    const state = project(
      [element('touch', 'data-modeling.function'), element('t', 'data-modeling.trigger')],
      [relation('t', 'data-modeling.fires-on', 'touch')],
    );
    const { errors, warnings } = checkProject(state);
    expect(errors).toEqual([]);
    expect(warnings.map((each) => each.code)).toEqual(['limit-broken']);
  });

  it('keeps a project’s own database package, derived from Table and System, opening with no warnings', () => {
    // As the first real model made one before these components were built in (M3d).
    const postgres: PackageFile = {
      id: 'postgres',
      name: 'PostgreSQL',
      components: [
        { id: 'postgres.esquema', name: 'Esquema', derivesFrom: 'systems.system' },
        { id: 'postgres.tabla', name: 'Tabla', derivesFrom: 'data-modeling.table' },
        { id: 'postgres.vista', name: 'Vista', derivesFrom: 'data-modeling.table' },
        { id: 'postgres.funcion', name: 'Función', derivesFrom: 'essence' },
        { id: 'postgres.trigger', name: 'Trigger', derivesFrom: 'essence' },
      ],
      relationTypes: [
        {
          id: 'postgres.lee-de',
          name: 'lee de',
          derivesFrom: 'relates-to',
          limits: { from: ['postgres.vista'], to: ['data-modeling.table'] },
        },
        {
          id: 'postgres.se-dispara-en',
          name: 'se dispara en',
          derivesFrom: 'relates-to',
          limits: { from: ['postgres.trigger'], to: ['data-modeling.table'] },
        },
      ],
    };
    const state = project(
      [
        element('db', 'systems.database'),
        element('engine', 'postgres.esquema'),
        element('run', 'postgres.tabla'),
        element('run-id', 'data-modeling.column', { type: 'uuid', default: 'gen_random_uuid()' }),
        element('runs', 'postgres.vista'),
        element('runs-id', 'data-modeling.column', { type: 'uuid' }),
        element('guard', 'postgres.trigger'),
      ],
      [
        relation('engine', 'systems.is-part-of', 'db'),
        relation('run', 'systems.is-part-of', 'engine'),
        relation('runs', 'systems.is-part-of', 'engine'),
        relation('run-id', 'data-modeling.is-column-of', 'run'),
        relation('runs-id', 'data-modeling.is-column-of', 'runs'),
        relation('runs', 'postgres.lee-de', 'run'),
        relation('guard', 'postgres.se-dispara-en', 'run'),
      ],
      [postgres],
    );
    expect(checkProject(state)).toEqual({ errors: [], warnings: [] });
  });

  it('names only definitions it has, in its limits and its badges', () => {
    const definitions = definitionsOf([DATA_MODELING]);
    const known = (id: string) =>
      definitions.component(id) !== undefined || definitions.relationType(id) !== undefined;
    for (const each of DATA_MODELING.relationTypes) {
      for (const limit of [each.limits?.from, each.limits?.to]) {
        if (Array.isArray(limit)) for (const id of limit) expect(known(id), id).toBe(true);
      }
    }
    for (const each of DATA_MODELING.components) {
      const attributes = new Set(
        definitions.component(each.id)?.attributes.map((attribute) => attribute.name),
      );
      for (const name of each.appearance?.detail?.attributes ?? []) {
        expect(attributes.has(name), `${each.id} ${name}`).toBe(true);
      }
      for (const badge of each.appearance?.detail?.badges ?? []) {
        if (badge.when === 'from-end') expect(known(badge.relationType)).toBe(true);
        else expect(attributes.has(badge.attribute)).toBe(true);
      }
    }
  });

  it('gives its attributes no defaults, so their values are data and not particularities', () => {
    for (const each of DATA_MODELING.components) {
      for (const attribute of each.attributes ?? []) {
        expect(attribute.default, `${each.id} ${attribute.name}`).toBeUndefined();
      }
    }
  });

  it('gives every new component an icon of its own, drawn for Visual Anything', () => {
    const images = new Map((DATA_MODELING.images ?? []).map((image) => [image.id, image]));
    for (const id of [
      'schema',
      'view',
      'materialized-view',
      'enum',
      'function',
      'trigger',
      'sequence',
    ]) {
      const shown = component(`data-modeling.${id}`).appearance?.image;
      expect(typeof shown === 'object' && images.has(shown.image), id).toBe(true);
    }
    for (const image of images.values()) {
      expect(image).toMatchObject({ source: 'Drawn for Visual Anything', license: 'CC0-1.0' });
    }
  });

  it('draws its icons in colours that read at 3:1 or more on their component’s fill, in both themes', () => {
    const definitions = definitionsOf(BUILTIN_PACKAGES);
    for (const each of DATA_MODELING.components) {
      const shown = each.appearance?.image;
      if (typeof shown !== 'object') continue;
      const image = DATA_MODELING.images?.find((found) => found.id === shown.image);
      if (image?.kind !== 'svg') throw new Error(`${each.id} shows no SVG icon of its package`);
      const resolved = definitions.component(each.id);
      for (const color of new Set(image.svg.match(/#[0-9A-F]{6}/g) ?? [])) {
        for (const fill of [resolved?.appearance.fill, resolved?.darkColors.fill]) {
          expect(contrastRatio(color, fill ?? ''), `${each.id} ${color}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  describe('faces (ADR 0083)', () => {
    const definitions = definitionsOf([SYSTEMS, DATA_MODELING]);
    const resolved = (id: string) => {
      const found = definitions.component(id);
      if (found?.appearance.face === undefined) throw new Error(`${id} has no face`);
      return { component: found, face: found.appearance.face };
    };
    /** Every problem of a component's face, in both themes, as opening would find them. */
    const problemsOf = (id: string) => {
      const { component: found, face } = resolved(id);
      return faceProblems(face, {
        attributes: new Set(found.attributes.map((each) => each.name)),
        palettes: {
          light: facePalette('light', found.appearance.fill, found.appearance.stroke),
          dark: facePalette('dark', found.darkColors.fill, found.darkColors.stroke),
        },
      });
    };
    const drawn = (id: string, of: Element, options: { width: number; height?: number }) => {
      const input = faceInputOf(of, definitions);
      return layOutFace(compileFace(resolved(id).face), input, options);
    };

    it('gives a table a header with its name and its schema, then its rows, as tall as the canvas’s own', () => {
      expect(problemsOf('data-modeling.table')).toEqual([]);
      expect(attributeNames('data-modeling.table')).toEqual(['schema']);
      const table = drawn(
        'data-modeling.table',
        element('invoices', 'data-modeling.table', { schema: 'billing' }),
        { width: 240 },
      );
      expect(faceDrawingText(table)).toBe('invoices\nbilling');
      expect(table.regions.map((each) => [each.kind, each.y])).toEqual([['rows', 32]]);
      const run = (text: string) => table.runs.find((each) => each.text === text)!;
      // The name on the left, as the canvas writes it, the schema on the right, left of the toggle.
      expect(run('invoices')).toMatchObject({ x: 12, variant: 'bold', size: 14 });
      expect(run('billing').x + run('billing').width).toBeLessThanOrEqual(240 - 24);
      // Without a schema, the name alone; a long name is cut on one line.
      const alone = drawn(
        'data-modeling.table',
        element('a_table_with_a_name_far_too_long_for_its_header', 'data-modeling.table'),
        { width: 240 },
      );
      expect(alone.runs).toHaveLength(1);
      expect(alone.runs[0]!.text.endsWith('…')).toBe(true);
      expect(alone.regions[0]!.y).toBe(32);
    });

    it('gives a column its name, its type, and its PK, FK, NOT NULL and UNIQUE badges on its row', () => {
      expect(problemsOf('data-modeling.column')).toEqual([]);
      const state = project(
        [
          element('orders', 'data-modeling.table'),
          element('customers', 'data-modeling.table'),
          element('customer-id', 'data-modeling.column', {
            type: 'uuid',
            primaryKey: true,
            notNull: true,
            unique: true,
          }),
          element('order-customer', 'data-modeling.column', { type: 'uuid', notNull: true }),
          element('note', 'data-modeling.column'),
        ],
        [relation('order-customer', 'data-modeling.references', 'customer-id')],
      );
      const fromState = definitionsOf(state.packages);
      const face = compileFace(fromState.component('data-modeling.column')!.appearance.face!);
      const row = (id: string) => {
        const column = state.model.elements.find((each) => each.id === id)!;
        const started = new Set(
          state.model.relations.filter((each) => each.from === id).map((each) => each.relationType),
        );
        return layOutFace(face, faceInputOf(column, fromState, { startedTypes: started }), {
          width: 240,
          height: 24,
        });
      };
      const key = row('customer-id');
      expect(faceDrawingText(key)).toBe('customer-id\nuuid\nPK\nNOT NULL\nUNIQUE');
      expect(key.cut).toBe(false);
      expect(faceDrawingText(row('order-customer'))).toBe('order-customer\nuuid\nFK\nNOT NULL');
      expect(faceDrawingText(row('note'))).toBe('note');
      // On one line, each text a run of its own, inside its band and its width.
      for (const drawing of [key, row('order-customer')]) {
        expect(drawing.runs).toHaveLength(faceDrawingText(drawing).split('\n').length);
        for (const each of drawing.runs) {
          expect(each.y).toBeGreaterThan(0);
          expect(each.y).toBeLessThan(24);
          expect(each.x + each.width).toBeLessThanOrEqual(240);
        }
      }
    });
  });

  it('is built in, and its id is reserved with those of the domains planned next', () => {
    expect(BUILTIN_PACKAGES.slice(0, 2)).toEqual([SYSTEMS, DATA_MODELING]);
    expect(builtinPackage('data-modeling')).toBe(DATA_MODELING);
    expect([...RESERVED_PACKAGE_IDS]).toEqual([
      'systems',
      'data-modeling',
      'c4',
      'data-science',
      'neuroscience',
      'physical-ai',
      'machine-learning',
      'process',
      'networks',
      'kubernetes',
      'control-and-circuits',
      'anatomy',
      'finance',
    ]);
    for (const builtin of BUILTIN_PACKAGES) expect(RESERVED_PACKAGE_IDS.has(builtin.id)).toBe(true);
  });
});
