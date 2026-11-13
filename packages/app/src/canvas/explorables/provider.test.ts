/**
 * A canvas's stills of explorables (ADR 0107, A10.3): faces from the project alone, stills only for
 * an approved explorable, asked for only at rest, one at a time, kept by a key of the frame's inputs,
 * the data, the theme and the bucket, and the last still shown kept until the next arrives.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withExplorableApproval, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { explorableFaces } from '../../explorables/faces';
import { explorableOf } from '../../explorables/explorable';
import { ExplorableSession } from '../../explorables/session';
import { ExplorableStills, type StillsPlatform } from '../../explorables/stills';
import type { StillTake } from '../../explorables/still-taker';
import { translatorFor } from '../../i18n';
import { loadSample } from '../../test/sample';
import type { StillSpot } from './layer';
import { CanvasExplorables } from './provider';

const ID = 'quadratic.parabola';

function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  const text = readFileSync(
    join(
      import.meta.dirname,
      '../../../../../examples/quadratic-function/explorables/quadratic.html',
    ),
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

function harness() {
  const project = quadratic();
  const session = new ExplorableSession(new Storage());
  const taken: StillTake[] = [];
  const finish: (() => void)[] = [];
  const platform: StillsPlatform = {
    take: (take) => {
      taken.push(take);
      return new Promise((resolve) =>
        finish.push(() =>
          resolve({
            ok: true,
            png: new Uint8Array([1]),
            width: take.width,
            height: 3,
            errors: [],
            ready: true,
          }),
        ),
      );
    },
    decode: (png) => Promise.resolve({ decoded: png.length }),
  };
  const stills = new ExplorableStills(session, platform);
  stills.setListener({ port: 47801, nonce: 'n'.repeat(32) });
  const canvas = new CanvasExplorables(stills);
  const t = translatorFor('en');
  const hash = explorableOf(project, ID)!.hash!;
  const update = (approved: boolean, theme: 'light' | 'dark' = 'light') =>
    canvas.update({
      project,
      faces: explorableFaces(
        project,
        approved ? withExplorableApproval([], hash, ID) : [],
        session,
        { kind: 'known', listener: { port: 47801, nonce: 'n'.repeat(32) } },
        t,
      ),
      theme,
      language: 'en',
      sources: () => undefined,
    });
  const spot: StillSpot = {
    spot: 'shape-1',
    explorable: ID,
    element: 'quadratic-function',
    width: 320,
    height: 240,
    bucket: 512,
    distance: 0,
  };
  const settle = async () => {
    for (const each of finish.splice(0)) each();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { canvas, update, spot, taken, settle, session, hash, stills };
}

describe('a canvas’s stills of explorables', () => {
  it('draws a card that says why, and takes no still, until the explorable is approved', () => {
    const { canvas, update, spot, taken } = harness();
    update(false);
    expect(canvas.face(ID)).toMatchObject({
      runs: false,
      why: 'Not approved yet: Approve to run.',
    });
    expect(canvas.still(spot, true)).toBeUndefined();
    canvas.flush(true);
    expect(taken).toEqual([]);
  });

  it('asks for a still only at rest, sized as its spot, at its bucket', async () => {
    const { canvas, update, spot, taken, settle } = harness();
    update(true);
    expect(canvas.face(ID)).toMatchObject({ runs: true, why: 'Double-click to explore.' });
    expect(canvas.still(spot, false)).toBeUndefined();
    canvas.flush(false);
    expect(taken).toEqual([]);
    expect(canvas.still(spot, true)).toBeUndefined();
    canvas.flush(true);
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ width: 512, data: { size: { width: 320, height: 240 } } });
    expect(taken[0]?.address).toMatch(/^http:\/\/[a-z0-9]{24}\.localhost:47801\/n+\/frame\//);
    await settle();
    expect(canvas.still(spot, true)).toMatchObject({ width: 512, height: 3 });
    canvas.flush(true);
    expect(taken).toHaveLength(1);
  });

  it('keeps the still it showed until the new one arrives, as when the theme changes', async () => {
    const { canvas, update, spot, taken, settle } = harness();
    update(true);
    canvas.still(spot, true);
    canvas.flush(true);
    await settle();
    const light = canvas.still(spot, true);
    update(true, 'dark');
    expect(canvas.still(spot, true)).toBe(light);
    canvas.flush(true);
    expect(taken).toHaveLength(2);
    expect(taken[1]?.data.theme).toBe('dark');
    await settle();
    const dark = canvas.still(spot, true);
    expect(dark).not.toBe(light);
    expect(dark?.key).not.toBe(light?.key);
  });

  it('gives an image off screen the stills kept in its theme, and asks for none', async () => {
    const { canvas, update, spot, taken, settle } = harness();
    update(true);
    canvas.still(spot, true);
    canvas.flush(true);
    await settle();
    const light = canvas.forImage('light');
    expect(light.still(spot, true)).toMatchObject({ width: 512 });
    const dark = canvas.forImage('dark');
    expect(dark.still(spot, true)).toBeUndefined();
    dark.flush(true);
    expect(taken).toHaveLength(1);
    expect(dark.face(ID)).toMatchObject({ runs: true });
  });

  it('shows the still of a frame as it was left, over its default one, until it is explored again', async () => {
    const { canvas, update, spot, taken, settle } = harness();
    update(true);
    canvas.still(spot, true);
    canvas.flush(true);
    await settle();
    const left = { key: 'left', picture: { left: true }, width: 512, height: 384 };
    canvas.leave(spot.spot, ID, left);
    expect(canvas.still(spot, true)).toBe(left);
    // Its data changing, as a theme switch changes it, keeps it: it is how the person left it.
    update(true, 'dark');
    expect(canvas.still(spot, true)).toBe(left);
    canvas.flush(true);
    expect(taken).toHaveLength(1);
    // Another explorable at the spot shows its own.
    expect(canvas.still({ ...spot, explorable: 'quadratic.other' }, true)).toBeUndefined();
    canvas.forget(spot.spot);
    expect(canvas.still(spot, true)).not.toBe(left);
  });

  it('shows no still as it was left once the explorable may not run', () => {
    const { canvas, update, spot } = harness();
    update(true);
    canvas.leave(spot.spot, ID, { key: 'left', picture: {}, width: 512, height: 384 });
    update(false);
    expect(canvas.still(spot, true)).toBeUndefined();
  });

  it('stops taking stills of one the watchdog stopped, and its card says so', () => {
    const { canvas, update, spot, session, hash } = harness();
    session.stop(hash, 'silent');
    update(true);
    expect(canvas.face(ID)).toMatchObject({ runs: false, why: 'Stopped: it stopped answering.' });
    expect(canvas.still(spot, true)).toBeUndefined();
  });
});
