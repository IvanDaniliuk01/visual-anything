/**
 * Appearances through Claude's tools (ADR-0034, ADR-0035), called through MCP as Claude calls them,
 * so that what the tools' inputs would drop shows: `set_appearance` for components and relation
 * types, built-in ones included; a relation's own appearance; the colors of notes and arrows; and
 * the warnings about colors hard to see on a canvas (ADR-0033), which never refuse.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const state = () => tools.session.snapshot;
const relation = (id: string) => state().model.relations.find((each) => each.id === id);
const shop = () => state().packages.find((each) => each.id === 'shop');
const note = () => state().views[0]?.freeShapes.find((each) => each.id === 'note');

describe('set_appearance', () => {
  it('recolors a built-in component in the project file, as one action of Claude’s', async () => {
    const result = await tools.value('set_appearance', {
      component: 'systems.service',
      appearanceTraits: { fill: '#e3f2e9', stroke: '#2F855A' },
    });
    expect(result).toMatchObject({
      undo: 'The person can undo it in the app.',
      keptIn: expect.stringContaining('the project file') as string,
      // Written in capitals, as every command stores a new color.
      appearance: { fill: '#E3F2E9', stroke: '#2F855A' },
    });
    expect(state().project.appearances?.components?.['systems.service']).toEqual({
      fill: '#E3F2E9',
      stroke: '#2F855A',
    });
    expect(tools.session.actions.map((each) => each.author)).toEqual(['claude']);

    // Trait by trait: the stroke goes back to the built-in one, and the fill stays.
    await tools.value('set_appearance', {
      component: 'systems.service',
      appearanceTraits: { stroke: null },
    });
    expect(state().project.appearances?.components?.['systems.service']).toEqual({
      fill: '#E3F2E9',
    });
    // Whole: null takes the project's own appearance away.
    await tools.value('set_appearance', { component: 'systems.service', appearance: null });
    expect(state().project.appearances).toBeUndefined();
    expect(tools.session.actions).toHaveLength(3);
  });

  it('recolors a built-in relation type, and a component of the project’s own in its package', async () => {
    await tools.value('set_appearance', {
      relationType: 'systems.reads-from',
      appearanceTraits: { stroke: '#C05621', dash: 'dashed' },
    });
    expect(state().project.appearances?.relationTypes?.['systems.reads-from']).toEqual({
      stroke: '#C05621',
      dash: 'dashed',
    });
    const result = await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { stroke: '#2B6CB0' },
    });
    expect(result.keptIn).toBe('the package "shop", in the definition itself');
    expect(shop()?.components.find((each) => each.id === 'shop.cart')?.appearance?.stroke).toBe(
      '#2B6CB0',
    );
  });

  it('asks for one definition, and says why the core refuses a color', async () => {
    expect(
      await tools.failure('set_appearance', {
        component: 'systems.service',
        relationType: 'systems.reads-from',
        appearanceTraits: { fill: '#FFFFFF' },
      }),
    ).toBe('Give either a component or a relation type.');
    const refused = await tools.failure('set_appearance', {
      component: 'systems.service',
      appearanceTraits: { fill: 'red' },
    });
    expect(refused).toContain('must be a color written as #RRGGBB, not "red"');
    expect(refused).toMatch(/\(invalid-appearance\)$/);
    expect(tools.session.actions).toEqual([]);
  });

  it('warns about a stroke hard to see on a canvas, and changes it all the same', async () => {
    const result = await tools.value('set_appearance', {
      relationType: 'systems.reads-from',
      appearanceTraits: { stroke: '#16191E' },
    });
    expect(result.warnings).toEqual([
      'The stroke #16191E of the relation type "reads from" is 1.0:1 against the dark canvas, under 3:1.',
    ]);
    expect(state().project.appearances?.relationTypes?.['systems.reads-from']?.stroke).toBe(
      '#16191E',
    );
  });
});

describe('a relation’s own appearance', () => {
  it('is set trait by trait, replaced whole and taken away by update_relation', async () => {
    const traits = await tools.value('update_relation', {
      id: 'api-reads-db',
      appearanceTraits: { stroke: '#C05621', dash: 'dashed' },
    });
    expect(traits.done).not.toBe('Nothing changed, so nothing was recorded.');
    expect(relation('api-reads-db')?.appearance).toEqual({ stroke: '#C05621', dash: 'dashed' });

    await tools.value('update_relation', { id: 'api-reads-db', appearance: { width: 3 } });
    expect(relation('api-reads-db')?.appearance).toEqual({ width: 3 });

    await tools.value('update_relation', { id: 'api-reads-db', appearance: null });
    expect(relation('api-reads-db')).not.toHaveProperty('appearance');
    expect(tools.session.actions.map((each) => each.author)).toEqual([
      'claude',
      'claude',
      'claude',
    ]);
  });

  it('is given to a new relation by add_to_model', async () => {
    const result = await tools.value('add_to_model', {
      relations: [
        {
          ref: 'writes',
          relationType: 'systems.writes-to',
          from: 'api',
          to: 'db',
          appearance: { stroke: '#2B6CB0', dash: 'dotted' },
        },
      ],
    });
    const made = (result.ids as Record<string, string>).writes ?? '';
    expect(relation(made)?.appearance).toEqual({ stroke: '#2B6CB0', dash: 'dotted' });
  });

  it('warns about a stroke hard to see, by the relation’s ends', async () => {
    const result = await tools.value('update_relation', {
      id: 'api-reads-db',
      appearanceTraits: { stroke: '#ffffff' },
    });
    expect(result.warnings).toEqual([
      'The stroke #FFFFFF of the relation "API → DB" is 1.0:1 against the light canvas, under 3:1.',
    ]);
    expect(
      await tools.failure('update_relation', {
        id: 'api-reads-db',
        appearanceTraits: { stroke: 'blue' },
      }),
    ).toMatch(/\(invalid-appearance\)$/);
  });
});

describe('an element’s colors', () => {
  it('warn about a stroke under 3:1 and a shape that blends into a canvas', async () => {
    const result = await tools.value('update_element', {
      id: 'api',
      appearanceTraits: { fill: '#FFFFFF', stroke: '#FFFFFF' },
    });
    expect(result.warnings).toEqual([
      'The stroke #FFFFFF of "API" is 1.0:1 against the light canvas, under 3:1.',
      '"API" blends into the light canvas: its fill #FFFFFF and its stroke #FFFFFF are 1.0:1 and 1.0:1 against it, under 3:1.',
    ]);
    expect(state().model.elements.find((each) => each.id === 'api')?.appearance).toEqual({
      fill: '#FFFFFF',
      stroke: '#FFFFFF',
    });
  });

  it('say nothing of colors that read on both canvases', async () => {
    const result = await tools.value('update_element', {
      id: 'api',
      appearanceTraits: { fill: '#E3F2E9', stroke: '#2F855A' },
    });
    expect(result).not.toHaveProperty('warnings');
  });
});

describe('notes and arrows', () => {
  it('take colors of their own when added, with a warning for a stroke hard to see', async () => {
    const arrow = await tools.value('add_free_shape', {
      view: 'overview',
      shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 40, y: 40 }, stroke: '#ffffff' },
    });
    expect(arrow.warnings).toEqual([
      'The stroke #FFFFFF of an arrow in "Overview" is 1.0:1 against the light canvas, under 3:1.',
    ]);
    const added = state().views[0]?.freeShapes.find((each) => each.id === arrow.shape);
    expect(added).toMatchObject({ kind: 'arrow', stroke: '#FFFFFF' });

    const colored = await tools.value('add_free_shape', {
      view: 'overview',
      shape: {
        kind: 'note',
        x: 0,
        y: 400,
        width: 200,
        height: 60,
        text: 'Careful.',
        fill: '#FEF3C7',
        stroke: '#B7791F',
      },
    });
    expect(colored).not.toHaveProperty('warnings');
    expect(state().views[0]?.freeShapes.find((each) => each.id === colored.shape)).toMatchObject({
      fill: '#FEF3C7',
      stroke: '#B7791F',
    });
  });

  it('keep their colors when update_free_shape changes something else, until told otherwise', async () => {
    await tools.value('update_free_shape', {
      view: 'overview',
      shape: { id: 'note', fill: '#FEF3C7', stroke: '#B7791F' },
    });
    expect(note()).toMatchObject({ text: 'Hi', fill: '#FEF3C7', stroke: '#B7791F' });
    expect(tools.session.actions.at(-1)?.label).toBe('Change the colors of a note in "Overview"');

    await tools.value('update_free_shape', {
      view: 'overview',
      shape: { id: 'note', text: 'Orders go here.' },
    });
    expect(note()).toEqual({
      kind: 'note',
      id: 'note',
      x: 0,
      y: 320,
      width: 200,
      height: 60,
      text: 'Orders go here.',
      fill: '#FEF3C7',
      stroke: '#B7791F',
    });

    await tools.value('update_free_shape', { view: 'overview', shape: { id: 'note', fill: null } });
    expect(note()).not.toHaveProperty('fill');
    expect(note()).toMatchObject({ stroke: '#B7791F', text: 'Orders go here.' });
  });

  it('warn about a note that blends into a canvas', async () => {
    const result = await tools.value('update_free_shape', {
      view: 'overview',
      shape: { id: 'note', fill: '#FFFFFF', stroke: '#F0F0F0' },
    });
    expect(result.warnings).toEqual([
      'The stroke #F0F0F0 of a note in "Overview" is 1.1:1 against the light canvas, under 3:1.',
      'A note in "Overview" blends into the light canvas: its fill #FFFFFF and its stroke #F0F0F0 are 1.0:1 and 1.1:1 against it, under 3:1.',
    ]);
  });

  it('refuse a free shape that is not there, and an arrow’s fill', async () => {
    expect(
      await tools.failure('update_free_shape', { view: 'overview', shape: { id: 'ghost' } }),
    ).toBe('The view "Overview" has no free shape "ghost". read_view lists them.');
    expect(
      await tools.failure('add_free_shape', {
        view: 'overview',
        shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, fill: '#FFFFFF' },
      }),
    ).toBe(
      'Refused, so nothing changed: An arrow has no fill; give an arrow in "Overview" a stroke instead. (invalid-appearance)',
    );
  });
});

describe('update_component', () => {
  it('sends a built-in component’s look to set_appearance', () => {
    const described = TOOLS.find((each) => each.name === 'update_component')?.description;
    expect(described).toContain('use set_appearance');
    expect(described).not.toContain('change its elements instead');
  });
});
