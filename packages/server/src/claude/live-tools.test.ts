/**
 * Claude's tools for live values (ADR 0057): shown in every open app over the attributes they name,
 * kept by the program in memory only, never an action of the history or a change to a file.
 */
import type { LiveValuesMessage } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesIn } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

function liveOf(messages: readonly { type: string }[]): LiveValuesMessage[] {
  return messages.filter((each): each is LiveValuesMessage => each.type === 'live/values');
}

describe('set_live_values', () => {
  it('shows values in every open app, as Claude’s, saving nothing', async () => {
    const app = await tools.openApp();
    const before = await filesIn(tools.session.folder);
    const result = await tools.value('set_live_values', {
      values: [
        { target: 'api', attribute: 'latency', value: 120, measuredAt: '2026-10-25T14:03:00Z' },
        { target: 'api-reads-db', attribute: 'calls per second', value: 310 },
      ],
      freshFor: 15,
    });
    expect(result).toMatchObject({ kept: '2 live values' });
    expect(result.note).toMatch(/never saved, never in the history/);
    await expect.poll(() => liveOf(app.messages).length).toBe(1);
    expect(liveOf(app.messages)[0]?.values).toEqual([
      expect.objectContaining({
        target: 'api',
        attribute: 'latency',
        value: 120,
        measuredAt: Date.parse('2026-10-25T14:03:00Z'),
        sender: { kind: 'claude' },
        freshFor: 15_000,
      }),
      expect.objectContaining({ target: 'api-reads-db', attribute: 'calls per second' }),
    ]);
    expect(tools.session.history).toEqual({});
    expect(await filesIn(tools.session.folder)).toEqual(before);
  });

  it('says which targets it does not know and which values it refused', async () => {
    const result = await tools.value('set_live_values', {
      values: [
        { target: 'nothing', attribute: 'a', value: 1 },
        { target: 'note', attribute: 'a', value: 1 },
        { target: 'api', attribute: 'a', value: 'x'.repeat(2000) },
      ],
    });
    expect(result.kept).toBe('0 live values');
    const unknown = result.unknown as { target: string; why: string }[];
    expect(unknown.map((each) => each.target)).toEqual(['nothing', 'note']);
    expect(unknown[0]?.why).toMatch(/No element or relation has this id/);
    expect(unknown[1]?.why).toMatch(/free-shape, which has no live values/);
    expect(result.refused).toEqual([
      'Value 3 has a value for "a" that it is over 1024 characters as JSON.',
    ]);
  });

  it('refuses a time it cannot read', async () => {
    expect(
      await tools.failure('set_live_values', {
        values: [{ target: 'api', attribute: 'a', value: 1, measuredAt: 'yesterday' }],
      }),
    ).toMatch(/^Value 1 has a measuredAt that is neither/);
  });
});

/** A script's values, as `visual-anything live` sends them; one of them measured an hour ago. */
function fromTheCommandLine(): void {
  tools.session.setLive({}, { kind: 'command-line' }, [
    { target: 'api', attribute: 'owner', value: 'Team B', measuredAt: Date.now() - 3_600_000 },
    { target: 'db', attribute: 'load', value: 0.4 },
  ]);
}

const HOUR = Date.now() - 3_600_000;

describe('the read tools', () => {
  it('answer an element’s live values beside its stored attributes, with sender, age and staleness, saving nothing', async () => {
    const before = await filesIn(tools.session.folder);
    await tools.value('set_live_values', {
      values: [{ target: 'api', attribute: 'latency', value: 120 }],
    });
    fromTheCommandLine();
    const item = await tools.value('get_item', { id: 'api' });
    // The stored value stays as the model holds it; the live one shows beside it.
    expect(item.attributes).toEqual({ owner: 'Team A' });
    expect(item.liveValues).toEqual({
      latency: {
        value: 120,
        sender: 'claude',
        ageSeconds: expect.any(Number) as number,
        stale: false,
        freshForSeconds: 60,
      },
      owner: {
        value: 'Team B',
        sender: 'command-line',
        ageSeconds: expect.any(Number) as number,
        stale: true,
        freshForSeconds: 60,
        measuredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
      },
    });
    const live = item.liveValues as Record<string, { ageSeconds: number }>;
    expect(live.latency?.ageSeconds).toBeLessThan(10);
    expect(live.owner?.ageSeconds).toBeGreaterThanOrEqual(3600);
    expect(live.owner?.ageSeconds).toBeLessThan(3610);
    // Right beside the attributes, so that each reads with the other.
    expect(Object.keys(item).indexOf('liveValues')).toBe(
      Object.keys(item).indexOf('attributes') + 1,
    );
    expect(tools.session.history).toEqual({});
    expect(await filesIn(tools.session.folder)).toEqual(before);
  });

  it('answer a relation’s live values, and none for what has none', async () => {
    await tools.value('set_live_values', {
      values: [{ target: 'api-reads-db', attribute: 'calls per second', value: 310 }],
      freshFor: 15,
    });
    expect((await tools.value('get_item', { id: 'api-reads-db' })).liveValues).toEqual({
      'calls per second': expect.objectContaining({
        value: 310,
        sender: 'claude',
        stale: false,
        freshForSeconds: 15,
      }) as unknown,
    });
    expect(await tools.value('get_item', { id: 'db' })).not.toHaveProperty('liveValues');
  });

  it('show live values beside each element find_elements finds, which it finds by stored values', async () => {
    fromTheCommandLine();
    const found = await tools.value('find_elements', { component: 'systems.service' });
    expect(found.elements).toEqual([
      expect.objectContaining({
        id: 'api',
        attributes: { owner: 'Team A' },
        liveValues: { owner: expect.objectContaining({ value: 'Team B', stale: true }) as unknown },
      }),
    ]);
    // The attribute filter reads what the model holds: the live value does not match it.
    expect(
      await tools.value('find_elements', { attribute: { name: 'owner', equals: 'Team B' } }),
    ).toMatchObject({ total: 0 });
    const db = (
      (await tools.value('find_elements', { nameContains: 'DB' })).elements as Record<
        string,
        unknown
      >[]
    )[0];
    expect(db).toMatchObject({ id: 'db', liveValues: { load: { value: 0.4 } } });
    expect(db).not.toHaveProperty('attributes');
  });
});

describe('get_live_values', () => {
  it('lists every live value, the latest first, with its target, its stored value and its sender', async () => {
    fromTheCommandLine();
    await tools.value('set_live_values', {
      values: [{ target: 'api', attribute: 'latency', value: 120 }],
    });
    const listed = await tools.value('get_live_values');
    expect(listed).toMatchObject({ total: 3 });
    expect(listed).not.toHaveProperty('more');
    expect(listed.values).toEqual([
      expect.objectContaining({
        target: 'api',
        name: 'API',
        kind: 'element',
        attribute: 'latency',
        value: 120,
        sender: 'claude',
        stale: false,
      }),
      expect.objectContaining({ target: 'db', attribute: 'load', sender: 'command-line' }),
      expect.objectContaining({
        target: 'api',
        attribute: 'owner',
        value: 'Team B',
        stored: 'Team A',
        stale: true,
      }),
    ]);
    expect(listed.note).toMatch(/never saved/);
  });

  it('lists those of some targets or attributes, and names the targets it does not know', async () => {
    fromTheCommandLine();
    await tools.value('set_live_values', {
      values: [{ target: 'api-reads-db', attribute: 'calls per second', value: 310 }],
    });
    const ofApi = await tools.value('get_live_values', {
      targets: ['api', 'nothing', 'note', 'not an id'],
    });
    expect((ofApi.values as { attribute: string }[]).map((each) => each.attribute)).toEqual([
      'owner',
    ]);
    expect((ofApi.unknown as { target: string }[]).map((each) => each.target)).toEqual([
      'nothing',
      'note',
      'not an id',
    ]);
    const relation = await tools.value('get_live_values', { attributes: ['calls per second'] });
    expect(relation.values).toEqual([
      expect.objectContaining({ target: 'api-reads-db', name: 'API → DB', kind: 'relation' }),
    ]);
    expect(relation).not.toHaveProperty('unknown');
  });

  it('caps what it lists, and sums up the rest by attribute', async () => {
    tools.session.setLive({}, { kind: 'command-line' }, [
      ...['api', 'db', 'customer', 'cart'].map((target) => ({
        target,
        attribute: 'load',
        value: 1,
      })),
      { target: 'api', attribute: 'owner', value: 'Team B', measuredAt: HOUR },
    ]);
    const listed = await tools.value('get_live_values', { limit: 2 });
    expect(listed).toMatchObject({
      total: 5,
      more: 3,
      summary: {
        targets: 4,
        stale: 1,
        attributes: [
          { attribute: 'load', values: 4, stale: 0 },
          { attribute: 'owner', values: 1, stale: 1 },
        ],
      },
    });
    expect(listed.values).toHaveLength(2);
  });

  it('says when nothing is live', async () => {
    const listed = await tools.value('get_live_values');
    expect(listed).toMatchObject({ values: [], total: 0 });
    expect(listed.note).toMatch(/^No live values show now/);
  });
});

describe('clear_live_values', () => {
  it('clears Claude’s own, or everyone’s', async () => {
    const app = await tools.openApp();
    await tools.value('set_live_values', {
      values: [
        { target: 'api', attribute: 'latency', value: 1 },
        { target: 'db', attribute: 'latency', value: 2 },
      ],
    });
    tools.session.setLive({}, { kind: 'command-line' }, [
      { target: 'db', attribute: 'load', value: 3 },
    ]);
    expect(await tools.value('clear_live_values', { targets: ['api'] })).toMatchObject({
      cleared: '1 live value',
    });
    expect(await tools.value('clear_live_values', {})).toMatchObject({ cleared: '1 live value' });
    expect(await tools.value('clear_live_values', { everyone: true })).toMatchObject({
      cleared: '1 live value',
    });
    await expect
      .poll(() => liveOf(app.messages).at(-1)?.removed)
      .toEqual([{ target: 'db', attribute: 'load' }]);
  });
});
