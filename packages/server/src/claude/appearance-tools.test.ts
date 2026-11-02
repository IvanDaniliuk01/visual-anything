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
    ).toBe('Give one of component, relationType, element or relation.');
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

  it('say what the dark canvas draws where the drawing defaults adapt stored colors, and store them as given (ADR 0087)', async () => {
    await tools.value('set_drawing', { drawing: { colors: { storedColorsInDark: 'adapted' } } });
    const result = await tools.value('update_element', {
      id: 'api',
      appearanceTraits: { fill: '#FFFFFF', stroke: '#FFFFFF' },
    });
    // White draws black on the dark canvas: the stroke is measured there as drawn.
    expect(result.warnings).toEqual([
      'The stroke #FFFFFF of "API" is 1.0:1 against the light canvas, under 3:1.',
      'The stroke #FFFFFF of "API", drawn #000000 there, is 1.1:1 against the dark canvas, under 3:1.',
      '"API" blends into the light canvas: its fill #FFFFFF and its stroke #FFFFFF are 1.0:1 and 1.0:1 against it, under 3:1.',
      '"API" blends into the dark canvas: its fill #000000 and its stroke #000000 are 1.1:1 and 1.1:1 against it, under 3:1.',
      'On the dark canvas the fill #FFFFFF of "API" is drawn #000000: the drawing defaults adapt stored colors there (colors.storedColorsInDark). The color stored stays #FFFFFF.',
      'On the dark canvas the stroke #FFFFFF of "API" is drawn #000000: the drawing defaults adapt stored colors there (colors.storedColorsInDark). The color stored stays #FFFFFF.',
    ]);
    expect(state().model.elements.find((each) => each.id === 'api')?.appearance).toEqual({
      fill: '#FFFFFF',
      stroke: '#FFFFFF',
    });
    const item = await tools.value('get_item', { id: 'api' });
    expect(item).toMatchObject({
      appearance: { fill: '#FFFFFF', stroke: '#FFFFFF' },
      darkCanvas: { fill: '#000000', stroke: '#000000' },
    });
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

// Found while modeling Visual Anything with itself (M6): defining and changing a component of the
// project's own said nothing about colors hard to see, where set_appearance warns.
describe('the colors of the project’s own definitions', () => {
  const BLENDS =
    'The component "Shelf" blends into the light canvas: its fill #FFFFFF and its stroke #FFFFFF are 1.0:1 and 1.0:1 against it, under 3:1.';
  const STROKE =
    'The stroke #FFFFFF of the component "Shelf" is 1.0:1 against the light canvas, under 3:1.';

  it('define_component and update_component warn as set_appearance does, and change it all the same', async () => {
    const defined = await tools.value('define_component', {
      package: 'shop',
      component: {
        id: 'shop.shelf',
        name: 'Shelf',
        derivesFrom: 'systems.box',
        appearance: { fill: '#FFFFFF', stroke: '#FFFFFF' },
      },
    });
    expect(defined.warnings).toEqual([STROKE, BLENDS]);
    await tools.value('update_component', {
      id: 'shop.shelf',
      appearance: { fill: '#2F855A', stroke: '#1C4532' },
    });
    const updated = await tools.value('update_component', {
      id: 'shop.shelf',
      appearance: { fill: '#FFFFFF', stroke: '#FFFFFF' },
    });
    expect(updated.warnings).toEqual([STROKE, BLENDS]);
    // Through set_appearance, the same words.
    const set = await tools.value('set_appearance', {
      component: 'shop.shelf',
      appearanceTraits: { fill: '#FFFFFF', stroke: '#FFFFFF' },
    });
    expect(set.warnings).toEqual([STROKE, BLENDS]);
  });

  it('say nothing of colors that read, or of a change that sets none', async () => {
    const defined = await tools.value('define_component', {
      package: 'shop',
      component: {
        id: 'shop.shelf',
        name: 'Shelf',
        derivesFrom: 'systems.box',
        appearance: { fill: '#E3F2E9', stroke: '#2F855A' },
      },
    });
    expect(defined).not.toHaveProperty('warnings');
    const renamed = await tools.value('update_component', { id: 'shop.shelf', name: 'Rack' });
    expect(renamed).not.toHaveProperty('warnings');
  });

  it('define_relation_type and update_relation_type warn about a stroke hard to see', async () => {
    const defined = await tools.value('define_relation_type', {
      package: 'shop',
      relationType: {
        id: 'shop.stocks',
        name: 'stocks',
        derivesFrom: 'relates-to',
        appearance: { stroke: '#FFFFFF' },
      },
    });
    expect(defined.warnings).toEqual([
      'The stroke #FFFFFF of the relation type "stocks" is 1.0:1 against the light canvas, under 3:1.',
    ]);
    const updated = await tools.value('update_relation_type', {
      id: 'shop.stocks',
      appearance: { stroke: '#16191E' },
    });
    expect(updated.warnings).toEqual([
      'The stroke #16191E of the relation type "stocks" is 1.0:1 against the dark canvas, under 3:1.',
    ]);
  });
});

describe('the format panel’s traits through Claude’s tools (ADR 0088)', () => {
  it('sets an element’s style and text traits, and a relation’s opacity, each one action', async () => {
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: {
        borderWidth: 3,
        shadow: 'soft',
        gradient: { to: '#3E63DD', direction: 'right' },
        text: { bold: true, size: 16, position: 'below' },
      },
    });
    const api = () => state().model.elements.find((each) => each.id === 'api');
    expect(api()?.appearance).toMatchObject({
      borderWidth: 3,
      shadow: 'soft',
      gradient: { to: '#3E63DD', direction: 'right' },
      text: { bold: true, size: 16, position: 'below' },
    });
    // One part of the text inherited again, the others kept.
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { text: { size: null } },
    });
    expect(api()?.appearance?.text).toEqual({ bold: true, position: 'below' });
    await tools.value('update_relation', {
      id: 'api-reads-db',
      appearanceTraits: { opacity: 0.5 },
    });
    expect(relation('api-reads-db')?.appearance).toMatchObject({ opacity: 0.5 });
    expect(tools.session.actions.map((each) => each.author)).toEqual([
      'claude',
      'claude',
      'claude',
    ]);
  });

  it('turns and mirrors a shape through set_positions, and keeps the turn through a move', async () => {
    const position = () =>
      state().views[0]?.positions.find(
        (each) => each.element === 'api' && each.container === 'system',
      );
    await tools.value('set_positions', {
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 200, y: 40, rotation: -90, flip: 'vertical' },
      ],
    });
    expect(position()).toMatchObject({ rotation: 270, flip: 'vertical' });
    await tools.value('set_positions', {
      view: 'overview',
      positions: [{ element: 'api', container: 'system', x: 208, y: 40 }],
    });
    expect(position()).toMatchObject({ x: 208, rotation: 270, flip: 'vertical' });
    await tools.value('set_positions', {
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 208, y: 40, rotation: 0, flip: 'none' },
      ],
    });
    expect(position()?.rotation).toBeUndefined();
    expect(position()?.flip).toBeUndefined();
  });

  it('names the new traits and the turn in the tools’ descriptions', () => {
    const described = (name: string) => TOOLS.find((each) => each.name === name)?.description ?? '';
    for (const trait of ['borderWidth', 'cornerRadius', 'opacity', 'shadow', 'gradient', 'text']) {
      expect(described('set_appearance')).toContain(trait);
    }
    expect(described('set_appearance')).toContain('set_positions takes rotation and flip');
    const input = TOOLS.find((each) => each.name === 'set_appearance')?.input as
      Readonly<Record<string, { description?: string } | undefined>> | undefined;
    const traits = input?.appearanceTraits?.description ?? '';
    for (const part of ['borderWidth', 'cornerRadius', 'gradient', 'padding', 'position']) {
      expect(traits).toContain(part);
    }
    expect(described('set_positions')).toContain('rotation');
  });
});
