/**
 * Claude's tools for free geometry, parts' appearances and route styles (M8b, ADR 0066, ADR 0067,
 * ADR 0069, ADR 0039), called through MCP as Claude calls them: `set_appearance` with `geometry`,
 * `part` and `route` for components, relation types, elements and relations; `update_view` with
 * `routeStyle`; `set_route` with `orthogonal` and the automatic style; the anchored parts
 * `replace_image` loses; and the read tools, which give free geometry in brief.
 */
import type { FreeGeometry, PackageFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testProject } from '../test-support';
import { INSTRUCTIONS } from './mcp';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';

// Each test starts a program and makes several calls through MCP, each an action the program
// writes to the project's folder: on a machine busy with other builds, that takes past the
// package's 20 s for a test and vitest's 10 s for a hook.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const HEART_D =
  'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z';
const HEART: FreeGeometry = {
  width: 120,
  height: 110,
  keepProportions: true,
  outline: [{ kind: 'path', d: HEART_D }],
  label: { x: 24, y: 30, width: 72, height: 36 },
};
const TRIANGLE: FreeGeometry = {
  width: 100,
  height: 90,
  outline: [{ kind: 'polygon', points: '50,0 100,90 0,90' }],
};
/** A ring: two circles of arcs, the inner one a hole. */
const RING: FreeGeometry = {
  width: 100,
  height: 100,
  outline: [
    {
      kind: 'path',
      d: 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 20 A30 30 0 1 1 50 80 A30 30 0 1 1 50 20 Z',
    },
  ],
};

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ATLAS = `<svg viewBox="0 0 20 10" ${NS}><path id="lung" d="M0 0h10v10h-10z"/><path id="liver" d="M10 0h10v10h-10z"/></svg>`;
const LUNG_ONLY = `<svg viewBox="0 0 20 10" ${NS}><path id="lung" d="M0 0h10v10h-10z"/></svg>`;

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const state = () => tools.session.snapshot;
const element = (id: string) => state().model.elements.find((each) => each.id === id);
const relation = (id: string) => state().model.relations.find((each) => each.id === id);
const cart = () =>
  state()
    .packages.find((each) => each.id === 'shop')
    ?.components.find((each) => each.id === 'shop.cart');
const overview = () => state().views.find((each) => each.id === 'overview');

/** Adds the atlas's picture, with the parts "lung" and "liver", to the shop's package. */
async function addAtlas(): Promise<void> {
  await tools.value('add_image', { package: 'shop', id: 'shop.atlas', name: 'Atlas', svg: ATLAS });
}

describe('set_appearance with free geometry', () => {
  it('gives a component path data, and answers the geometry in brief', async () => {
    const result = await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { geometry: HEART, fill: '#F4C7C3', stroke: '#A23B2E' },
    });
    expect(result).toMatchObject({
      undo: 'The person can undo it in the app.',
      keptIn: 'the package "shop", in the definition itself',
      appearance: {
        fill: '#F4C7C3',
        stroke: '#A23B2E',
        geometry: {
          box: { width: 120, height: 110 },
          contours: 1,
          holes: 0,
          characters: HEART_D.length,
          keepProportions: true,
          label: { x: 24, y: 30, width: 72, height: 36 },
          pathData: expect.stringContaining('fullGeometry') as string,
        },
      },
    });
    // The path data is kept as written, and not repeated in the answer.
    expect(JSON.stringify(result)).not.toContain('C20 76');
    expect(cart()?.appearance?.geometry).toEqual(HEART);
    expect(tools.session.actions.map((each) => each.author)).toEqual(['claude']);
  });

  it('gives one element a polygon and a ring with a hole, and none takes an outline away', async () => {
    const triangle = await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { geometry: TRIANGLE },
    });
    expect(triangle).toMatchObject({
      keptIn: 'the element itself, as a particularity of its own',
      appearance: { geometry: { box: { width: 100, height: 90 }, contours: 1, holes: 0 } },
    });
    expect(element('api')?.appearance?.geometry).toEqual(TRIANGLE);

    const ring = await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { geometry: RING },
    });
    expect(ring).toMatchObject({ appearance: { geometry: { contours: 2, holes: 1 } } });

    // `none` takes the component's outline away from one element; null, through update_element,
    // makes an element's own outline inherited again.
    await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { geometry: HEART },
    });
    expect(
      await tools.value('set_appearance', {
        element: 'cart',
        appearanceTraits: { geometry: 'none' },
      }),
    ).toMatchObject({ appearance: { fill: '#F8E1EC', geometry: 'none' } });
    await tools.value('update_element', { id: 'api', appearanceTraits: { geometry: null } });
    expect(element('api')).not.toHaveProperty('appearance');
    expect(tools.session.actions).toHaveLength(5);
  });

  it('says why the core refuses geometry, and what to give instead', async () => {
    const invalid = await tools.failure('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { geometry: { ...TRIANGLE, outline: [{ kind: 'path', d: 'M0 0 X1 1' }] } },
    });
    expect(invalid).toContain('(invalid-geometry)');
    expect(invalid).toContain('SVG path data');

    const tooLarge = await tools.failure('set_appearance', {
      element: 'api',
      appearanceTraits: {
        geometry: {
          width: 100,
          height: 100,
          outline: Array.from({ length: 65 }, () => ({ kind: 'polygon', points: '0,0 10,0 0,10' })),
        },
      },
    });
    expect(tooLarge).toContain('(geometry-too-large)');
    expect(tooLarge).toContain('64 contours');

    const unknownImage = await tools.failure('set_appearance', {
      element: 'api',
      appearanceTraits: { part: { part: 'lung', image: 'shop.nothing' } },
    });
    expect(unknownImage).toContain('(unknown-image)');
    expect(unknownImage).toContain('list_images');
    expect(tools.session.actions).toEqual([]);
  });

  it('asks for exactly one thing to change', async () => {
    expect(
      await tools.failure('set_appearance', {
        component: 'systems.service',
        element: 'api',
        appearanceTraits: { fill: '#FFFFFF' },
      }),
    ).toBe('Give one of component, relationType, element or relation.');
    expect(await tools.failure('set_appearance', { appearanceTraits: { fill: '#FFFFFF' } })).toBe(
      'Give one of component, relationType, element or relation.',
    );
  });
});

describe('set_appearance with a part', () => {
  it('draws an element as a part of a picture, and warns unknown-part for one the picture lacks', async () => {
    await addAtlas();
    const lung = await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { part: { part: 'lung', image: 'shop.atlas' } },
    });
    expect(lung).toMatchObject({ appearance: { part: { part: 'lung', image: 'shop.atlas' } } });
    expect(lung).not.toHaveProperty('warnings');
    expect(element('api')?.appearance?.part).toEqual({ part: 'lung', image: 'shop.atlas' });

    const heart = await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { part: { part: 'heart', image: 'shop.atlas' } },
    });
    expect(heart.warnings).toEqual([
      'The component "Cart" is drawn as the part "heart" of the image "Atlas" (shop.atlas), which it does not have; it is drawn as an ordinary shape until the picture has that part again.',
    ]);
    // `none` takes the component's part away from one element.
    await tools.value('set_appearance', { element: 'cart', appearanceTraits: { part: 'none' } });
    expect(element('cart')?.appearance?.part).toBe('none');
  });
});

describe('set_appearance with a route', () => {
  it('curves a relation type’s automatic routes, and a relation’s own route undoes it', async () => {
    const curved = await tools.value('set_appearance', {
      relationType: 'systems.reads-from',
      appearanceTraits: { route: 'curved' },
    });
    expect(curved).toMatchObject({ appearance: { route: 'curved' } });
    expect(state().project.appearances?.relationTypes?.['systems.reads-from']).toEqual({
      route: 'curved',
    });

    const own = await tools.value('set_appearance', {
      relation: 'api-reads-db',
      appearanceTraits: { route: 'orthogonal', stroke: '#C05621' },
    });
    expect(own).toMatchObject({
      keptIn: 'the relation itself, as a particularity of its own',
      appearance: { route: 'orthogonal', stroke: '#C05621' },
    });
    expect(relation('api-reads-db')?.appearance).toEqual({
      route: 'orthogonal',
      stroke: '#C05621',
    });
    // update_relation takes the same trait.
    await tools.value('update_relation', {
      id: 'api-reads-db',
      appearanceTraits: { route: null, stroke: null },
    });
    expect(relation('api-reads-db')).not.toHaveProperty('appearance');
  });
});

describe('set_appearance and the geometry a package may hold', () => {
  /** A polygon of 1,600 points, about 32,000 characters: under the cap on one geometry. */
  function large(turn: number): FreeGeometry {
    const points = Array.from({ length: 1600 }, (_, at) => {
      const angle = (at / 1600) * 2 * Math.PI + turn;
      return `${(50000 + 40000 * Math.cos(angle)).toFixed(3)},${(50000 + 40000 * Math.sin(angle)).toFixed(3)}`;
    });
    return {
      width: 100000,
      height: 100000,
      outline: [{ kind: 'polygon', points: points.join(' ') }],
    };
  }

  it('warns large-geometry once the package holds past 512 KiB of it, and not for other traits', async () => {
    await tools.close();
    const project = testProject();
    const shop = project.packages.find((each) => each.id === 'shop') as PackageFile;
    const shelves = Array.from({ length: 16 }, (_, at) => ({
      id: `shop.shelf-${at}`,
      name: `Shelf ${at}`,
      derivesFrom: 'systems.box',
      appearance: { geometry: large(at / 100) },
    }));
    tools = await startToolHarness({
      ...project,
      packages: project.packages.map((each) =>
        each === shop ? { ...shop, components: [...shop.components, ...shelves] } : each,
      ),
    });
    const result = await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { geometry: large(0.5) },
    });
    expect(result.warnings).toEqual([
      expect.stringMatching(
        /^The package "Shop" holds 5\d\d KiB of free geometry, which slows saving it/,
      ),
    ]);
    const fill = await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { fill: '#E3F2E9' },
    });
    expect(fill).not.toHaveProperty('warnings');
  });
});

describe('update_view with routeStyle', () => {
  it('draws a view’s automatic routes curved, and null draws them orthogonal again', async () => {
    const curved = await tools.value('update_view', { id: 'overview', routeStyle: 'curved' });
    expect(curved).toMatchObject({
      done: 'Edit the view "Overview"',
      automaticRoutes: 'curved',
    });
    expect(curved.note).toContain('set no route');
    expect(overview()?.routeStyle).toBe('curved');
    expect(await tools.value('read_view', { view: 'overview' })).toMatchObject({
      routeStyle: 'curved',
    });

    const orthogonal = await tools.value('update_view', { id: 'overview', routeStyle: null });
    expect(orthogonal).toMatchObject({ automaticRoutes: 'orthogonal' });
    expect(overview()).not.toHaveProperty('routeStyle');
    expect(await tools.value('read_view', { view: 'overview' })).not.toHaveProperty('routeStyle');
    expect(tools.session.actions.map((each) => each.author)).toEqual(['claude', 'claude']);
  });

  it('refuses orthogonal as a style of its own: null is orthogonal', async () => {
    expect(
      await tools.failure('update_view', { id: 'overview', routeStyle: 'orthogonal' }),
    ).toContain('routeStyle');
    expect(tools.session.actions).toEqual([]);
  });
});

describe('update_view with rows and selectionFadesLines (ADR 0080, section 5)', () => {
  it('draws only key rows, turns the fading of lines off, and read_view says both', async () => {
    const done = await tools.value('update_view', {
      id: 'overview',
      rows: 'keys',
      selectionFadesLines: false,
    });
    expect(done).toMatchObject({ done: 'Edit the view "Overview"' });
    expect(overview()).toMatchObject({ rows: 'keys', selectionFadesLines: false });
    expect(await tools.value('read_view', { view: 'overview' })).toMatchObject({
      rows: 'keys',
      selectionFadesLines: false,
    });
    await tools.value('update_view', { id: 'overview', rows: 'all', selectionFadesLines: null });
    expect(overview()).not.toHaveProperty('rows');
    expect(overview()).not.toHaveProperty('selectionFadesLines');
    const read = await tools.value('read_view', { view: 'overview' });
    expect(read).not.toHaveProperty('rows');
    expect(read).not.toHaveProperty('selectionFadesLines');
  });

  it('names both in its description', () => {
    const described = (name: string) => TOOLS.find((each) => each.name === name)?.description ?? '';
    expect(described('update_view')).toContain('"rows": "keys"');
    expect(described('update_view')).toContain('selectionFadesLines');
  });
});

describe('set_route and the automatic style', () => {
  it('stores orthogonal against a curved automatic style, and no style equal to it', async () => {
    await tools.value('update_view', { id: 'overview', routeStyle: 'curved' });
    const same = await tools.value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      style: 'curved',
    });
    expect(same).toMatchObject({
      route: 'automatic',
      automaticStyle: { style: 'curved', from: 'the view "Overview"' },
    });
    expect(same.note).toBe(
      'The style "curved" is the automatic style of this relation here, so it is not stored: the route follows the automatic style when that changes.',
    );
    expect(overview()).not.toHaveProperty('routes');

    const orthogonal = await tools.value('set_route', {
      view: 'overview',
      relation: 'customer-calls-api',
      style: 'orthogonal',
    });
    expect(orthogonal).toMatchObject({
      route: { style: 'orthogonal' },
      automaticStyle: { style: 'curved', from: 'the view "Overview"' },
    });
    expect(orthogonal).not.toHaveProperty('note');
    expect(overview()?.routes).toEqual({ 'customer-calls-api': { style: 'orthogonal' } });
  });

  it('says where the automatic style comes from', async () => {
    const from = async () =>
      (
        (await tools.value('set_route', {
          view: 'overview',
          relation: 'api-reads-db',
          bendPoints: [{ x: 120, y: 100 }],
        })) as { automaticStyle: unknown }
      ).automaticStyle;
    expect(await from()).toEqual({
      style: 'orthogonal',
      from: 'nothing sets one, so it is orthogonal',
    });
    await tools.value('set_appearance', {
      relationType: 'systems.reads-from',
      appearanceTraits: { route: 'straight' },
    });
    expect(await from()).toEqual({
      style: 'straight',
      from: 'the relation type "reads from"',
    });
    await tools.value('set_appearance', {
      relation: 'api-reads-db',
      appearanceTraits: { route: 'curved' },
    });
    expect(await from()).toEqual({ style: 'curved', from: 'the relation’s own appearance' });
  });
});

describe('replace_image and anchored parts', () => {
  beforeEach(async () => {
    await addAtlas();
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { part: { part: 'lung', image: 'shop.atlas' } },
    });
    await tools.value('set_appearance', {
      element: 'db',
      appearanceTraits: { part: { part: 'liver', image: 'shop.atlas' } },
    });
  });

  it('lists the anchored parts the new picture loses, with the elements drawn as them', async () => {
    const replaced = await tools.value('replace_image', { id: 'shop.atlas', svg: LUNG_ONLY });
    expect(replaced).toMatchObject({
      done: 'Replace the image "Atlas"',
      partsLost: [{ part: 'liver', elements: [{ id: 'db', name: 'DB' }] }],
    });
    expect(replaced.partsLostSay).toContain('anchors are kept');
    expect(replaced.warnings).toEqual([
      'The element "DB" is drawn as the part "liver" of the image "Atlas" (shop.atlas), which it does not have; it is drawn as an ordinary shape until the picture has that part again.',
    ]);
    // The anchor is kept, so a picture with the part again anchors it again.
    expect(element('db')?.appearance?.part).toEqual({ part: 'liver', image: 'shop.atlas' });
    const back = await tools.value('replace_image', { id: 'shop.atlas', svg: ATLAS });
    expect(back).not.toHaveProperty('partsLost');
    expect(back).not.toHaveProperty('warnings');
  });

  it('loses nothing when the picture keeps its parts, or only its name changes', async () => {
    const renamed = await tools.value('replace_image', { id: 'shop.atlas', name: 'Body atlas' });
    expect(renamed).not.toHaveProperty('partsLost');
    const redrawn = await tools.value('replace_image', {
      id: 'shop.atlas',
      svg: ATLAS.replace('h10v10', 'h9v9'),
    });
    expect(redrawn).not.toHaveProperty('partsLost');
  });
});

describe('the read tools', () => {
  beforeEach(async () => {
    await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { geometry: HEART },
    });
    await tools.value('set_appearance', { element: 'api', appearanceTraits: { geometry: RING } });
    await tools.value('set_appearance', {
      relationType: 'systems.reads-from',
      appearanceTraits: { route: 'curved' },
    });
    await tools.value('set_appearance', {
      relation: 'customer-calls-api',
      appearanceTraits: { route: 'straight' },
    });
  });

  it('list_definitions gives free geometry in brief, its path data when asked, and relation types’ routes', async () => {
    type Listed = {
      components: { id: string; appearance: Record<string, unknown> }[];
      relationTypes: { id: string; appearance: Record<string, unknown> }[];
    };
    const listed = (await tools.value('list_definitions', { package: 'shop' })) as Listed;
    expect(listed.components.find((each) => each.id === 'shop.cart')?.appearance.geometry).toEqual({
      box: { width: 120, height: 110 },
      contours: 1,
      holes: 0,
      characters: HEART_D.length,
      keepProportions: true,
      label: { x: 24, y: 30, width: 72, height: 36 },
      pathData: 'Left out: pass fullGeometry true to read it.',
    });
    const full = (await tools.value('list_definitions', {
      package: 'shop',
      fullGeometry: true,
    })) as Listed;
    expect(full.components.find((each) => each.id === 'shop.cart')?.appearance.geometry).toEqual(
      HEART,
    );
    const all = (await tools.value('list_definitions')) as Listed;
    expect(
      all.relationTypes.find((each) => each.id === 'systems.reads-from')?.appearance,
    ).toMatchObject({ route: 'curved' });
  });

  it('get_item gives an element’s own geometry in brief and a relation’s own route', async () => {
    expect(await tools.value('get_item', { id: 'api' })).toMatchObject({
      appearance: { geometry: { box: { width: 100, height: 100 }, contours: 2, holes: 1 } },
    });
    expect(await tools.value('get_item', { id: 'api', fullGeometry: true })).toMatchObject({
      appearance: { geometry: RING },
    });
    expect(await tools.value('get_item', { id: 'customer-calls-api' })).toMatchObject({
      appearance: { route: 'straight' },
    });
  });

  it('get_project and read_view give a view’s route style', async () => {
    await tools.value('update_view', { id: 'overview', routeStyle: 'straight' });
    expect(await tools.value('get_project')).toMatchObject({
      views: [{ id: 'overview', routeStyle: 'straight' }],
    });
    expect(await tools.value('read_view', { view: 'overview' })).toMatchObject({
      routeStyle: 'straight',
    });
  });
});

describe('the descriptions', () => {
  const described = (name: string) => TOOLS.find((each) => each.name === name)?.description ?? '';

  it('show path data for a heart, a triangle and a ring with a hole, and a part of an atlas', () => {
    const appearance = described('set_appearance');
    expect(appearance).toContain('Example, a heart:');
    expect(appearance).toContain(HEART_D);
    expect(appearance).toContain('"kind": "polygon"');
    expect(appearance).toContain('Example, a ring with a hole:');
    expect(appearance).toContain('Example, a part of an atlas:');
    expect(appearance).toContain('"route": "curved"');
  });

  it('show a view drawn curved, and a route drawn orthogonal against its automatic style', () => {
    expect(described('update_view')).toContain('"routeStyle": "curved"');
    expect(described('set_route')).toContain('"style": "orthogonal"');
    expect(described('set_route')).toContain('automatic style');
    expect(described('replace_image')).toContain('anchored parts');
  });

  it('are pointed to from the instructions Claude reads first', () => {
    expect(INSTRUCTIONS).toMatch(
      /^- Shapes need not be boxes: set_appearance gives .*free geometry.*named part.*routeStyle/m,
    );
  });

  it('stay short enough to read', () => {
    for (const name of [
      'set_appearance',
      'update_view',
      'set_route',
      'reset_route',
      'replace_image',
      'list_definitions',
      'get_item',
      'read_view',
      'update_element',
      'update_relation',
    ]) {
      expect(described(name).length, name).toBeLessThanOrEqual(4000);
    }
  });
});
