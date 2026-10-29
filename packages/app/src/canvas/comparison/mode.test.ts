import { compareProjects, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { comparedSample, done, VIEW } from '../../test/comparison';
import { ComparisonStore } from './mode';

const sorted = (project: ReturnType<typeof compareProjects>) => ({
  ...project,
  changes: [...project.changes].sort((a, b) =>
    JSON.stringify(a.ref) < JSON.stringify(b.ref) ? -1 : 1,
  ),
});

describe('the comparison mode', () => {
  const { older, newer, comparison } = comparedSample();

  it('shows one comparison at a time, and tells whoever showed it when it ends', () => {
    const store = new ComparisonStore();
    const ended = vi.fn();
    const first = store.showComparison({ older, newer, comparison, title: 'A', onEnd: ended });
    expect(store.get()?.drawing).toBe('comparison');
    expect(store.get()?.faint).toBe(true);
    const second = store.showComparison({ older, newer, comparison, title: 'B' });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(first.showing).toBe(false);
    // The first handle changes nothing any more.
    first.update({ title: 'C' });
    first.end();
    expect(store.get()?.title).toBe('B');
    second.end();
    expect(store.get()).toBeUndefined();
    expect(second.showing).toBe(false);
  });

  it('switches its drawing and the faint drawing of what is unchanged', () => {
    const store = new ComparisonStore();
    store.showComparison({ older, newer, comparison, title: 'A', drawing: 'before' });
    store.setDrawing('after');
    store.setFaint(false);
    expect(store.get()).toMatchObject({ drawing: 'after', faint: false });
  });

  it('follows every action with recompare, as comparing afresh would', () => {
    const store = new ComparisonStore();
    store.showComparison({ older, newer, comparison, title: 'A' });
    const commands: Command[] = [
      { type: 'update-element', id: 'booking-agent', changes: { name: 'Agent' } },
      { type: 'delete', elements: ['sms'] },
      { type: 'update-element', id: 'whatsapp', changes: { name: 'WhatsApp channel' } },
      {
        type: 'set-positions',
        view: VIEW,
        positions: [{ element: 'patient', x: 40, y: 200, pinned: true }],
      },
    ];
    let project: ProjectSnapshot = newer;
    for (const command of commands) {
      project = done(project, command);
      store.follow(project);
      expect(store.get()?.newer).toBe(project);
      expect(sorted(store.get()?.comparison ?? comparison)).toEqual(
        sorted(compareProjects(older, project)),
      );
    }
  });

  it('keeps a comparison that does not follow as it was', () => {
    const store = new ComparisonStore();
    store.showComparison({ older, newer, comparison, title: 'A', follows: false });
    store.follow(done(newer, { type: 'delete', elements: ['sms'] }));
    expect(store.get()?.newer).toBe(newer);
  });
});
