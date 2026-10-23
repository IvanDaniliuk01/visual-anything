import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { appearanceOf, resolveDefinitions } from './definitions';

const sample = loadSample();

describe('resolveDefinitions', () => {
  const definitions = resolveDefinitions(sample.packages);

  it('gives a component what it does not redefine from the component it derives from', () => {
    const chatChannel = definitions.component('systems.chat-channel');
    expect(chatChannel.name).toBe('Chat channel');
    expect(chatChannel.appearance).toEqual({
      shape: 'rounded-rectangle',
      fill: '#D8F3E3',
      stroke: '#1E6B43',
      width: 180,
      height: 72,
    });
  });

  it('gives a component Essence’s appearance for whatever its whole lineage leaves out', () => {
    const system = definitions.component('systems.system');
    const essence = definitions.component('essence');
    expect(essence.name).toBe('Essence');
    expect(system.appearance.width).toBe(essence.appearance.width);
    expect(system.appearance.height).toBe(essence.appearance.height);
    expect(system.appearance.fill).toBe('#F3F5F8');
  });

  it('names an unknown component by its id and draws it like Essence', () => {
    const unknown = definitions.component('elsewhere.gadget');
    expect(unknown.name).toBe('elsewhere.gadget');
    expect(unknown.appearance).toEqual(definitions.component('essence').appearance);
  });

  it('resolves the direction, nesting and appearance of relation types', () => {
    expect(definitions.relationType('systems.is-part-of')).toMatchObject({
      name: 'is part of',
      direction: 'directed',
      nests: true,
    });
    expect(definitions.relationType('systems.reads-from')).toMatchObject({
      nests: false,
      appearance: { stroke: '#3D4651', width: 2, dash: 'dashed' },
    });
  });

  it('lets relation types inherit along derivesFrom, up to "relates to"', () => {
    const packages: PackageFile[] = [
      {
        id: 'p',
        name: 'P',
        components: [],
        relationTypes: [
          {
            id: 'p.contains',
            name: 'contains',
            derivesFrom: 'relates-to',
            direction: 'directed',
            nests: true,
            appearance: { stroke: '#112233' },
          },
          { id: 'p.holds', name: 'holds', derivesFrom: 'p.contains', appearance: { width: 3 } },
          { id: 'p.near', name: 'is near', derivesFrom: 'relates-to' },
        ],
      },
    ];
    const resolved = resolveDefinitions(packages);
    expect(resolved.relationType('p.holds')).toMatchObject({
      direction: 'directed',
      nests: true,
      appearance: { stroke: '#112233', width: 3, dash: 'solid' },
    });
    expect(resolved.relationType('p.near')).toMatchObject({
      direction: 'undirected',
      nests: false,
    });
    expect(resolved.relationType('relates-to').name).toBe('relates to');
  });

  it('stops at a derivesFrom cycle instead of looping', () => {
    const packages: PackageFile[] = [
      {
        id: 'p',
        name: 'P',
        components: [
          { id: 'p.a', name: 'A', derivesFrom: 'p.b', appearance: { fill: '#AAAAAA' } },
          { id: 'p.b', name: 'B', derivesFrom: 'p.a', appearance: { shape: 'ellipse' } },
        ],
        relationTypes: [],
      },
    ];
    const resolved = resolveDefinitions(packages);
    expect(resolved.component('p.a').appearance).toMatchObject({
      fill: '#AAAAAA',
      shape: 'ellipse',
    });
  });
});

describe('appearanceOf', () => {
  it('takes what an element’s own appearance sets, a particularity, before its component’s', () => {
    const definitions = resolveDefinitions(sample.packages);
    const agent = sample.model.elements.find((element) => element.id === 'booking-agent');
    expect(agent).toBeDefined();
    if (!agent) return;
    expect(appearanceOf(agent, definitions)).toEqual({
      shape: 'rounded-rectangle',
      fill: '#F8E1EC',
      stroke: '#5B3A9E',
      width: 180,
      height: 72,
    });
  });
});
