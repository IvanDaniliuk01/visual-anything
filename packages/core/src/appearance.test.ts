import fc from 'fast-check';
import type {
  Appearance,
  Badge,
  Component,
  DetailRules,
  Element,
  PackageFile,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_TRAITS,
  TRAIT_PATHS,
  attributeValue,
  detailParts,
  detailText,
  resolveAppearance,
  startedTypesByElement,
  traitSources,
  valueFitsType,
  type ResolvedAppearance,
} from './appearance';
import { ESSENCE } from './builtin';
import { appearanceOf, definitionsOf } from './definitions';
import { TEST_PACKAGE } from './test/fixtures';

const color = fc.stringMatching(/^#[0-9A-F]{6}$/);
const badge: fc.Arbitrary<Badge> = fc.oneof(
  fc.record({
    when: fc.constant('attribute' as const),
    text: fc.constant('PK'),
    attribute: fc.string(),
  }),
  fc.record({
    when: fc.constant('from-end' as const),
    text: fc.constant('FK'),
    relationType: fc.string(),
  }),
);
const detail: fc.Arbitrary<DetailRules> = fc.record(
  {
    componentName: fc.boolean(),
    attributes: fc.uniqueArray(fc.string(), { maxLength: 3 }),
    badges: fc.array(badge, { maxLength: 2 }),
  },
  { requiredKeys: [] },
);
const connectionPoint = fc.record({
  name: fc.string({ minLength: 1 }),
  side: fc.constantFrom('top' as const, 'right' as const, 'bottom' as const, 'left' as const),
  at: fc.double({ min: 0, max: 1, noNaN: true }),
});
/** A partial appearance, as a definition or an element writes it. */
const appearance: fc.Arbitrary<Appearance> = fc.record(
  {
    shape: fc.constantFrom('rectangle', 'rounded-rectangle', 'ellipse', 'cylinder', 'person'),
    fill: color,
    stroke: color,
    width: fc.integer({ min: 1, max: 1000 }),
    height: fc.integer({ min: 1, max: 1000 }),
    detail,
    contentsAsRows: fc.boolean(),
    connectionPoints: fc.array(connectionPoint, { maxLength: 2 }),
  },
  { requiredKeys: [] },
);

describe('resolveAppearance', () => {
  it('takes every trait from the nearest member of the chain that sets it, over the base', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(appearance, { nil: undefined }), { maxLength: 5 }),
        (chain) => {
          const resolved = resolveAppearance(chain, ESSENCE.appearance);
          const nearest = <T>(read: (each: Appearance) => T | undefined, base: T): T => {
            for (const each of chain) {
              const value = each === undefined ? undefined : read(each);
              if (value !== undefined) return value;
            }
            return base;
          };
          const base: ResolvedAppearance = ESSENCE.appearance;
          expect(resolved).toEqual({
            shape: nearest((each) => each.shape, base.shape),
            fill: nearest((each) => each.fill, base.fill),
            stroke: nearest((each) => each.stroke, base.stroke),
            width: nearest((each) => each.width, base.width),
            height: nearest((each) => each.height, base.height),
            // Each part of the detail is inherited on its own.
            detail: {
              componentName: nearest(
                (each) => each.detail?.componentName,
                base.detail.componentName,
              ),
              attributes: nearest((each) => each.detail?.attributes, base.detail.attributes),
              badges: nearest((each) => each.detail?.badges, base.detail.badges),
            },
            contentsAsRows: nearest((each) => each.contentsAsRows, base.contentsAsRows),
            // An empty list is set: relations attach anywhere on the border, whatever is inherited.
            connectionPoints: nearest((each) => each.connectionPoints, base.connectionPoints),
          });
        },
      ),
    );
  });

  it('lists every trait of an appearance, in the order the component editor shows them', () => {
    expect(APPEARANCE_TRAITS).toEqual([
      'shape',
      'fill',
      'stroke',
      'width',
      'height',
      'detail',
      'contentsAsRows',
      'connectionPoints',
      'image',
      'levels',
      'expandFrom',
    ]);
  });

  it('gives Essence the defaults everything inherits', () => {
    expect(ESSENCE.appearance).toEqual({
      shape: 'rectangle',
      fill: '#FFFFFF',
      stroke: '#52606D',
      width: 160,
      height: 72,
      detail: { componentName: true, attributes: [], badges: [] },
      contentsAsRows: false,
      connectionPoints: [],
    });
  });

  it('draws an element with its own traits over its component, and an unknown component as Essence', () => {
    const definitions = definitionsOf([TEST_PACKAGE]);
    const element = {
      component: 'test.service',
      appearance: { fill: '#123456', detail: { componentName: false } },
    };
    expect(appearanceOf(element, definitions)).toEqual({
      ...ESSENCE.appearance,
      shape: 'rounded-rectangle',
      fill: '#123456',
      width: 180,
      detail: { componentName: false, attributes: [], badges: [] },
    });
    expect(appearanceOf({ component: 'test.nope' }, definitions)).toEqual(ESSENCE.appearance);
  });
});

/** A package whose components set traits at different depths: Box ← Service ← Queue. */
const LAYERED: PackageFile = {
  id: 'layered',
  name: 'Layered',
  components: [
    {
      id: 'layered.box',
      name: 'Box',
      derivesFrom: 'essence',
      attributes: [{ name: 'owner', type: 'string' }],
      appearance: { fill: '#EEEEEE', detail: { attributes: ['owner'] } },
    },
    {
      id: 'layered.service',
      name: 'Service',
      derivesFrom: 'layered.box',
      attributes: [{ name: 'latency', type: 'number', unit: 'ms', default: 100 }],
      appearance: { shape: 'rounded-rectangle', connectionPoints: [] },
    },
    {
      id: 'layered.queue',
      name: 'Queue',
      derivesFrom: 'layered.service',
      attributes: [{ name: 'owner', type: 'string', description: 'Redefined.' }],
      appearance: { detail: { componentName: false } },
    },
  ],
  relationTypes: [],
};

describe('traitSources', () => {
  it('names the definition each trait and each attribute comes from', () => {
    const definitions = definitionsOf([LAYERED]);
    const sources = traitSources(definitions, 'layered.queue');
    expect(sources.traits).toEqual({
      shape: 'layered.service',
      fill: 'layered.box',
      stroke: 'essence',
      width: 'essence',
      height: 'essence',
      'detail.componentName': 'layered.queue',
      'detail.attributes': 'layered.box',
      'detail.badges': 'essence',
      contentsAsRows: 'essence',
      connectionPoints: 'layered.service',
      // Nothing in the chain shows an image, so it comes from Essence, which shows none.
      image: 'essence',
      // Nor declares levels of detail or a scale to expand from (ADR 0055).
      levels: 'essence',
      expandFrom: 'essence',
    });
    expect(Object.keys(sources.traits)).toEqual([...TRAIT_PATHS]);
    expect([...sources.attributes]).toEqual([
      ['owner', 'layered.queue'],
      ['latency', 'layered.service'],
    ]);
  });

  it('marks what an element sets itself as its own', () => {
    const definitions = definitionsOf([LAYERED]);
    const sources = traitSources(definitions, 'layered.box', {
      stroke: '#000000',
      detail: { badges: [] },
    });
    expect(sources.traits.stroke).toBe('own');
    expect(sources.traits['detail.badges']).toBe('own');
    expect(sources.traits.fill).toBe('layered.box');
    expect(traitSources(definitions, 'layered.nope').traits.fill).toBe('essence');
  });

  it('agrees with resolution: the source of a trait sets the value resolution gives it', () => {
    const shared = fc.array(fc.option(appearance, { nil: undefined }), {
      minLength: 1,
      maxLength: 4,
    });
    fc.assert(
      fc.property(shared, fc.option(appearance, { nil: undefined }), (appearances, own) => {
        const components: Component[] = appearances.map((each, at) => ({
          id: `chain.c${at}`,
          name: `C${at}`,
          derivesFrom: at === 0 ? 'essence' : `chain.c${at - 1}`,
          ...(each === undefined ? {} : { appearance: each }),
        }));
        const definitions = definitionsOf([
          { id: 'chain', name: 'Chain', components, relationTypes: [] },
        ]);
        const id = `chain.c${appearances.length - 1}`;
        const sources = traitSources(definitions, id, own);
        const resolved = appearanceOf(
          { component: id, ...(own === undefined ? {} : { appearance: own }) },
          definitions,
        );
        for (const path of TRAIT_PATHS) {
          const source = sources.traits[path];
          const from =
            source === 'own'
              ? own
              : source === 'essence'
                ? ESSENCE.appearance
                : components.find((each) => each.id === source)?.appearance;
          expect(traitOf(from, path)).toEqual(traitOf(resolved, path));
        }
      }),
    );
  });
});

/** The value an appearance gives a trait path, such as `detail.badges`. */
function traitOf(appearance: Appearance | ResolvedAppearance | undefined, path: string): unknown {
  const [first, second] = path.split('.') as [string, string | undefined];
  const value = (appearance as Record<string, unknown> | undefined)?.[first];
  return second === undefined ? value : (value as Record<string, unknown> | undefined)?.[second];
}

describe('values and detail', () => {
  const definitions = definitionsOf([LAYERED]);

  it('reads an attribute value from the element, else the default its component gives', () => {
    const element = { component: 'layered.service', attributes: { owner: 'Ops' } };
    expect(attributeValue(element, 'owner', definitions)).toBe('Ops');
    expect(attributeValue(element, 'latency', definitions)).toBe(100);
    expect(attributeValue(element, 'missing', definitions)).toBeUndefined();
    expect(
      attributeValue(
        { component: 'layered.service', attributes: { latency: 5 } },
        'latency',
        definitions,
      ),
    ).toBe(5);
  });

  it('tells whether a value fits an attribute type', () => {
    expect(valueFitsType('a', 'string')).toBe(true);
    expect(valueFitsType(1, 'string')).toBe(false);
    expect(valueFitsType(1.5, 'number')).toBe(true);
    expect(valueFitsType(Number.NaN, 'number')).toBe(false);
    expect(valueFitsType(false, 'boolean')).toBe(true);
    expect(valueFitsType(null, 'boolean')).toBe(false);
    expect(valueFitsType({ a: [1] }, 'json')).toBe(true);
  });

  it('writes the component name, then the values of the attributes shown, then the badges', () => {
    const column: Element = {
      id: 'c',
      component: 'layered.service',
      name: 'id',
      attributes: { owner: 'Ops', latency: 20, primary: true, notes: { long: 'x'.repeat(60) } },
      appearance: {
        detail: {
          componentName: true,
          attributes: ['owner', 'latency', 'missing', 'primary', 'notes', 'empty'],
          badges: [
            { when: 'attribute', text: 'PK', attribute: 'primary' },
            { when: 'attribute', text: 'NN', attribute: 'owner' },
            { when: 'from-end', text: 'FK', relationType: 'layered.references' },
          ],
        },
      },
    };
    const parts = detailParts(column, definitions, new Set());
    expect(parts.map((part) => part.text)).toEqual([
      'Service',
      'Ops',
      '20 ms',
      'primary',
      // Compact JSON, cut to 40 characters.
      `{"long":"${'x'.repeat(30)}…`,
      'PK',
    ]);
    expect(detailText(parts)).toBe(parts.map((part) => part.text).join(' · '));
    expect(detailText([])).toBe('');
  });

  it('writes a from-end badge while the element starts a relation of that type or one derived from it', () => {
    const withRelations = definitionsOf([
      LAYERED,
      {
        id: 'links',
        name: 'Links',
        components: [],
        relationTypes: [
          { id: 'links.references', name: 'references', derivesFrom: 'relates-to' },
          { id: 'links.strong', name: 'strongly references', derivesFrom: 'links.references' },
        ],
      },
    ]);
    const element = {
      component: 'layered.box',
      appearance: {
        detail: {
          componentName: false,
          attributes: [],
          badges: [{ when: 'from-end' as const, text: 'FK', relationType: 'links.references' }],
        },
      },
    };
    expect(detailText(detailParts(element, withRelations, new Set()))).toBe('');
    expect(detailText(detailParts(element, withRelations, new Set(['links.strong'])))).toBe('FK');
    const started = startedTypesByElement([
      { id: 'r1', relationType: 'links.strong', from: 'a', to: 'b' },
      { id: 'r2', relationType: 'links.references', from: 'a', to: 'c' },
    ]);
    expect([...(started.get('a') ?? [])]).toEqual(['links.strong', 'links.references']);
    expect(started.get('b')).toBeUndefined();
  });

  it('writes what Essence writes, the component name, when nothing says otherwise', () => {
    const parts = detailParts({ component: 'layered.service' }, definitions, new Set());
    expect(detailText(parts)).toBe('Service');
    const unknown = detailParts({ component: 'layered.nope' }, definitions, new Set());
    expect(detailText(unknown)).toBe('layered.nope');
  });
});
