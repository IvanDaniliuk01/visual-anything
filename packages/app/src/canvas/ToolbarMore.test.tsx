/**
 * The canvas toolbar keeps one row (W26): when its row wraps, its groups go under More, which the
 * keyboard reaches, and the find field opens below wherever the toolbar ends. jsdom lays nothing out,
 * so these tests say where each item of the row sits.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { CanvasToolbar } from './CanvasToolbar';
import type { StackingAction, StackingMove } from './stacking';
import { TOOLBAR_BOTTOM } from './ToolbarMore';

const project = loadSample();

const ENABLED: StackingAction = { enabled: true, description: 'Bring it.' };
const STACKING: Record<StackingMove, StackingAction> = {
  front: ENABLED,
  forward: ENABLED,
  backward: ENABLED,
  back: ENABLED,
};

/**
 * Lays the toolbar out as a browser would at a given width: its items side by side, of the widths
 * given by their kind, wrapping onto a new line past the toolbar's width.
 */
function layOut(toolbarWidth: number) {
  const widthOf = (element: Element): number => {
    if (element.matches('.canvas-toolbar-spacer, .explore-strip')) return 0;
    if (element.matches('.canvas-toolbar-add')) return 140;
    if (element.matches('.canvas-toolbar-stacking')) return 150;
    if (element.matches('.canvas-toolbar-grid')) return 110;
    if (element.matches('.canvas-toolbar-more')) return 70;
    return 50;
  };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const toolbar = this.parentElement?.closest('.canvas-toolbar');
    if (this.matches('.canvas-toolbar')) {
      const rows = Math.ceil(
        [...this.children].reduce((sum, child) => sum + widthOf(child), 0) / toolbarWidth,
      );
      return new DOMRect(0, 10, toolbarWidth, 30 * Math.max(rows, 1));
    }
    if (this.matches('.canvas-area')) return new DOMRect(0, 0, 1000, 800);
    if (toolbar === null || toolbar === undefined || this.parentElement !== toolbar) {
      return new DOMRect(0, 0, 0, 0);
    }
    let x = 0;
    let line = 0;
    for (const child of toolbar.children) {
      const width = widthOf(child);
      if (x + width > toolbarWidth && x > 0) {
        line += 1;
        x = 0;
      }
      if (child === this) return new DOMRect(x, 10 + line * 30, width, 28);
      x += width;
    }
    return new DOMRect(0, 0, 0, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function toolbar(props: Partial<ComponentProps<typeof CanvasToolbar>> = {}) {
  const onAddNote = vi.fn();
  const onGrid = vi.fn();
  render(
    <main className="canvas-area">
      <CanvasToolbar
        project={project}
        editable
        scale={1}
        onAdd={() => {}}
        onAddNote={onAddNote}
        onAddArrow={() => {}}
        onZoom={() => {}}
        onFit={() => {}}
        stacking={STACKING}
        layout={{
          label: 'Layout',
          title: 'Lay out the view',
          enabled: true,
          busy: false,
          run: () => {},
        }}
        grid={{ grid: true, snapToGrid: true, rulers: false }}
        onGrid={onGrid}
        {...props}
      />
      <button type="button">Elsewhere</button>
    </main>,
  );
  return { onAddNote, onGrid, row: screen.getByRole('toolbar', { name: 'Canvas' }) };
}

describe('the canvas toolbar in a narrow window', () => {
  it('keeps everything in its row when it fits, with no More', () => {
    layOut(2000);
    const { row } = toolbar();
    expect(within(row).queryByRole('button', { name: 'More' })).toBeNull();
    expect(row).not.toHaveAttribute('data-overflow');
    expect(within(row).getByRole('button', { name: 'Note' })).toBeInTheDocument();
  });

  it('puts what does not fit under More, the first groups first, and keeps adding and zooming', () => {
    layOut(700);
    const { row } = toolbar();
    const more = within(row).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveAttribute('data-overflow', 'some');
    const panel = document.getElementById(more.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();
    // The grid and the stacking order went first; adding, the free shapes and zooming stayed.
    expect(
      within(panel as HTMLElement).getByRole('group', { name: 'Grid and rulers', hidden: true }),
    ).toBeTruthy();
    expect(
      within(panel as HTMLElement).getByRole('group', { name: 'Stacking order', hidden: true }),
    ).toBeTruthy();
    expect(within(row).getByRole('combobox')).not.toBe(null);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Note' })).toBeVisible();
  });

  it('opens More with the keyboard, moves through it, and closes it with Escape', () => {
    layOut(300);
    const { row, onAddNote } = toolbar();
    expect(row).toHaveAttribute('data-overflow', 'all');
    const more = within(row).getByRole('button', { name: 'More' });
    more.focus();
    fireEvent.keyDown(more, { key: 'ArrowDown' });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'More of the canvas toolbar' });
    expect(panel).toBeVisible();
    // Its groups in the toolbar's own order, the free shapes first.
    const note = within(panel).getByRole('button', { name: 'Note' });
    expect(note).toHaveFocus();
    expect(
      within(panel)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(['Note', 'Arrow', 'Layout', 'Fit']));
    fireEvent.click(note);
    expect(onAddNote).toHaveBeenCalled();

    const grid = within(panel).getByRole('button', { name: 'Grid' });
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
    expect(panel).not.toBeVisible();
  });

  it('closes More on a press outside it', () => {
    layOut(300);
    const { row } = toolbar();
    const more = within(row).getByRole('button', { name: 'More' });
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the shortcuts and states of what is under More', () => {
    layOut(300);
    const { row, onGrid } = toolbar();
    fireEvent.click(within(row).getByRole('button', { name: 'More' }));
    const grid = screen.getByRole('button', { name: 'Grid' });
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(grid).toHaveAttribute('aria-keyshortcuts', 'Shift+G');
    fireEvent.click(grid);
    expect(onGrid).toHaveBeenLastCalledWith({ grid: false });
  });

  it('says where it ends, so that the find field opens below it', () => {
    layOut(2000);
    toolbar();
    const area = document.querySelector<HTMLElement>('.canvas-area');
    expect(area?.style.getPropertyValue(TOOLBAR_BOTTOM)).toBe('40px');
  });

  it('brings groups back from under More when the row gets wider', () => {
    let width = 300;
    layOut(width);
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    const { row } = toolbar();
    expect(row).toHaveAttribute('data-overflow', 'all');
    width = 2000;
    layOut(width);
    for (let tries = 0; tries < 10; tries++) {
      act(() => {
        for (const callback of observers) callback([], {} as ResizeObserver);
      });
    }
    expect(row).not.toHaveAttribute('data-overflow');
    expect(within(row).queryByRole('button', { name: 'More' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Note' })).toBeVisible();
  });
});
