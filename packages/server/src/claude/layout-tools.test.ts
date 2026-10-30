/**
 * `lay_out_view` waits (M3d, "Fixes from use"). The first real model called it for 8 views in a row:
 * all answered `{"apps": 1}`, but only 2 were laid out, since each call opened its view before the
 * layout before it was done. Through the whole way a call goes, MCP, the bridge, the Claude endpoint
 * and the session, to an app that lays out one view at a time: every call answers once its own layout
 * is done, with what it moved, and no layout is sent while another runs.
 */
import type { Guidance, LayoutResult, ServerMessage } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveClient } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let harness: ToolHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

type Asked = Extract<ServerMessage, { type: 'guidance' }> & { answer: string };

/**
 * An app tab that lays out each layout it is asked for in `takes` ms, then answers with what `answer`
 * makes of it; it counts the layouts asked for while it was busy with another.
 */
function tab(
  app: LiveClient,
  answer: (guidance: Guidance, nth: number) => object = (_guidance, nth) => ({
    layouts: [{ ended: 'done', moved: nth }],
  }),
  takes = 20,
) {
  const ran: Guidance[] = [];
  let busy = false;
  let overlaps = 0;
  let seen = 0;
  const timer = setInterval(() => {
    const asked = app.messages.filter(
      (message): message is Asked => message.type === 'guidance' && message.answer !== undefined,
    );
    for (; seen < asked.length; seen += 1) {
      const message = asked[seen] as Asked;
      if (busy) overlaps += 1;
      busy = true;
      ran.push(message.guidance);
      const nth = ran.length;
      setTimeout(() => {
        busy = false;
        app.send({
          type: 'layout/done',
          requestId: message.answer,
          ...answer(message.guidance, nth),
        });
      }, takes);
    }
  }, 5);
  return {
    ran,
    get overlaps() {
      return overlaps;
    },
    stop: () => clearInterval(timer),
  };
}

describe('lay_out_view', () => {
  it('lays out every view of several asked for at once, one after another, each answering what it moved', async () => {
    harness = await startToolHarness();
    const views = ['overview'];
    for (let n = 1; n < 8; n += 1) {
      const made = await harness.value('create_view', {
        name: `View ${n}`,
        perspective: { name: 'Data flow' },
        nestingRelationTypes: ['systems.is-part-of'],
      });
      views.push(made.view as string);
    }
    const app = await harness.openApp();
    const running = tab(app);
    try {
      const answers = await Promise.all(
        views.map((view) => (harness as ToolHarness).value('lay_out_view', { view })),
      );
      expect(running.overlaps).toBe(0);
      expect(running.ran.map((each) => (each as { view?: string }).view).sort()).toEqual(
        [...views].sort(),
      );
      const moved = answers.map((each) => each.moved as number).sort((a, b) => a - b);
      expect(moved).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const each of answers) {
        expect(each).toMatchObject({ apps: 1, laidOut: [{ ended: 'done' }] });
        expect(String(each.note)).toContain('moved');
      }
    } finally {
      running.stop();
    }
  });

  it('says when the person stopped a layout, when the tab replaced it, and names the containers', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const layouts: LayoutResult[] = [
      { container: 'system', ended: 'stopped', moved: 0 },
      { ended: 'replaced', moved: 0 },
    ];
    const running = tab(app, () => ({ layouts }));
    try {
      const answer = await harness.value('lay_out_view', { containers: ['system'] });
      expect(answer).toMatchObject({
        apps: 1,
        moved: 0,
        laidOut: [
          { container: 'system', name: 'Shop system', ended: 'stopped', moved: 0 },
          { ended: 'replaced', moved: 0 },
        ],
      });
      expect(String(answer.note)).toContain(
        'The person stopped the layout of the contents of "Shop system"',
      );
      expect(String(answer.note)).toContain('call lay_out_view again');
    } finally {
      running.stop();
    }
  });

  it('says why nothing was laid out when the tab passed it over, or no app is open', async () => {
    harness = await startToolHarness();
    expect(await harness.value('lay_out_view', { view: 'overview' })).toEqual({
      apps: 0,
      note: expect.stringContaining('nothing was laid out') as string,
    });
    const app = await harness.openApp();
    const running = tab(app, () => ({ passed: 'other-tab' }));
    try {
      const answer = await harness.value('lay_out_view', { view: 'overview' });
      expect(answer).toMatchObject({ apps: 1, laidOut: false });
      expect(String(answer.note)).toContain('tab the person used last');
    } finally {
      running.stop();
    }
  });
});
