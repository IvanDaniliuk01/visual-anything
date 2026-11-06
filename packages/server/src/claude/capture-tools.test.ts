/**
 * `capture_view` (ADR 0081): Claude sees a view as the app draws it. Through the whole way a call goes,
 * MCP, the tool, the bridge, the Claude endpoint and the session, to a simulated tab that answers
 * `capture/request` as the app does: the answer is an image Claude reads, with a short text, and it
 * changes nothing. With no app open it says so, and it never opens a browser.
 */
import {
  MAX_CAPTURE_BYTES,
  type CaptureRequestMessage,
  type ServerMessage,
} from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveClient } from '../test-support';
import { TOOLS } from './tools';
import { startToolHarness, type ToolHarness } from './tool-harness';

let harness: ToolHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type Asked = Extract<ServerMessage, { type: 'capture/request' }>;

/** A tab that answers each picture it is asked for with what `answer` makes of the request. */
function tab(app: LiveClient, answer: (asked: CaptureRequestMessage) => object) {
  const asked: CaptureRequestMessage[] = [];
  let seen = 0;
  const timer = setInterval(() => {
    const requests = app.messages.filter(
      (message): message is Asked => message.type === 'capture/request',
    );
    for (; seen < requests.length; seen += 1) {
      const request = requests[seen] as Asked;
      asked.push(request);
      app.send({ type: 'capture/answer', requestId: request.requestId, ...answer(request) });
    }
  }, 5);
  return { asked, stop: () => clearInterval(timer) };
}

const picture = (asked: CaptureRequestMessage, more: object = {}) => ({
  picture: {
    png: PNG,
    width: asked.width,
    height: Math.round(asked.width / 2),
    view: asked.view ?? 'overview',
    theme: asked.theme ?? 'light',
    scale: 0.5,
    ...more,
  },
});

describe('capture_view', () => {
  it('is a read: its name starts with a read verb, and it says so', () => {
    const tool = TOOLS.find((each) => each.name === 'capture_view');
    expect(tool?.hints).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(tool?.description).toContain('Example:');
  });

  it('answers with the picture as an image, and a short text with the view and what it shows', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, (asked) => picture(asked));
    try {
      const result = await harness.content('capture_view', { view: 'overview' });
      expect(result.isError).toBeFalsy();
      const image = result.content.find((each) => each.type === 'image');
      expect(image).toEqual({ type: 'image', data: PNG, mimeType: 'image/png' });
      const text = result.content.find((each) => each.type === 'text');
      expect(text?.type === 'text' ? text.text : '').toMatch(
        /"Overview".*the whole view.*1280 × 640 pixels.*light theme/s,
      );
      // The default region and width, the tab's theme.
      expect(running.asked[0]).toMatchObject({ view: 'overview', region: 'whole', width: 1280 });
      expect(running.asked[0]?.theme).toBeUndefined();
    } finally {
      running.stop();
    }
  });

  it('sends the region, width and theme asked for, and names the elements with no shape there', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, (asked) => picture(asked, { theme: 'dark', missing: ['api'] }));
    try {
      const result = await harness.content('capture_view', {
        view: 'overview',
        region: ['system', 'api'],
        width: 600,
        theme: 'dark',
      });
      expect(running.asked[0]).toMatchObject({
        view: 'overview',
        region: ['system', 'api'],
        width: 600,
        theme: 'dark',
      });
      const text = result.content.find((each) => each.type === 'text');
      const said = text?.type === 'text' ? text.text : '';
      expect(said).toContain('2 elements');
      expect(said).toContain('dark theme');
      expect(said).toMatch(/no shape.*API/s);
    } finally {
      running.stop();
    }
  });

  it('pictures the view the tab shows when none is named', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, (asked) => picture(asked));
    try {
      await harness.content('capture_view', { region: 'viewport' });
      expect(running.asked[0]?.view).toBeUndefined();
      expect(running.asked[0]?.region).toBe('viewport');
    } finally {
      running.stop();
    }
  });

  it('says, with no app open, that open_app opens one, and never opens a browser', async () => {
    harness = await startToolHarness();
    const message = await harness.failure('capture_view', { view: 'overview' });
    expect(message).toContain('open_app');
    expect(harness.opened).toEqual([]);
  });

  it('refuses a view, or elements, the project does not have, before asking the app', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    expect(await harness.failure('capture_view', { view: 'nowhere' })).toContain('nowhere');
    expect(
      await harness.failure('capture_view', { view: 'overview', region: ['ghost'] }),
    ).toContain('ghost');
    expect(app.messages.some((message) => message.type === 'capture/request')).toBe(false);
  });

  it('refuses a width outside 256 to 2,048', async () => {
    harness = await startToolHarness();
    expect((await harness.call('capture_view', { width: 255 })).ok).toBe(false);
    expect((await harness.call('capture_view', { width: 2049 })).ok).toBe(false);
  });

  it('says how to ask again when the picture would be larger than 4 MiB', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, () => ({ failed: 'too-large', bytes: 6 * 1024 * 1024 }));
    try {
      const message = await harness.failure('capture_view', { view: 'overview', width: 2048 });
      expect(message).toMatch(/6\.0 MiB.*4 MiB/s);
      expect(message).toContain('smaller width');
      expect(message).toContain('region');
    } finally {
      running.stop();
    }
  });

  it('carries a picture of the most size, 4 MiB in base64, from the tab to Claude', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const most = PNG.slice(0, 12) + 'A'.repeat(MAX_CAPTURE_BYTES - 12);
    const running = tab(app, (asked) => picture(asked, { png: most }));
    try {
      const result = await harness.content('capture_view', { view: 'overview', width: 2048 });
      const image = result.content.find((each) => each.type === 'image');
      expect(image?.type === 'image' ? image.data.length : 0).toBe(MAX_CAPTURE_BYTES);
    } finally {
      running.stop();
    }
  }, 30_000);

  it('says when the tab shows another view, and how to show this one without its help', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, () => ({ failed: 'other-view', shows: 'overview' }));
    try {
      const made = await harness.value('create_view', {
        name: 'Billing',
        perspective: { name: 'Data flow' },
        nestingRelationTypes: ['systems.is-part-of'],
      });
      const message = await harness.failure('capture_view', { view: made.view as string });
      expect(message).toContain('"Overview"');
      expect(message).toContain('"Billing"');
      expect(message).toContain('open_app');
    } finally {
      running.stop();
    }
  });

  it('says when no tab took it, and when the drawing failed', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    let next: object = { passed: 'other-tab' };
    const running = tab(app, () => next);
    try {
      expect(await harness.failure('capture_view', {})).toContain('used last');
      next = { failed: 'failed', why: 'No WebGL.' };
      expect(await harness.failure('capture_view', {})).toContain('No WebGL.');
      next = { failed: 'no-canvas' };
      expect(await harness.failure('capture_view', {})).toContain('open_app');
      next = { failed: 'empty' };
      expect(await harness.failure('capture_view', {})).toContain('draws nothing');
      next = { failed: 'not-drawn' };
      expect(await harness.failure('capture_view', { region: ['api'] })).toContain('API');
    } finally {
      running.stop();
    }
  });

  it('changes nothing: no file, no history', async () => {
    harness = await startToolHarness();
    const app = await harness.openApp();
    const running = tab(app, (asked) => picture(asked));
    try {
      const actions = harness.session.actions;
      const snapshot = harness.session.snapshot;
      await harness.content('capture_view', { view: 'overview' });
      await harness.session.idle();
      expect(harness.session.actions).toEqual(actions);
      expect(harness.session.snapshot).toBe(snapshot);
      expect(app.messages.some((message) => message.type === 'project/changed')).toBe(false);
    } finally {
      running.stop();
    }
  });

  it('says what it waited for when the tab used last never answers, as one in the background (#16)', async () => {
    harness = await startToolHarness(undefined, { captureWait: 50 });
    await harness.openApp();
    const result = await harness.content('capture_view', {
      view: 'overview',
      region: ['api'],
      width: 600,
    });
    expect(result.isError).toBe(true);
    const text = result.content.find((each) => each.type === 'text');
    const said = text?.type === 'text' ? text.text : '';
    expect(said).toContain('waited 0.05 s');
    expect(said).toContain('the tab the person used last');
    expect(said).toMatch(/"Overview" \(overview\)/);
    expect(said).toContain('600 pixels wide');
    expect(said).toContain('background');
  });
});
