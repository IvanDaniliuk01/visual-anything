// @vitest-environment node
/**
 * The stills an export draws (ADR 0107): the one the tab's canvas took of each place, found by the
 * key the canvas keeps it by, the largest bucket first; none for an explorable that may not run as
 * it is, nor in another theme; and the read-only page holds them by view, place and theme.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  explorableCard,
  withExplorableApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CanvasExplorables } from '../canvas/explorables/provider';
import type { StillSpot } from '../canvas/explorables/layer';
import { explorableFaces } from '../explorables/faces';
import { ExplorableSession } from '../explorables/session';
import { ExplorableStills, type StillsPlatform } from '../explorables/stills';
import { translatorFor } from '../i18n';
import { loadSample } from '../test/sample';
import { exportStillOf, pageStillsOf } from './explorable-stills';
import { writeSvg } from './svg';

const ID = 'quadratic.parabola';

function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  const text = readFileSync(
    join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
    'utf8',
  );
  return { ...project, explorableTexts: [{ id: ID, text }] };
}

class Storage {
  items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

/** A tab whose canvas took a still of the sample's loose explorable shape, at 512 pixels. */
async function tabWithStill() {
  const project = quadratic();
  const session = new ExplorableSession(new Storage());
  const platform: StillsPlatform = {
    take: (take) =>
      Promise.resolve({
        ok: true,
        png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, take.width & 255]),
        width: take.width,
        height: 3,
        errors: [],
        ready: true,
      }),
    decode: () => Promise.resolve({}),
  };
  const stills = new ExplorableStills(session, platform);
  const listener = { port: 47801, nonce: 'n'.repeat(32) };
  stills.setListener(listener);
  const hash = explorableCard(project, ID).hash ?? '';
  const approvals = withExplorableApproval([], hash, ID);
  const canvas = new CanvasExplorables(stills);
  canvas.update({
    project,
    faces: explorableFaces(
      project,
      approvals,
      session,
      { kind: 'known', listener },
      translatorFor('en'),
    ),
    theme: 'light',
    language: 'en',
    sources: () => undefined,
  });
  // The sample's loose explorable shape, as the canvas's layer asks for it.
  const spot: StillSpot = {
    spot: 'the-parabola',
    explorable: ID,
    element: 'quadratic-function',
    width: 480,
    height: 320,
    bucket: 512,
    distance: 0,
  };
  canvas.still(spot, true);
  canvas.flush(true);
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(canvas.still(spot, true)).toMatchObject({ width: 512 });
  return { project, session, stills, approvals };
}

describe('the stills an export draws', () => {
  it('is the still the canvas took of a place, found by the key the canvas keeps it by', async () => {
    const { project, session, stills, approvals } = await tabWithStill();
    const stillOf = exportStillOf({
      project,
      stills,
      session,
      approvals,
      language: 'en',
      sources: () => undefined,
    });
    const place = {
      spot: 'the-parabola',
      explorable: ID,
      element: 'quadratic-function',
      width: 480,
      height: 320,
    };
    expect(stillOf({ ...place, theme: 'light' })).toMatchObject({
      format: 'png',
      width: 512,
      height: 3,
    });
    // Not in the other theme, at another size, or once its approval is withdrawn.
    expect(stillOf({ ...place, theme: 'dark' })).toBeUndefined();
    expect(stillOf({ ...place, width: 481, theme: 'light' })).toBeUndefined();
    expect(
      exportStillOf({ project, stills, session, approvals: [], language: 'en' })({
        ...place,
        theme: 'light',
      }),
    ).toBeUndefined();
    // The SVG draws it in the shape's place, and the card nowhere.
    const drawing = writeSvg(project, 'the-function', { explorables: { stillOf, approvals } });
    const start = drawing.text.indexOf('data-free-shape="the-parabola"');
    expect(drawing.text.slice(start, start + 400)).toMatch(/<use href="#va-solid-\d+"/);
    expect(drawing.lost).not.toContain(
      'Explorables without a still picture are drawn as their cards.',
    );
  });

  it('is none for an explorable the watchdog stopped, whose card says so', async () => {
    const { project, session, stills, approvals } = await tabWithStill();
    const hash = approvals[0]?.hash ?? '';
    session.stop(hash, 'silent');
    const stillOf = exportStillOf({
      project,
      stills,
      session,
      approvals,
      language: 'en',
      sources: () => undefined,
    });
    expect(
      stillOf({
        spot: 'the-parabola',
        explorable: ID,
        element: 'quadratic-function',
        width: 480,
        height: 320,
        theme: 'light',
      }),
    ).toBeUndefined();
  });

  it('gives a read-only page the stills of each view’s places, by theme', async () => {
    const { project, session, stills, approvals } = await tabWithStill();
    const held = pageStillsOf(
      project,
      exportStillOf({
        project,
        stills,
        session,
        approvals,
        language: 'en',
        sources: () => undefined,
      }),
    );
    expect(held.map(({ png, ...rest }) => ({ ...rest, png: typeof png }))).toEqual([
      {
        view: 'the-function',
        spot: 'the-parabola',
        explorable: ID,
        theme: 'light',
        png: 'string',
      },
    ]);
  });
});
