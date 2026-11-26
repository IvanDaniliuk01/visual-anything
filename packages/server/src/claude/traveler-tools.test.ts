/**
 * Travelers through Claude's tools (ADR 0110), called through MCP as Claude calls them:
 * `set_appearance` sets one, or "none", on a relation type, built-in ones included, and on one
 * relation; `get_item` and `read_view` read them; `update_view` keeps a view's still or hides them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ENVELOPE = `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h10v10H0z" fill="#3366AA"/></svg>`;

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
  await tools.value('add_image', {
    package: 'shop',
    id: 'shop.envelope',
    name: 'Envelope',
    svg: ENVELOPE,
  });
});

afterEach(async () => {
  await tools.close();
});

const state = () => tools.session.snapshot;
const view = () => state().views.find((each) => each.id === 'overview');

describe('set_appearance with a traveler', () => {
  it('sends one along a built-in relation type’s lines, kept in the project file', async () => {
    await tools.value('set_appearance', {
      relationType: 'systems.communicates-with',
      appearanceTraits: { traveler: { image: 'shop.envelope', speed: 'slow' } },
    });
    expect(state().project.appearances?.relationTypes?.['systems.communicates-with']).toEqual({
      traveler: { image: 'shop.envelope', speed: 'slow' },
    });
    expect(tools.session.actions.at(-1)?.author).toBe('claude');

    const item = await tools.value('get_item', { id: 'customer-calls-api' });
    expect(item.traveler).toEqual({
      image: 'shop.envelope',
      size: 20,
      speed: 'slow',
      spacing: 240,
    });
    const read = await tools.value('read_view', { view: 'overview' });
    expect(read.travelersSent).toEqual([
      { relationType: 'systems.communicates-with', image: 'shop.envelope', relations: 1 },
    ]);
    expect(read).not.toHaveProperty('travelers');
  });

  it('takes an inherited one away from one relation with "none"', async () => {
    await tools.value('set_appearance', {
      relationType: 'systems.communicates-with',
      appearanceTraits: { traveler: { image: 'shop.envelope' } },
    });
    await tools.value('set_appearance', {
      relation: 'customer-calls-api',
      appearanceTraits: { traveler: 'none' },
    });
    const item = await tools.value('get_item', { id: 'customer-calls-api' });
    expect(item).not.toHaveProperty('traveler');
    expect(item.appearance).toMatchObject({ traveler: 'none' });
    expect(await tools.value('read_view', { view: 'overview' })).not.toHaveProperty(
      'travelersSent',
    );
  });

  it('is refused for an image no package defines, and for a size out of range', async () => {
    expect(
      await tools.failure('set_appearance', {
        relationType: 'shop.holds',
        appearanceTraits: { traveler: { image: 'shop.nowhere' } },
      }),
    ).toContain('no package in use defines it');
    expect(
      await tools.failure('set_appearance', {
        relation: 'customer-calls-api',
        appearanceTraits: { traveler: { image: 'shop.envelope', size: 100 } },
      }),
    ).toContain('traveler size');
  });

  it('keeps the image from being removed while a traveler sends it', async () => {
    await tools.value('set_appearance', {
      relationType: 'shop.holds',
      appearance: { traveler: { image: 'shop.envelope' } },
    });
    expect(await tools.failure('remove_image', { id: 'shop.envelope' })).toContain('shop.holds');
  });
});

describe('update_view travelers', () => {
  it('keeps them still, hides them, and lets them move again', async () => {
    await tools.value('update_view', { id: 'overview', travelers: 'still' });
    expect(view()?.travelers).toBe('still');
    expect(await tools.value('read_view', { view: 'overview' })).toMatchObject({
      travelers: 'still',
    });
    await tools.value('update_view', { id: 'overview', travelers: 'hidden' });
    expect(view()?.travelers).toBe('hidden');
    await tools.value('update_view', { id: 'overview', travelers: 'moving' });
    expect(view()).not.toHaveProperty('travelers');
    expect(tools.session.actions.map((each) => each.author)).toEqual([
      'claude',
      'claude',
      'claude',
      'claude',
    ]);
  });
});
