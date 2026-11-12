/**
 * Claude's still of an explorable, the app's side (ADR 0107, A10.3): none for one not approved or
 * stopped; otherwise taken in the hidden frame with the element, parameters, theme and width asked,
 * three quarters as tall, before what the canvas waits for, and answered with its PNG in base64, its
 * console errors and whether it said `va.ready()`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withExplorableApproval, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { captureExplorable, type CaptureInputs } from './capture';
import { explorableOf } from './explorable';
import { ExplorableSession } from './session';
import { ExplorableStills } from './stills';
import type { StillTake } from './still-taker';

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

function inputs(approved: boolean) {
  const project = quadratic();
  const session = new ExplorableSession(new Storage());
  const taken: StillTake[] = [];
  const stills = new ExplorableStills(session, {
    take: (take) => {
      taken.push(take);
      return Promise.resolve({
        ok: true,
        png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        width: take.width,
        height: Math.round((take.width * 3) / 4),
        errors: ['Error: one'],
        ready: true,
      });
    },
    decode: () => Promise.resolve(undefined),
  });
  stills.setListener({ port: 47802, nonce: 'n'.repeat(32) });
  const hash = explorableOf(project, ID)!.hash!;
  const given: CaptureInputs = {
    project,
    approvals: approved ? withExplorableApproval([], hash, ID) : [],
    session,
    stills,
    theme: 'light',
    language: 'es',
    sources: undefined,
  };
  return { given, taken, session, hash };
}

describe('Claude’s still of an explorable, in the app', () => {
  it('takes none of an explorable not approved, nor of one the watchdog stopped', async () => {
    const { given } = inputs(false);
    expect(await captureExplorable({ explorable: ID, width: 512 }, given)).toEqual({
      failed: 'not-approved',
    });
    const stopped = inputs(true);
    stopped.session.stop(stopped.hash, 'silent');
    expect(await captureExplorable({ explorable: ID, width: 512 }, stopped.given)).toEqual({
      failed: 'stopped',
    });
    expect(
      await captureExplorable({ explorable: 'quadratic.nothing', width: 512 }, given),
    ).toMatchObject({
      failed: 'failed',
    });
  });

  it('takes it with what was asked, and answers its PNG, its errors and whether it was ready', async () => {
    const { given, taken } = inputs(true);
    const outcome = await captureExplorable(
      {
        explorable: ID,
        element: 'quadratic-function',
        parameters: { a: -1 },
        width: 1024,
        theme: 'dark',
      },
      given,
    );
    expect(outcome).toEqual({
      still: { png: 'iVBORw==', width: 1024, height: 768 },
      errors: ['Error: one'],
      ready: true,
    });
    expect(taken[0]).toMatchObject({
      width: 1024,
      data: {
        theme: 'dark',
        language: 'es',
        size: { width: 1024, height: 768 },
        parameters: { a: -1 },
        element: { id: 'quadratic-function' },
      },
    });
  });
});
