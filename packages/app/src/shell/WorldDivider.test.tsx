import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorldDivider } from './WorldDivider';
import { MIN_WORLD_HEIGHT, WORLD_HEIGHT_KEY, useWorldHeight } from './worldHeight';

/** The Model tab in brief: 600 pixels high, World's section, then the divider. */
function Harness() {
  const tab = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLElement>(null);
  const { height, setHeight, maxHeight } = useWorldHeight(tab);
  return (
    <div
      ref={(element) => {
        tab.current = element;
        if (element) Object.defineProperty(element, 'clientHeight', { value: 600 });
      }}
    >
      <section
        ref={(element) => {
          world.current = element;
          if (element) element.getBoundingClientRect = () => ({ height: 150 }) as DOMRect;
        }}
        id="world"
        data-testid="world"
        style={height === undefined ? {} : { height }}
      />
      <WorldDivider
        world={world}
        controls="world"
        height={height}
        setHeight={setHeight}
        maxHeight={maxHeight}
      />
    </div>
  );
}

const divider = () => screen.getByRole('separator', { name: 'Height of World' });

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('WorldDivider', () => {
  it('starts at World’s own height, and says so', () => {
    render(<Harness />);
    expect(divider()).toHaveAttribute('aria-valuenow', '150');
    expect(divider()).toHaveAttribute('aria-valuetext', 'Its own height, 150 pixels');
    expect(divider()).toHaveAttribute('aria-controls', 'world');
    expect(screen.getByTestId('world').style.height).toBe('');
  });

  it('moves with the arrow keys, further with Shift, within the room the tab leaves', () => {
    render(<Harness />);
    fireEvent.keyDown(divider(), { key: 'ArrowDown' });
    expect(screen.getByTestId('world').style.height).toBe('166px');
    fireEvent.keyDown(divider(), { key: 'ArrowDown', shiftKey: true });
    expect(screen.getByTestId('world').style.height).toBe('230px');
    fireEvent.keyDown(divider(), { key: 'End' });
    expect(divider()).toHaveAttribute('aria-valuenow', '504');
    fireEvent.keyDown(divider(), { key: 'Home' });
    expect(divider()).toHaveAttribute('aria-valuenow', String(MIN_WORLD_HEIGHT));
    fireEvent.keyDown(divider(), { key: 'ArrowUp' });
    expect(divider()).toHaveAttribute('aria-valuenow', String(MIN_WORLD_HEIGHT));
  });

  it('follows a drag from where it started, without drifting past a limit', () => {
    render(<Harness />);
    const at = (type: string, y: number) =>
      fireEvent(
        divider(),
        Object.assign(new MouseEvent(type, { bubbles: true, clientY: y, button: 0 }), {
          pointerId: 1,
        }),
      );
    at('pointerdown', 300);
    at('pointermove', 400);
    expect(divider()).toHaveAttribute('aria-valuenow', '250');
    at('pointermove', 2000);
    expect(divider()).toHaveAttribute('aria-valuenow', '504');
    at('pointermove', 350);
    expect(divider()).toHaveAttribute('aria-valuenow', '200');
    at('pointerup', 350);
    at('pointermove', 500);
    expect(divider()).toHaveAttribute('aria-valuenow', '200');
  });

  it('keeps the height in the browser, and gives World its own again on double-click or Enter', () => {
    const { unmount } = render(<Harness />);
    fireEvent.keyDown(divider(), { key: 'ArrowDown' });
    expect(localStorage.getItem(WORLD_HEIGHT_KEY)).toBe('166');
    unmount();
    render(<Harness />);
    expect(screen.getByTestId('world').style.height).toBe('166px');
    fireEvent.doubleClick(divider());
    expect(screen.getByTestId('world').style.height).toBe('');
    expect(localStorage.getItem(WORLD_HEIGHT_KEY)).toBeNull();
    fireEvent.keyDown(divider(), { key: 'ArrowDown' });
    fireEvent.keyDown(divider(), { key: 'Enter' });
    expect(localStorage.getItem(WORLD_HEIGHT_KEY)).toBeNull();
  });

  it('ignores a stored height it cannot use', () => {
    localStorage.setItem(WORLD_HEIGHT_KEY, 'tall');
    render(<Harness />);
    expect(screen.getByTestId('world').style.height).toBe('');
  });
});
