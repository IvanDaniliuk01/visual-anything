/**
 * Working colors and the other traits out with project appearances: the order every trait follows,
 * where each comes from, and the dark shades of built-in colors with the one case a built-in fill
 * keeps its light value.
 */
import fc from 'fast-check';
import type {
  Appearance,
  Component,
  PackageFile,
  ProjectAppearances,
  RelationAppearance,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { TRAIT_PATHS, traitSources, type TraitOrigin, type TraitPath } from './appearance';
import { BUILTIN_PACKAGES, ESSENCE, SYSTEMS } from './builtin';
import { DARK_SHADES } from './builtin/dark';
import { CANVAS_BACKGROUNDS, contrastRatio } from './colors';
import {
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  darkColorsOf,
  definitionsOf,
  drawnColorsOf,
  drawnRelationAppearanceOf,
  relationAppearanceOf,
  relationAppearanceOriginsOf,
  relationDarkStrokeOf,
  relationTypeOrRelatesTo,
} from './definitions';
import { colorsInUse, editableAppearanceOf } from './project-appearances';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { CLINIC_PACKAGE, colorProject } from './test/fixtures';

const PACKAGES = [SYSTEMS, CLINIC_PACKAGE];

const builtIn = (id: string, via: 'definition' | 'project' = 'definition'): TraitOrigin => ({
  kind: 'definition',
  id,
  via,
  builtIn: true,
});
const ours = (id: string): TraitOrigin => ({
  kind: 'definition',
  id,
  via: 'definition',
  builtIn: false,
});

describe('project appearances', () => {
  it('reach what derives from the definition without setting the trait', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { 'systems.database': { fill: '#FFE8D6', shape: 'rounded-rectangle' } },
    });
    expect(definitions.component('systems.database')?.appearance).toMatchObject({
      fill: '#FFE8D6',
      stroke: '#7A5C00',
      shape: 'rounded-rectangle',
      width: 176,
    });
    expect(appearanceOf({ component: 'clinic.calendar' }, definitions).fill).toBe('#FFE8D6');
    expect(
      appearanceOf({ component: 'clinic.calendar', appearance: { fill: '#000000' } }, definitions)
        .fill,
    ).toBe('#000000');
  });

  it('do not reach the definitions deriving from it that set the trait themselves', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { 'systems.service': { fill: '#FFE8D6', width: 200 } },
    });
    expect(definitions.component('systems.service')?.appearance.fill).toBe('#FFE8D6');
    // AI agent sets its own fill, and keeps it; it sets no width, so it follows Service's.
    expect(definitions.component('systems.ai-agent')?.appearance).toMatchObject({
      fill: '#EDE4FF',
      width: 200,
    });
  });

  it('reach relation types through "relates to"', () => {
    const definitions = definitionsOf(PACKAGES, {
      relationTypes: { 'relates-to': { stroke: '#123456', dash: 'dotted' } },
    });
    expect(definitions.relationType('systems.is-part-of')?.appearance).toEqual({
      stroke: '#123456',
      width: 2,
      dash: 'dotted',
      opacity: 1,
    });
    expect(definitions.relationType('systems.communicates-with')?.appearance.stroke).toBe(
      '#3D4651',
    );
    expect(definitions.relationType('relates-to')?.appearance.stroke).toBe('#123456');
    expect(relationTypeOrRelatesTo(definitions, 'nowhere.type').appearance.stroke).toBe('#123456');
  });

  it('reach every component through Essence, and what no package defines', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { essence: { stroke: '#222222', width: 120 } },
    });
    expect(definitions.component('systems.person')?.appearance.width).toBe(144);
    expect(definitions.component('systems.box')?.appearance.width).toBe(120);
    expect(definitions.component('systems.box')?.appearance.stroke).toBe('#52606D');
    expect(appearanceOf({ component: 'nowhere.thing' }, definitions)).toMatchObject({
      stroke: '#222222',
      width: 120,
    });
    expect(componentOrEssence(definitions, 'nowhere.thing').appearance.width).toBe(120);
  });

  it('set the detail part by part over the definition’s', () => {
    const definitions = definitionsOf([...BUILTIN_PACKAGES], {
      components: { 'data-modeling.column': { detail: { attributes: [] } } },
    });
    expect(definitions.component('data-modeling.column')?.appearance.detail).toEqual({
      componentName: false,
      attributes: [],
      badges: DATA_MODELING_BADGES,
      lines: 3,
    });
  });

  it('are ignored for the project’s own definitions and for ids no package defines', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { 'clinic.desk': { fill: '#000000' }, 'nowhere.thing': { fill: '#000000' } },
      relationTypes: { 'clinic.reminds': { stroke: '#000000' } },
    });
    expect(definitions.component('clinic.desk')?.appearance.fill).toBe('#FFE8D6');
    expect(definitions.relationType('clinic.reminds')?.appearance.stroke).toBe('#3D4651');
    expect(definitions.problems).toEqual([]);
  });

  it('are read by own key only', () => {
    const appearances = JSON.parse(
      '{"components": {"constructor": {"fill": "#000000"}}}',
    ) as ProjectAppearances;
    const definitions = definitionsOf(PACKAGES, appearances);
    expect(definitions.component('systems.service')?.appearance.fill).toBe('#DCEBFF');
    const inherited = definitionsOf(PACKAGES, {});
    expect(inherited.component('toString')).toBeUndefined();
  });

  it('share one result for the same packages and appearances, and none means as the packages define it', () => {
    const appearances: ProjectAppearances = {
      components: { 'systems.service': { fill: '#FFE8D6' } },
    };
    expect(definitionsOf(PACKAGES, appearances)).toBe(definitionsOf(PACKAGES, appearances));
    expect(definitionsOf(PACKAGES)).toBe(definitionsOf(PACKAGES));
    expect(definitionsOf(PACKAGES, appearances)).not.toBe(definitionsOf(PACKAGES));
    expect(definitionsOf(PACKAGES).component('systems.service')?.appearance.fill).toBe('#DCEBFF');
    const state = withAppearances(appearances);
    expect(definitionsIn(state)).toBe(definitionsOf(state.packages, appearances));
    expect(definitionsIn({ ...state, project: { ...state.project, name: 'Renamed' } })).toBe(
      definitionsIn(state),
    );
  });
});

const DATA_MODELING_BADGES = [
  { when: 'attribute', text: 'PK', attribute: 'primaryKey' },
  { when: 'from-end', text: 'FK', relationType: 'data-modeling.references' },
];

function withAppearances(appearances?: ProjectAppearances): ProjectSnapshot {
  const state = colorProject();
  return appearances === undefined
    ? state
    : { ...state, project: { ...state.project, appearances } };
}

describe('where each trait comes from', () => {
  it('names the definition, whether the project appearance sets it, and whether it is built in', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: {
        'systems.service': { stroke: '#B4531A' },
        essence: { detail: { attributes: ['owner'] } },
      },
    });
    const origins = appearanceOriginsOf(
      { component: 'systems.ai-agent', appearance: { shape: 'ellipse' } },
      definitions,
    );
    expect(origins).toMatchObject({
      shape: { kind: 'own' },
      fill: builtIn('systems.ai-agent'),
      stroke: builtIn('systems.ai-agent'),
      width: builtIn('systems.service'),
      height: builtIn('systems.service'),
      'detail.componentName': builtIn('essence'),
      'detail.attributes': builtIn('essence', 'project'),
      'detail.badges': builtIn('essence'),
      contentsAsRows: builtIn('essence'),
      connectionPoints: builtIn('essence'),
    });
    expect(Object.keys(origins)).toEqual([...TRAIT_PATHS]);
    expect(appearanceOriginsOf({ component: 'systems.service' }, definitions).stroke).toEqual(
      builtIn('systems.service', 'project'),
    );
    expect(appearanceOriginsOf({ component: 'clinic.desk' }, definitions).fill).toEqual(
      ours('clinic.desk'),
    );
    expect(appearanceOriginsOf({ component: 'clinic.calendar' }, definitions).fill).toEqual(
      builtIn('systems.database'),
    );
  });

  it('keeps naming the definition in the component editor’s sources', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { 'systems.database': { fill: '#FFE8D6' } },
    });
    const sources = traitSources(definitions, 'clinic.calendar', { stroke: '#000000' });
    expect(sources.traits.fill).toBe('systems.database');
    expect(sources.traits.stroke).toBe('own');
    expect(sources.origins.fill).toEqual(builtIn('systems.database', 'project'));
    expect(sources.origins.stroke).toEqual({ kind: 'own' });
  });

  it('for a relation: its own appearance, its relation type, or "relates to"', () => {
    const definitions = definitionsOf(PACKAGES, {
      relationTypes: { 'systems.communicates-with': { width: 4 } },
    });
    expect(
      relationAppearanceOriginsOf(
        { relationType: 'clinic.reminds', appearance: { dash: 'dashed' } },
        definitions,
      ),
    ).toEqual({
      stroke: builtIn('systems.communicates-with'),
      width: builtIn('systems.communicates-with', 'project'),
      dash: { kind: 'own' },
      route: builtIn('relates-to'),
      opacity: builtIn('relates-to'),
    });
    expect(relationAppearanceOriginsOf({ relationType: 'clinic.escalates' }, definitions)).toEqual({
      stroke: ours('clinic.escalates'),
      width: ours('clinic.escalates'),
      dash: builtIn('relates-to'),
      route: builtIn('relates-to'),
      opacity: builtIn('relates-to'),
    });
  });
});

describe('a relation’s own appearance', () => {
  it('comes first, trait by trait, over its relation type', () => {
    const definitions = definitionsOf(PACKAGES);
    expect(
      relationAppearanceOf(
        { relationType: 'systems.reads-from', appearance: { stroke: '#D6336C' } },
        definitions,
      ),
    ).toEqual({ stroke: '#D6336C', width: 2, dash: 'dashed', opacity: 1 });
    expect(relationAppearanceOf({ relationType: 'nowhere.type' }, definitions)).toEqual({
      stroke: '#52606D',
      width: 2,
      dash: 'solid',
      opacity: 1,
    });
  });
});

describe('the dark theme', () => {
  const dark = CANVAS_BACKGROUNDS.dark;

  it('draws built-in colors in their dark shades while nothing in the project sets them', () => {
    const definitions = definitionsOf(PACKAGES);
    expect(darkColorsOf({ component: 'systems.service' }, definitions)).toEqual({
      fill: '#172B45',
      stroke: '#78A8EE',
    });
    // A component of the project's own that sets no colors follows the built-in shades.
    expect(darkColorsOf({ component: 'clinic.calendar' }, definitions)).toEqual(
      DARK_SHADES.components['systems.database'],
    );
    expect(darkColorsOf({ component: 'nowhere.thing' }, definitions)).toEqual(
      DARK_SHADES.components.essence,
    );
    expect(drawnColorsOf({ component: 'systems.service' }, definitions, 'light')).toEqual({
      fill: '#DCEBFF',
      stroke: '#1D4F91',
    });
    expect(drawnColorsOf({ component: 'systems.service' }, definitions, 'dark')).toEqual({
      fill: '#172B45',
      stroke: '#78A8EE',
    });
  });

  it('draws every color the project sets as stored', () => {
    const definitions = definitionsOf(PACKAGES, {
      components: { 'systems.service': { fill: '#FFE8D6' } },
    });
    expect(darkColorsOf({ component: 'systems.service' }, definitions)).toEqual({
      fill: '#FFE8D6',
      stroke: '#78A8EE',
    });
    expect(darkColorsOf({ component: 'clinic.desk' }, definitions)).toEqual({
      fill: '#FFE8D6',
      stroke: '#B4531A',
    });
    expect(
      darkColorsOf(
        { component: 'systems.person', appearance: { fill: '#000000', stroke: '#FFFFFF' } },
        definitions,
      ),
    ).toEqual({ fill: '#000000', stroke: '#FFFFFF' });
  });

  it('keeps a built-in fill light beside a stored stroke under 3:1 on the dark canvas, for every built-in component', () => {
    const plain = definitionsOf([...BUILTIN_PACKAGES]);
    for (const [id] of plain.components) {
      const resolved = plain.component(id);
      if (resolved === undefined) throw new Error(id);
      // The light stroke stored as the element's own: it does not read on the dark canvas.
      const own = { component: id, appearance: { stroke: '#1D4F91' } };
      expect(contrastRatio('#1D4F91', dark)).toBeLessThan(3);
      expect(darkColorsOf(own, plain), id).toEqual({
        fill: resolved.appearance.fill,
        stroke: '#1D4F91',
      });
      // The same stroke stored as a project appearance.
      const entry = definitionsOf([...BUILTIN_PACKAGES], {
        components: { [id]: { stroke: '#1D4F91' } },
      });
      expect(entry.component(id)?.darkColors, id).toEqual({
        fill: resolved.appearance.fill,
        stroke: '#1D4F91',
      });
      // A stored stroke that reads on the dark canvas leaves the fill its dark shade.
      expect(
        darkColorsOf({ component: id, appearance: { stroke: '#D6336C' } }, plain).fill,
        id,
      ).toBe(resolved.darkColors.fill);
    }
  });

  it('never keeps a fill light beside a built-in stroke, whatever fill is stored', () => {
    const definitions = definitionsOf(PACKAGES);
    expect(
      darkColorsOf({ component: 'systems.service', appearance: { fill: '#1D4F91' } }, definitions),
    ).toEqual({ fill: '#1D4F91', stroke: '#78A8EE' });
  });

  it('draws a relation in its relation type’s dark stroke unless it or the project sets one', () => {
    const definitions = definitionsOf(PACKAGES, {
      relationTypes: { 'systems.writes-to': { stroke: '#B42318' } },
    });
    expect(relationDarkStrokeOf({ relationType: 'clinic.reminds' }, definitions)).toBe('#AEB8C4');
    expect(relationDarkStrokeOf({ relationType: 'systems.is-part-of' }, definitions)).toBe(
      '#8F9AA6',
    );
    expect(relationDarkStrokeOf({ relationType: 'systems.writes-to' }, definitions)).toBe(
      '#B42318',
    );
    expect(relationDarkStrokeOf({ relationType: 'clinic.escalates' }, definitions)).toBe('#B42318');
    expect(
      relationDarkStrokeOf(
        { relationType: 'clinic.reminds', appearance: { stroke: '#D6336C' } },
        definitions,
      ),
    ).toBe('#D6336C');
    expect(
      drawnRelationAppearanceOf({ relationType: 'systems.reads-from' }, definitions, 'dark'),
    ).toEqual({ stroke: '#AEB8C4', width: 2, dash: 'dashed', opacity: 1 });
    expect(
      drawnRelationAppearanceOf({ relationType: 'systems.reads-from' }, definitions, 'light'),
    ).toEqual({ stroke: '#3D4651', width: 2, dash: 'dashed', opacity: 1 });
  });
});

describe('what the project can change', () => {
  it('is the project appearance for a built-in definition, and the package for its own', () => {
    const state = withAppearances({
      components: { 'systems.service': { fill: '#FFE8D6' } },
      relationTypes: { 'relates-to': { width: 1 } },
    });
    expect(editableAppearanceOf(state, 'component', 'systems.service')).toEqual({
      level: 'project',
      appearance: { fill: '#FFE8D6' },
    });
    expect(editableAppearanceOf(state, 'component', 'systems.database')).toEqual({
      level: 'project',
      appearance: undefined,
    });
    expect(editableAppearanceOf(state, 'component', 'essence')).toEqual({
      level: 'project',
      appearance: undefined,
    });
    expect(editableAppearanceOf(state, 'relation-type', 'relates-to')).toEqual({
      level: 'project',
      appearance: { width: 1 },
    });
    expect(editableAppearanceOf(state, 'component', 'clinic.desk')).toEqual({
      level: 'package',
      package: 'clinic',
      appearance: { fill: '#FFE8D6', stroke: '#B4531A' },
    });
    expect(editableAppearanceOf(state, 'relation-type', 'clinic.reminds')).toEqual({
      level: 'package',
      package: 'clinic',
      appearance: undefined,
    });
    expect(editableAppearanceOf(state, 'component', 'nowhere.thing')).toBeUndefined();
    expect(editableAppearanceOf(state, 'relation-type', 'systems.service')).toBeUndefined();
  });
});

describe('the colors in use', () => {
  it('counts every color the project stores, ignoring case, most used first', () => {
    const state = colorProject();
    const changed: ProjectSnapshot = {
      ...state,
      project: {
        ...state.project,
        appearances: { components: { 'systems.service': { fill: '#ffe8d6' } } },
      },
      model: {
        ...state.model,
        relations: state.model.relations.map((relation) =>
          relation.id === 'asks' ? { ...relation, appearance: { stroke: '#d6336c' } } : relation,
        ),
      },
      views: state.views.map((view) => ({
        ...view,
        freeShapes: view.freeShapes.map((shape) =>
          shape.kind === 'note' ? { ...shape, fill: '#DCEBFF' } : { ...shape, stroke: '#D6336C' },
        ),
      })),
    };
    expect(colorsInUse(changed)).toEqual([
      { color: '#D6336C', uses: 3 },
      { color: '#FFE8D6', uses: 2 },
      { color: '#B42318', uses: 1 },
      { color: '#B4531A', uses: 1 },
      { color: '#DCEBFF', uses: 1 },
    ]);
  });
});

// The order of 4.4, as a property --------------------------------------------------------------------

const color = fc.stringMatching(/^#[0-9A-F]{6}$/);
const partialAppearance: fc.Arbitrary<Appearance> = fc.record(
  {
    shape: fc.constantFrom('rectangle', 'rounded-rectangle', 'ellipse'),
    fill: color,
    stroke: color,
    width: fc.integer({ min: 1, max: 500 }),
    detail: fc.record(
      { componentName: fc.boolean(), attributes: fc.constant([]) },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
);
const relationAppearance: fc.Arbitrary<RelationAppearance> = fc.record(
  {
    stroke: color,
    width: fc.integer({ min: 1, max: 6 }),
    dash: fc.constantFrom('dashed', 'dotted'),
  },
  { requiredKeys: [] },
);

/** The value an appearance gives a trait path, such as `detail.componentName`. */
function traitOf(appearance: object | undefined, path: TraitPath): unknown {
  const [first, second] = path.split('.') as [string, string | undefined];
  const value = (appearance as Record<string, unknown> | undefined)?.[first];
  return second === undefined ? value : (value as Record<string, unknown> | undefined)?.[second];
}

describe('resolution, as a property', () => {
  it('gives each trait from the first that sets it: the element, then each definition nearest first with the project appearance over a built-in one, then Essence', () => {
    const member = fc.record({
      appearance: fc.option(partialAppearance, { nil: undefined }),
      entry: fc.option(partialAppearance, { nil: undefined }),
    });
    fc.assert(
      fc.property(
        fc.array(member, { minLength: 0, maxLength: 3 }),
        fc.array(member, { minLength: 0, maxLength: 3 }),
        fc.option(partialAppearance, { nil: undefined }),
        fc.option(partialAppearance, { nil: undefined }),
        (builtIns, owns, essenceEntry, own) => {
          // A chain from Essence: built-in members first (a built-in derives from no own one),
          // then the project's own.
          const chain = [
            ...builtIns.map((each, at) => ({ ...each, id: `systems.b${at}`, builtIn: true })),
            ...owns.map((each, at) => ({ ...each, id: `ours.o${at}`, builtIn: false })),
          ];
          const component = (at: number): Component => {
            const each = chain[at] as (typeof chain)[number];
            return {
              id: each.id,
              name: each.id,
              derivesFrom: at === 0 ? 'essence' : (chain[at - 1] as { id: string }).id,
              ...(each.appearance === undefined ? {} : { appearance: each.appearance }),
            };
          };
          const packages: PackageFile[] = [
            {
              id: 'systems',
              name: 'Systems',
              components: chain.flatMap((each, at) => (each.builtIn ? [component(at)] : [])),
              relationTypes: [],
            },
            {
              id: 'ours',
              name: 'Ours',
              components: chain.flatMap((each, at) => (each.builtIn ? [] : [component(at)])),
              relationTypes: [],
            },
          ];
          const entries: Record<string, Appearance> = {};
          for (const each of chain) if (each.entry !== undefined) entries[each.id] = each.entry;
          if (essenceEntry !== undefined) entries.essence = essenceEntry;
          const definitions = definitionsOf(packages, { components: entries });
          const id = chain.at(-1)?.id ?? 'essence';
          const element = { component: id, ...(own === undefined ? {} : { appearance: own }) };
          const resolved = appearanceOf(element, definitions);
          const origins = appearanceOriginsOf(element, definitions);

          // Nearest first: the element, then each member with its entry first when built in.
          const order: { appearance: object | undefined; origin: TraitOrigin }[] = [
            { appearance: own, origin: { kind: 'own' } },
            ...[...chain].reverse().flatMap((each) => [
              ...(each.builtIn
                ? [{ appearance: each.entry, origin: builtIn(each.id, 'project') }]
                : []),
              {
                appearance: each.appearance,
                origin: each.builtIn ? builtIn(each.id) : ours(each.id),
              },
            ]),
            { appearance: essenceEntry, origin: builtIn('essence', 'project') },
            { appearance: ESSENCE.appearance, origin: builtIn('essence') },
          ];
          for (const path of TRAIT_PATHS) {
            const first = order.find((each) => traitOf(each.appearance, path) !== undefined);
            expect(traitOf(resolved, path), path).toEqual(traitOf(first?.appearance, path));
            // A trait nothing sets, such as an image, is Essence's to give.
            expect(origins[path], path).toEqual(first?.origin ?? builtIn('essence'));
          }
        },
      ),
    );
  });

  it('does the same for a relation, up to "relates to"', () => {
    fc.assert(
      fc.property(
        fc.option(relationAppearance, { nil: undefined }),
        fc.option(relationAppearance, { nil: undefined }),
        fc.option(relationAppearance, { nil: undefined }),
        fc.option(relationAppearance, { nil: undefined }),
        (definition, entry, relatesTo, own) => {
          const packages: PackageFile[] = [
            {
              id: 'systems',
              name: 'Systems',
              components: [],
              relationTypes: [
                {
                  id: 'systems.link',
                  name: 'link',
                  derivesFrom: 'relates-to',
                  ...(definition === undefined ? {} : { appearance: definition }),
                },
              ],
            },
          ];
          const relationTypes: Record<string, RelationAppearance> = {};
          if (entry !== undefined) relationTypes['systems.link'] = entry;
          if (relatesTo !== undefined) relationTypes['relates-to'] = relatesTo;
          const definitions = definitionsOf(packages, { relationTypes });
          const relation = {
            relationType: 'systems.link',
            ...(own === undefined ? {} : { appearance: own }),
          };
          const resolved = relationAppearanceOf(relation, definitions);
          const origins = relationAppearanceOriginsOf(relation, definitions);
          const order = [
            { appearance: own, origin: { kind: 'own' } },
            { appearance: entry, origin: builtIn('systems.link', 'project') },
            { appearance: definition, origin: builtIn('systems.link') },
            { appearance: relatesTo, origin: builtIn('relates-to', 'project') },
            {
              appearance: { stroke: '#52606D', width: 2, dash: 'solid' },
              origin: builtIn('relates-to'),
            },
          ];
          for (const trait of ['stroke', 'width', 'dash'] as const) {
            const first = order.find((each) => each.appearance?.[trait] !== undefined);
            expect(resolved[trait]).toEqual(first?.appearance?.[trait]);
            expect(origins[trait]).toEqual(first?.origin);
          }
        },
      ),
    );
  });
});
