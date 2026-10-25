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
