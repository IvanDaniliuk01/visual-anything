/**
 * The physical-space panel in the shell (ADR 0076): Alt+Shift+P opens it beside the canvas, after
 * the canvas area and before the inspector, on what the open view puts in physical space, and marks
 * the shell so that its column takes the panel's width; with nothing posed, it shows the first
 * element that shows a solid.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Shell } from '../shell/Shell';
import { workcell } from '../test/space';
import { SPACE_PANEL_OPEN, SPACE_PANEL_WIDTH } from './store';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const pressSpaceKey = () =>
  act(() => {
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', altKey: true, shiftKey: true });
  });

describe('the physical-space panel in the shell', () => {
  it('opens beside the canvas with Alt+Shift+P, and closes again', () => {
    const { container } = render(<Shell project={workcell()} />);
    const shell = container.querySelector<HTMLElement>('.shell');
    expect(shell?.hasAttribute(SPACE_PANEL_OPEN)).toBe(false);
    expect(shell?.style.getPropertyValue(SPACE_PANEL_WIDTH)).toBe('480px');
    pressSpaceKey();
    const panel = screen.getByRole('region', { name: 'Physical space' });
    expect(panel).toHaveTextContent('Shows “World”');
    expect(shell?.hasAttribute(SPACE_PANEL_OPEN)).toBe(true);
    // Between the canvas area and the inspector's edge, in the shell's own order.
    const children = [...(shell?.children ?? [])];
    const main = children.indexOf(screen.getByRole('main'));
    const inspector = children.indexOf(screen.getByRole('complementary', { name: 'Inspector' }));
    expect(children.indexOf(panel)).toBeGreaterThan(main);
    expect(children.indexOf(panel)).toBeLessThan(inspector);
    pressSpaceKey();
    expect(screen.queryByRole('region', { name: 'Physical space' })).toBeNull();
    expect(shell?.hasAttribute(SPACE_PANEL_OPEN)).toBe(false);
  });

  it('shows the first element that shows a solid when nothing the view shows is posed', () => {
    render(<Shell project={workcell({ posed: false })} />);
    pressSpaceKey();
    expect(screen.getByRole('region', { name: 'Physical space' })).toHaveTextContent('Shows “Arm”');
  });
});
