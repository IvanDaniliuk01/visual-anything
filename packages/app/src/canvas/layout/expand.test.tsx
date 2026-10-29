/** Expanding in place, by hand and by zoom, and the camera that follows (ADR 0080, section 4). */
import { positionKey, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { act, renderHook, waitFor } from '@testing-library/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION } from '../../editor/selection';
import { loadDataModel } from '../../test/dataModel';
import { buildScene } from '../scene';
import type { LayoutRunner } from './client';
import { layOut } from './engine';
import { cameraToShow, inPlaceFor, showInPlace, useExpandedInPlace } from './expand';
import { LayoutRunnerContext, useLayout } from './useLayout';

const elk = new ELK();
const ELK_WAIT = { timeout: 15_000 };
const project = loadDataModel();
const overview = project.views.find((view) => view.id === 'overview');

function inThread(): LayoutRunner {
  return { layOut: (input) => layOut(input, elk), dispose: () => {} };
}

function withRunner(runner: LayoutRunner | undefined) {
  return ({ children }: { children: ReactNode }) => (
    <LayoutRunnerContext.Provider value={runner}>{children}</LayoutRunnerContext.Provider>
  );
}

describe('expanding by hand', () => {
  it('is one action: set-collapsed and the places it gave, under the expansion’s label', async () => {
    if (!overview) throw new Error('No overview.');
    const sent: Command[] = [];
    const send = vi.fn((command: Command) => {
      sent.push(command);
      return Promise.resolve({ ok: true });
    });
    const { result } = renderHook(
      () =>
        useLayout({
          project,
          view: overview,
          scene: buildScene(project, overview.id),
          selection: EMPTY_SELECTION,
          send,
          announce: () => {},
        }),
      { wrapper: withRunner(inThread()) },
    );
    let done = false;
    await act(async () => {
      done = await result.current.expand(['schema-c'], 'Expand "schema_c"');
    });
    expect(done).toBe(true);
    const [command] = sent;
    expect(command?.type).toBe('batch');
    if (command?.type !== 'batch') return;
    expect(command.label).toBe('Expand "schema_c"');
    expect(command.commands.map((each) => each.type)).toEqual(['set-collapsed', 'set-positions']);
    expect(command.commands[0]).toMatchObject({ elements: ['schema-c'], collapsed: false });
  }, 30_000);

  it('expands as before, where it is, without a layout worker', async () => {
    if (!overview) throw new Error('No overview.');
    const sent: Command[] = [];
    const { result } = renderHook(
      () =>
        useLayout({
          project,
          view: overview,
          scene: buildScene(project, overview.id),
          selection: EMPTY_SELECTION,
          send: (command) => {
            sent.push(command);
            return Promise.resolve({ ok: true });
          },
          announce: () => {},
        }),
      { wrapper: withRunner(undefined) },
    );
    await act(async () => {
      await result.current.expand(['schema-c'], 'Expand "schema_c"');
    });
    expect(sent).toEqual([
      { type: 'set-collapsed', view: 'overview', elements: ['schema-c'], collapsed: false },
    ]);
  });

  it('is what the outline and the inspector use while a canvas shows the view', () => {
    const inPlace = { expand: () => Promise.resolve(true), collapse: () => Promise.resolve(true) };
    const stop = showInPlace('overview', inPlace);
    expect(inPlaceFor('overview')).toBe(inPlace);
    expect(inPlaceFor('another')).toBeUndefined();
    stop();
    expect(inPlaceFor('overview')).toBeUndefined();
  });
});

describe('expanding by zoom', () => {
  const zoomed: ReadonlySet<Id> = new Set(['schema-c']);

  it('shows the container once its places come, and draws what it moved aside there, storing nothing', async () => {
    if (!overview) throw new Error('No overview.');
    const { result } = renderHook(() => useExpandedInPlace(project, overview, zoomed), {
      wrapper: withRunner(inThread()),
    });
    // Until its places are worked out, it shows as it was.
    expect(result.current.expanded.size).toBe(0);
    await waitFor(() => expect(result.current.expanded.has('schema-c')).toBe(true), ELK_WAIT);
    const drawn = result.current.project.views.find((view) => view.id === 'overview');
    const stored = new Map(overview.positions.map((each) => [positionKey(each), each]));
    const changed = (drawn?.positions ?? []).filter((each) => {
      const was = stored.get(positionKey(each));
      return !was || was.x !== each.x || was.y !== each.y;
    });
    expect(changed.length).toBeGreaterThan(0);
    // The project itself is as it was: nothing is stored.
    expect(project.views.find((view) => view.id === 'overview')).toBe(overview);
    // Pinned shapes keep their places.
    for (const each of drawn?.positions ?? []) {
      const was = stored.get(positionKey(each));
      if (was?.pinned) expect([each.x, each.y]).toEqual([was.x, was.y]);
    }
  });

  it('shows the container at once, where it is, without a layout worker', () => {
    if (!overview) throw new Error('No overview.');
    const { result } = renderHook(() => useExpandedInPlace(project, overview, zoomed), {
      wrapper: withRunner(undefined),
    });
    expect(result.current.expanded).toBe(zoomed);
    expect(result.current.project).toBe(project);
  });

  it('draws a moved place no longer once the shape was moved since', async () => {
    if (!overview) throw new Error('No overview.');
    const { result, rerender } = renderHook(
      ({ now }: { now: ProjectSnapshot }) =>
        useExpandedInPlace(
          now,
          now.views.find((view) => view.id === 'overview'),
          zoomed,
        ),
      { wrapper: withRunner(inThread()), initialProps: { now: project } },
    );
    await waitFor(() => expect(result.current.expanded.has('schema-c')).toBe(true), ELK_WAIT);
    const drawn = result.current.project.views.find((view) => view.id === 'overview');
    const stored = new Map(overview.positions.map((each) => [positionKey(each), each]));
    const aside = (drawn?.positions ?? []).find((each) => {
      const was = stored.get(positionKey(each));
      return was && (was.x !== each.x || was.y !== each.y);
    });
    if (!aside) throw new Error('Nothing moved aside.');
    // The person drags it elsewhere meanwhile: its stored place now shows.
    const dragged = {
      ...project,
      views: project.views.map((view) =>
        view === overview
          ? {
              ...view,
              positions: view.positions.map((each) =>
                positionKey(each) === positionKey(aside) ? { ...each, x: each.x + 8 } : each,
              ),
            }
          : view,
      ),
    };
    rerender({ now: dragged });
    const now = result.current.project.views
      .find((view) => view.id === 'overview')
      ?.positions.find((each) => positionKey(each) === positionKey(aside));
    expect(now?.x).toBe((stored.get(positionKey(aside))?.x ?? 0) + 8);
  });
});

describe('cameraToShow', () => {
  const viewport = { width: 1000, height: 600 };
  const camera = { scale: 1, x: 0, y: 0 };

  it('moves nothing while the box shows whole, 48 pixels inside', () => {
    expect(cameraToShow(camera, viewport, { x: 100, y: 100, width: 200, height: 100 })).toBe(
      undefined,
    );
  });

  it('pans by the least that brings in a box that fits but sticks out', () => {
    expect(cameraToShow(camera, viewport, { x: 900, y: 100, width: 200, height: 100 })).toEqual({
      scale: 1,
      x: -148,
      y: 0,
    });
  });

  it('shows whole a box that no longer fits, with 48 pixels around it', () => {
    const rect = { x: 0, y: 0, width: 2000, height: 600 };
    const shown = cameraToShow(camera, viewport, rect);
    expect(shown?.scale).toBeLessThan(1);
    const left = rect.x * (shown?.scale ?? 1) + (shown?.x ?? 0);
    const right = (rect.x + rect.width) * (shown?.scale ?? 1) + (shown?.x ?? 0);
    expect(left).toBeGreaterThanOrEqual(47.5);
    expect(right).toBeLessThanOrEqual(viewport.width - 47.5);
  });
});
