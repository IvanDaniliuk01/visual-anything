/**
 * Claude's `turn` guidance on the canvas (ADR 0075): the shape it turns, the target's own when it
 * shows a solid or its drawing's when the target is an anchored part, and the request applied once,
 * in its view, in the tab the person used last, selecting that shape and turning it from the camera
 * asked for. Nothing is recorded.
 */
import { renderHook } from '@testing-library/react';
import type { SolidCamera } from '@visual-anything/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedTurnRequest } from '../../guidance/state';
import { setTabUseForTests, trackTabUse, type TabUse } from '../../guidance/tabs';
import { withSolids } from '../../test/solids';
import { indexScene } from '../hit';
import { buildScene } from '../scene';
import { guidedTurnKey, useGuidedTurn, type GuidedTurning } from './guidedTurn';

const project = withSolids('robot');
const indexed = indexScene(buildScene(project, 'robot'));
const CAMERA: SolidCamera = { azimuth: -60, elevation: 35 };

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

function canvas(turns = true) {
  const turned: { key: string; camera: SolidCamera | undefined }[] = [];
  const revealed: string[] = [];
  const turning: GuidedTurning = {
    turn: vi.fn((key: string, camera?: SolidCamera) => {
      turned.push({ key, camera });
      return turns;
    }),
    reveal: vi.fn((key: string) => revealed.push(key)),
  };
  return { turning, turned, revealed };
}

const request = (more: Partial<GuidedTurnRequest> = {}): GuidedTurnRequest => ({
  target: 'arm',
  camera: CAMERA,
  request: 1,
  ...more,
});

describe('the shape Claude’s turn guidance turns', () => {
  it('is the target’s own shape when it shows a solid', () => {
    expect(guidedTurnKey(indexed, 'arm')).toBe('arm');
    expect(guidedTurnKey(indexed, 'motor')).toBe('motor');
    // A part drawn on its own shows its solid's picture of it alone.
    expect(guidedTurnKey(indexed, 'loose')).toBe('loose');
  });

  it('is the drawing for a part anchored in it, which turns with its drawing', () => {
    expect(guidedTurnKey(indexed, 'base')).toBe('arm');
    expect(guidedTurnKey(indexed, 'gripper')).toBe('arm');
  });

  it('is none for an element no shape of which shows a solid, or that the view does not draw', () => {
    expect(guidedTurnKey(indexed, 'extra')).toBeUndefined();
    expect(guidedTurnKey(indexed, 'nobody')).toBeUndefined();
  });
});

describe('Claude’s turn guidance on the canvas', () => {
  it('reveals and turns the target’s shape from the camera asked for, once a request', () => {
    const { turning, turned, revealed } = canvas();
    const { rerender } = renderHook(
      ({ asked }: { asked: GuidedTurnRequest | undefined }) =>
        useGuidedTurn(asked, project, 'robot', indexed, () => turning),
      { initialProps: { asked: request() } },
    );
    expect(revealed).toEqual(['arm']);
    expect(turned).toEqual([{ key: 'arm', camera: CAMERA }]);
    // The same request again, as after another render, does nothing more.
    rerender({ asked: request() });
    expect(turned).toHaveLength(1);
    // A new request turns again, here a part's drawing.
    rerender({ asked: request({ target: 'base', request: 2 }) });
    expect(turned.at(-1)).toEqual({ key: 'arm', camera: CAMERA });
    expect(turned).toHaveLength(2);
  });

  it('waits for the view it names to open, and passes over one the project lacks', () => {
    const { turning, turned } = canvas();
    const { rerender } = renderHook(
      ({ view, asked }: { view: string; asked: GuidedTurnRequest }) =>
        useGuidedTurn(asked, project, view, indexed, () => turning),
      { initialProps: { view: 'elsewhere', asked: request({ view: 'robot' }) } },
    );
    expect(turned).toEqual([]);
    rerender({ view: 'robot', asked: request({ view: 'robot' }) });
    expect(turned).toEqual([{ key: 'arm', camera: CAMERA }]);
    rerender({ view: 'robot', asked: request({ view: 'gone', request: 2 }) });
    expect(turned).toHaveLength(1);
  });

  it('waits for the canvas, and turns nothing in a tab the person did not use last for another view', () => {
    const { turning, turned } = canvas();
    let ready: GuidedTurning | undefined;
    const { rerender } = renderHook(
      ({ asked }: { asked: GuidedTurnRequest }) =>
        useGuidedTurn(asked, project, 'robot', indexed, () => ready),
      { initialProps: { asked: request() } },
    );
    expect(turned).toEqual([]);
    ready = turning;
    rerender({ asked: request() });
    expect(turned).toHaveLength(1);

    const elsewhere: TabUse = { used: () => undefined, isLastUsed: () => false, dispose: () => {} };
    setTabUseForTests(elsewhere);
    rerender({ asked: request({ view: 'other', request: 3 }) });
    expect(turned).toHaveLength(1);
  });

  it('turns nothing for a target that shows no solid', () => {
    const { turning, turned, revealed } = canvas();
    renderHook(() =>
      useGuidedTurn(request({ target: 'extra' }), project, 'robot', indexed, () => turning),
    );
    expect(turned).toEqual([]);
    expect(revealed).toEqual([]);
  });
});
