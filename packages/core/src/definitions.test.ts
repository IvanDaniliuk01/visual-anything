import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { appearanceOf, definitionsOf } from './definitions';
import { TEST_PACKAGE } from './test/fixtures';

/** The traits Essence gives that the test package never sets. */
const ESSENCE_EXTRAS = {
  detail: { componentName: true, attributes: [], badges: [], lines: 3 },
  textPlacement: 'middle',
  contentsAsRows: false,
  connectionPoints: [],
  dash: 'solid',
  opacity: 1,
  text: {},
};

describe('definitionsOf', () => {
  const definitions = definitionsOf([TEST_PACKAGE]);

  it('resolves a component along what it derives from, up to Essence', () => {
    const service = definitions.component('test.service');
    expect(service?.lineage).toEqual(['test.service', 'test.box', 'essence']);
    expect(service?.package).toBe('test');
    expect(service?.appearance).toEqual({
      shape: 'rounded-rectangle',
      fill: '#EEEEEE',
      stroke: '#52606D',
      width: 180,
      height: 72,
      ...ESSENCE_EXTRAS,
    });
  });

  it('inherits attributes, a redefinition taking the place of what it redefines', () => {
    expect(definitions.component('test.service')?.attributes).toEqual([
      { name: 'owner', type: 'string', description: 'The team that runs it.' },
      { name: 'latency', type: 'number', default: 100 },
    ]);
  });

  it('lifts an inherited limit with "any", and inherits a limit left out', () => {
    const lifted = definitionsOf([
      {
        ...TEST_PACKAGE,
        relationTypes: [
          ...TEST_PACKAGE.relationTypes,
          { id: 'test.peeks', name: 'peeks', derivesFrom: 'test.reads', limits: { to: 'any' } },
          { id: 'test.glances', name: 'glances', derivesFrom: 'test.peeks' },
        ],
      },
    ]);
    expect(lifted.relationType('test.peeks')?.limits).toEqual({ from: ['test.service'] });
    expect(lifted.relationType('test.glances')?.limits).toEqual({ from: ['test.service'] });
  });

  it('resolves a relation type trait by trait, limits included', () => {
    const reads = definitions.relationType('test.reads');
    expect(reads?.lineage).toEqual(['test.reads', 'test.calls', 'relates-to']);
    expect(reads?.direction).toBe('directed');
    expect(reads?.nests).toBe(false);
    expect(reads?.appearance).toEqual({ stroke: '#333333', width: 2, dash: 'dashed', opacity: 1 });
    expect(reads?.limits).toEqual({ from: ['test.service'], to: ['test.database'] });
  });

  it('knows Essence and "relates to", and that "relates to" is undirected', () => {
    expect(definitions.component('essence')?.lineage).toEqual(['essence']);
    expect(definitions.relationType('relates-to')?.direction).toBe('undirected');
    expect(definitions.relationType('relates-to')?.limits).toEqual({});
  });

  it('says whether one definition derives from another', () => {
    expect(definitions.componentDerives('test.service', 'test.box')).toBe(true);
    expect(definitions.componentDerives('test.service', 'essence')).toBe(true);
    expect(definitions.componentDerives('test.box', 'test.service')).toBe(false);
    expect(definitions.relationTypeDerives('test.reads', 'test.calls')).toBe(true);
    expect(definitions.componentsDerivedFrom('test.box')).toEqual([
      'test.service',
      'test.database',
    ]);
  });

  it('lists the relation types that nest', () => {
    expect([...definitions.nestingRelationTypes]).toEqual(['test.inside']);
  });

  it('returns undefined for what no package defines', () => {
    expect(definitions.component('test.nothing')).toBeUndefined();
    expect(definitions.relationType('test.nothing')).toBeUndefined();
    expect(definitions.problems).toEqual([]);
  });

  it('shares the result for the same array of packages', () => {
    expect(definitionsOf(TEST_PACKAGE_ARRAY)).toBe(definitionsOf(TEST_PACKAGE_ARRAY));
  });
});

const TEST_PACKAGE_ARRAY = [TEST_PACKAGE];

describe('the problems of definitions', () => {
  const file = (components: PackageFile['components']): PackageFile => ({
    id: 'p',
    name: 'P',
    components,
    relationTypes: [],
  });

  it('reports a parent no package defines, once, on the definition that names it', () => {
    const definitions = definitionsOf([
      file([
        { id: 'p.a', name: 'A', derivesFrom: 'p.missing' },
        { id: 'p.b', name: 'B', derivesFrom: 'p.a' },
      ]),
    ]);
    expect(definitions.problems).toEqual([
      expect.objectContaining({ code: 'unknown-parent', subjects: ['p.a'] }),
    ]);
    expect(definitions.component('p.b')?.lineage).toEqual(['p.b', 'p.a']);
  });

  it('reports a derivation cycle once and still resolves its members', () => {
    const definitions = definitionsOf([
      file([
        { id: 'p.a', name: 'A', derivesFrom: 'p.b' },
        { id: 'p.b', name: 'B', derivesFrom: 'p.c' },
        { id: 'p.c', name: 'C', derivesFrom: 'p.b' },
      ]),
    ]);
    expect(definitions.problems).toEqual([
      expect.objectContaining({ code: 'derivation-cycle', subjects: ['p.b', 'p.c'] }),
    ]);
    expect(definitions.component('p.a')?.appearance.shape).toBe('rectangle');
  });

  it('reports ids defined twice, ids outside the package and redefinitions of Essence', () => {
    const definitions = definitionsOf([
      file([
        { id: 'p.a', name: 'A', derivesFrom: 'essence' },
        { id: 'p.a', name: 'A again', derivesFrom: 'essence' },
        { id: 'other.b', name: 'B', derivesFrom: 'essence' },
        { id: 'essence', name: 'Essence', derivesFrom: 'essence' },
      ]),
    ]);
    expect(definitions.problems.map((each) => each.code)).toEqual([
      'defined-twice',
      'id-outside-package',
      'defined-twice',
    ]);
    expect(definitions.component('p.a')?.name).toBe('A');
  });
});

describe('appearanceOf', () => {
  const definitions = definitionsOf([TEST_PACKAGE]);

  it("layers an element's own appearance over its component's", () => {
    expect(
      appearanceOf({ component: 'test.database', appearance: { fill: '#FF0000' } }, definitions),
    ).toEqual({
      shape: 'cylinder',
      fill: '#FF0000',
      stroke: '#52606D',
      width: 150,
      height: 72,
      ...ESSENCE_EXTRAS,
    });
  });

  it('draws an element of an unknown component like Essence', () => {
    expect(appearanceOf({ component: 'test.nothing' }, definitions).shape).toBe('rectangle');
  });
});
