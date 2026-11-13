/**
 * An explorable live in place (ADR 0107, as the user changed Q11 on 2026-11-12): shown while live and
 * on screen; kept hidden, not removed, off screen; turned still or paused on screen, it first takes a
 * still of itself as it was left, unseen, and then hides; let go by the tab, it takes that still if
 * it has none yet, and goes. Escape in it and its close button turn it still.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplorableViewProps, LiveFrameHandle } from '../../explorables/ExplorableView';
import { LiveExplorable, type LiveExplorableProps } from './LiveExplorable';

/** The frame the stand-in view hands its owner, and what the view was last given. */
const view: { props?: ExplorableViewProps; takes: number[] } = { takes: [] };
/** Its spot, 320 units wide at scale 1, takes its still at the 512 bucket. */
const STILL = { png: new Uint8Array([1, 2, 3]), width: 512, height: 384 };

vi.mock('../../explorables/ExplorableView', async () => {
  const { useEffect } = await import('react');
  return {
    ExplorableView: (props: ExplorableViewProps) => {
      view.props = props;
      useEffect(() => {
        const handle: LiveFrameHandle = {
          takeStill: (width) => {
            view.takes.push(width);
            return Promise.resolve(STILL);
          },
        };
        props.frameRef?.(handle);
        return () => props.frameRef?.(undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as a frame is made once
      }, []);
      return <div data-testid="frame" />;
    },
  };
});

afterEach(() => {
  cleanup();
  view.props = undefined;
  view.takes = [];
});

function shown(given: Partial<LiveExplorableProps> = {}) {
  const calls = {
    onStill: vi.fn(),
    onUse: vi.fn(),
    onLeft: vi.fn(),
    onGone: vi.fn(),
    onSelect: vi.fn(),
  };
  const props: LiveExplorableProps = {
    target: { spot: 'the-parabola', explorable: 'quadratic.parabola' },
    project: {} as ProjectSnapshot,
    rect: { x: 0, y: 0, width: 320, height: 240 },
    live: true,
    onScreen: true,
    camera: () => undefined,
    subscribe: () => () => undefined,
    ...calls,
    ...given,
  };
  const { container, rerender } = render(<LiveExplorable {...props} />);
  const box = () => container.querySelector('.canvas-live-explorable') as HTMLElement;
  const update = (more: Partial<LiveExplorableProps>) =>
    act(async () => {
      Object.assign(props, more);
      rerender(<LiveExplorable {...props} />);
      for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
    });
  return { box, update, calls };
}

const hidden = (box: HTMLElement) => box.classList.contains('canvas-live-explorable-hidden');

describe('an explorable live in place', () => {
  it('shows while live on screen, and is kept hidden, with its frame, while off screen', async () => {
    const { box, update, calls } = shown();
    expect(hidden(box())).toBe(false);
    expect(box().getAttribute('aria-hidden')).toBeNull();
    expect(view.props?.hidden).toBe(false);
    // The frame's va.select, which its host checked, reaches the canvas's selection.
    view.props?.onSelect?.('quadratic-function');
    expect(calls.onSelect).toHaveBeenCalledWith('quadratic-function');
    await update({ onScreen: false });
    expect(hidden(box())).toBe(true);
    expect(box().getAttribute('aria-hidden')).toBe('true');
    expect(view.props?.hidden).toBe(true);
    expect(screen.getByTestId('frame')).toBeTruthy();
    // Leaving the screen is no leaving: no still of it as it was left.
    expect(view.takes).toEqual([]);
    expect(calls.onLeft).not.toHaveBeenCalled();
    await update({ onScreen: true });
    expect(hidden(box())).toBe(false);
  });

  it('turned still on screen, it takes a still of itself as it was left, then hides', async () => {
    const { box, update, calls } = shown();
    await update({ live: false });
    expect(view.takes).toEqual([512]);
    expect(calls.onLeft).toHaveBeenCalledWith(STILL);
    expect(hidden(box())).toBe(true);
    expect(box().classList.contains('canvas-live-explorable-taking')).toBe(false);
    // Explored again, it shows as it was.
    await update({ live: true });
    expect(hidden(box())).toBe(false);
  });

  it('let go by the tab, it takes its still only when it has none yet, and goes', async () => {
    const first = shown({ onScreen: false });
    await act(async () => {
      view.props?.onLetGo?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.takes).toEqual([512]);
    expect(first.calls.onGone).toHaveBeenCalledTimes(1);
    cleanup();
    view.takes = [];

    const second = shown();
    await second.update({ live: false });
    expect(view.takes).toEqual([512]);
    await act(async () => {
      view.props?.onLetGo?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(view.takes).toEqual([512]);
    expect(second.calls.onGone).toHaveBeenCalledTimes(1);
  });

  it('turns still with Escape in it, or with its close button', () => {
    const { box, calls } = shown();
    fireEvent.keyDown(box(), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Show its still again (Escape)' }));
    expect(calls.onStill).toHaveBeenCalledTimes(2);
  });
});
