/**
 * What the app works out of an explorable from the project alone (ADR 0107): which one an element
 * shows, the hash its approval is given for, and why it does not run; the marks that keep one that
 * hung the tab from starting by itself; a frame's fresh label; and a pane of the split view that
 * shows one, which is never the active pane.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  approvalHashOf,
  explorableTextHash,
  explorableFrameAddress,
  withExplorableApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { FRAME_LABEL } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { SplitPanes, readPanes, showsView } from '../split/panes';
import { blockOf, explorableOf, explorableOfElement } from './explorable';
import { frameLabel, newFrameAddress } from './frame-address';
import { HangMarks, RUNNING_KEY } from './hang-marks';

function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  const text = readFileSync(
    join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
    'utf8',
  );
  return { ...project, explorableTexts: [{ id: 'quadratic.parabola', text }] };
}

class MemoryStorage {
  items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

describe('an explorable as the app knows it', () => {
  it('is the one an element’s component shows, approved by the hash of its text', () => {
    const project = quadratic();
    expect(explorableOfElement(project, 'quadratic-function')).toBe('quadratic.parabola');
    expect(explorableOfElement(project, 'nowhere')).toBeUndefined();
    const shown = explorableOf(project, 'quadratic.parabola');
    expect(shown?.definition.name).toBeTruthy();
    expect(explorableTextHash(shown?.text ?? '')).toBe(shown?.definition.hash);
    expect(shown?.hash).toBe(approvalHashOf(shown?.definition.hash ?? '', []));
  });

  it('does not run until approved, nor without its text or a script library', () => {
    const project = quadratic();
    const shown = explorableOf(project, 'quadratic.parabola')!;
    expect(blockOf(shown, [])).toEqual({ kind: 'not-approved', hash: shown.hash });
    const approvals = withExplorableApproval([], shown.hash!, shown.id);
    expect(blockOf(shown, approvals)).toBeUndefined();
    expect(blockOf({ ...shown, text: undefined }, approvals)).toEqual({ kind: 'no-text' });
    expect(
      blockOf(
        { ...shown, libraries: [{ id: 'quadratic.d3', definition: undefined }], hash: undefined },
        approvals,
      ),
    ).toEqual({ kind: 'library-missing', library: 'quadratic.d3' });
  });
});

describe('a frame’s address', () => {
  it('takes a fresh label of lowercase letters and digits each time', () => {
    const labels = new Set(Array.from({ length: 50 }, () => frameLabel()));
    expect(labels.size).toBe(50);
    for (const label of labels) expect(label).toMatch(FRAME_LABEL);
    const nonce = 'n'.repeat(22);
    const address = newFrameAddress({ port: 47850, nonce }, 'quadratic.parabola', 'a'.repeat(64));
    expect(address).toMatch(
      /^http:\/\/[a-z0-9]{24}\.localhost:47850\/n{22}\/frame\/quadratic\.parabola\/a{64}$/,
    );
    expect(() =>
      explorableFrameAddress({
        label: 'x',
        port: 47850,
        nonce,
        explorable: 'e',
        hash: 'a'.repeat(64),
      }),
    ).toThrow();
  });
});

describe('the marks of a hang', () => {
  it('keep an explorable that was running when the page could not go from starting by itself', () => {
    const storage = new MemoryStorage();
    const hash = 'b'.repeat(64);
    const first = new HangMarks(storage);
    const ended = first.start(hash);
    expect(JSON.parse(storage.getItem(RUNNING_KEY) ?? '[]')).toEqual([hash]);
    // The page hung: it never went, so the mark stays for the next.
    const next = new HangMarks(storage);
    expect(next.hung(hash)).toBe(true);
    next.forgive(hash);
    expect(next.hung(hash)).toBe(false);
    ended();
  });

  it('go when the frame ends, or when the page goes as it should', () => {
    const storage = new MemoryStorage();
    const hash = 'c'.repeat(64);
    const marks = new HangMarks(storage);
    marks.start(hash)();
    expect(storage.getItem(RUNNING_KEY)).toBeNull();
    marks.start(hash);
    marks.clear();
    expect(new HangMarks(storage).hung(hash)).toBe(false);
  });
});

describe('a pane that shows an explorable', () => {
  it('opens beside the active pane, never becomes active, and comes back after a reload', () => {
    const storage = new MemoryStorage();
    const project = { name: 'p', views: ['v1', 'v2'] };
    const panes = new SplitPanes(storage, project);
    panes.openExplorableBeside('quadratic.parabola', 'quadratic-function');
    const layout = panes.snapshot();
    expect(layout.panes).toHaveLength(2);
    const pane = layout.panes[1]!;
    expect(pane.explorable).toEqual({ id: 'quadratic.parabola', element: 'quadratic-function' });
    expect(showsView(pane)).toBe(false);
    panes.activate(pane.id);
    expect(panes.snapshot().active).toBe(layout.panes[0]!.id);
    // Another explorable shows in the same pane.
    panes.openExplorableBeside('quadratic.other');
    expect(panes.snapshot().panes).toHaveLength(2);
    expect(panes.snapshot().panes[1]!.explorable).toEqual({ id: 'quadratic.other' });
    const kept = readPanes(storage, 'visual-anything.panes.p', project.views);
    expect(kept?.layout.panes[1]?.explorable).toEqual({ id: 'quadratic.other' });
    // Showing a view in it makes it a view's pane again.
    panes.setView(pane.id, 'v2');
    expect(panes.snapshot().panes[1]).toEqual({ id: pane.id, view: 'v2', width: 0.5 });
  });

  it('is read strictly from the tab’s storage', () => {
    const storage = new MemoryStorage();
    const kept = (explorable: unknown, view?: string) =>
      JSON.stringify({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 0.5 },
          { id: 'pane-2', width: 0.5, explorable, ...(view ? { view } : {}) },
        ],
      });
    for (const bad of [{ id: '' }, { id: 'e', extra: 1 }, 'e', { id: 'e', element: 3 }]) {
      storage.setItem('k', kept(bad));
      expect(readPanes(storage, 'k')).toBeUndefined();
    }
    storage.setItem('k', kept({ id: 'e' }, 'v1'));
    expect(readPanes(storage, 'k')).toBeUndefined();
    storage.setItem('k', kept({ id: 'e', element: 'x' }));
    expect(readPanes(storage, 'k')?.layout.panes[1]?.explorable).toEqual({ id: 'e', element: 'x' });
  });
});
