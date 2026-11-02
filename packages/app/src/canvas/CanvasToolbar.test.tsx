import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { readSource } from '../theme/testing';
import { CanvasToolbar, ComponentSelect } from './CanvasToolbar';
import type { StackingAction, StackingMove } from './stacking';

const project = loadSample();

function toolbar(props: Partial<ComponentProps<typeof CanvasToolbar>> = {}) {
  const onAdd = vi.fn();
  render(
    <CanvasToolbar
      project={project}
      editable
      scale={1}
      onAdd={onAdd}
      onAddNote={() => {}}
      onAddArrow={() => {}}
      onZoom={() => {}}
      onFit={() => {}}
      {...props}
    />,
  );
  return { onAdd };
}

const STACKING: Record<StackingMove, StackingAction> = {
  front: { enabled: true, description: 'Bring to front, inside "Clinic booking" (Ctrl+Shift+↑)' },
  forward: { enabled: true, description: 'Bring forward, in front of "Scheduling" (Ctrl+↑)' },
  backward: {
    enabled: false,
    description:
      '"WhatsApp channel" is already behind everything it overlaps inside "Clinic booking".',
  },
  back: {
    enabled: false,
    description:
      '"WhatsApp channel" is already behind everything it overlaps inside "Clinic booking".',
  },
};

describe('CanvasToolbar', () => {
  it('toggles the grid, snapping and the rulers, pressed as the preferences say', () => {
    const onGrid = vi.fn();
    toolbar({ grid: { grid: false, snapToGrid: true, rulers: true }, onGrid });
    const group = screen.getByRole('group', { name: 'Grid and rulers' });
    const grid = within(group).getByRole('button', { name: 'Grid' });
    const snapping = within(group).getByRole('button', { name: 'Snap to grid' });
    const rulers = within(group).getByRole('button', { name: 'Rulers' });
    expect(grid).toHaveAttribute('aria-pressed', 'false');
    expect(grid).toHaveAttribute('title', 'Show the grid (Shift+G)');
    expect(grid).toHaveAttribute('aria-keyshortcuts', 'Shift+G');
    // Snapping waits for the grid to show.
    expect(snapping).toBeDisabled();
    expect(snapping).toHaveAttribute('aria-pressed', 'true');
    expect(rulers).toHaveAttribute('aria-pressed', 'true');
    expect(rulers).toHaveAttribute('title', 'Show the rulers (Shift+R)');
    fireEvent.click(grid);
    expect(onGrid).toHaveBeenLastCalledWith({ grid: true });
    fireEvent.click(rulers);
    expect(onGrid).toHaveBeenLastCalledWith({ rulers: false });
  });

  it('lets snapping be turned off once the grid shows', () => {
    const onGrid = vi.fn();
    toolbar({ grid: { grid: true, snapToGrid: true, rulers: false }, onGrid });
    const snapping = screen.getByRole('button', { name: 'Snap to grid' });
    expect(snapping).toBeEnabled();
    expect(snapping).toHaveAttribute('title', 'Snap shapes to the grid; hold Alt to place freely');
    fireEvent.click(snapping);
    expect(onGrid).toHaveBeenLastCalledWith({ snapToGrid: false });
  });

  it('renders as before without the new props', () => {
    toolbar();
    const select = screen.getByRole('combobox', { name: 'Add an element' });
    expect(select).toHaveAttribute(
      'title',
      'With nothing selected, elements are added directly in World.',
    );
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Add element…');
    expect(screen.queryByRole('group', { name: 'Stacking order' })).not.toBeInTheDocument();
  });

  it('says where an element is added', () => {
    toolbar({
      addPlace: {
        option: 'Add inside "Clinic booking"…',
        label: 'Add an element inside "Clinic booking"',
        title: 'Adds the element inside "Clinic booking", where "WhatsApp channel" sits.',
      },
    });
    const select = screen.getByRole('combobox', { name: 'Add an element inside "Clinic booking"' });
    expect(select).toHaveAttribute(
      'title',
      'Adds the element inside "Clinic booking", where "WhatsApp channel" sits.',
    );
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent(
      'Add inside "Clinic booking"…',
    );
  });

  it('has the four stacking buttons after Arrow, off with their reason when they would change nothing', () => {
    const onRestack = vi.fn();
    toolbar({ stacking: STACKING, onRestack });
    const group = screen.getByRole('group', { name: 'Stacking order' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Bring to front',
      'Bring forward',
      'Send backward',
      'Send to back',
    ]);
    const arrow = screen.getByRole('button', { name: 'Arrow' });
    expect(arrow.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const forward = within(group).getByRole('button', { name: 'Bring forward' });
    expect(forward).toHaveAttribute('title', 'Bring forward, in front of "Scheduling" (Ctrl+↑)');
    expect(forward).toHaveAttribute(
      'aria-keyshortcuts',
      expect.stringContaining('Control+ArrowUp'),
    );
    expect(forward).not.toHaveAttribute('aria-disabled');
    expect(forward.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    const backward = within(group).getByRole('button', { name: 'Send backward' });
    expect(backward).toHaveAttribute('aria-disabled', 'true');
    expect(backward).toBeEnabled();
    expect(backward).toHaveAttribute('title', STACKING.backward.description);

    fireEvent.click(forward);
    fireEvent.click(backward);
    expect(onRestack.mock.calls).toEqual([['forward'], ['backward']]);
  });

  it('adds an element when one is picked from the open list', () => {
    const { onAdd } = toolbar();
    const select = screen.getByRole('combobox', { name: 'Add an element' });
    fireEvent.change(select, { target: { value: 'systems.service' } });
    expect(onAdd).toHaveBeenCalledWith('systems.service');
    expect(select).toHaveValue('');
  });

  it('adds nothing while the arrow keys go through a closed list, until Enter', () => {
    const { onAdd } = toolbar();
    const select = screen.getByRole('combobox', { name: 'Add an element' });
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.change(select, { target: { value: 'systems.box' } });
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.change(select, { target: { value: 'systems.system' } });
    expect(onAdd).not.toHaveBeenCalled();
    expect(select).toHaveValue('systems.system');
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('systems.system');
    expect(select).toHaveValue('');
  });

  it('adds nothing when it loses the focus or on Escape, which end where the next element goes', () => {
    const onAddLeave = vi.fn();
    const { onAdd } = toolbar({ onAddLeave });
    const select = screen.getByRole('combobox', { name: 'Add an element' });
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.change(select, { target: { value: 'systems.box' } });
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(select).toHaveValue('');
    expect(onAddLeave).toHaveBeenCalledTimes(1);
    fireEvent.blur(select);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onAddLeave).toHaveBeenCalledTimes(2);

    // Adding an element is not a value left behind: leaving the list adds nothing.
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.change(select, { target: { value: 'systems.box' } });
    fireEvent.blur(select);
    expect(onAdd).not.toHaveBeenCalled();
    expect(select).toHaveValue('');
    expect(onAddLeave).toHaveBeenCalledTimes(3);
  });

  it('adds from a select of its own elsewhere by the same rule', () => {
    const onAdd = vi.fn();
    const onLeave = vi.fn();
    render(
      <label>
        Add an element inside "Scheduling"
        <ComponentSelect
          project={project}
          option='Add inside "Scheduling"…'
          disabled={false}
          onAdd={onAdd}
          onLeave={onLeave}
        />
      </label>,
    );
    const select = screen.getByRole('combobox', { name: 'Add an element inside "Scheduling"' });
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Add inside "Scheduling"…');
    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.change(select, { target: { value: 'systems.box' } });
    fireEvent.blur(select);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
    fireEvent.change(select, { target: { value: 'systems.service' } });
    expect(onAdd).toHaveBeenCalledWith('systems.service');
  });

  it('has Layout, which says what it lays out, how far a layout has come, and why it cannot', () => {
    const run = vi.fn();
    const { rerender } = render(
      <CanvasToolbar
        project={project}
        editable
        scale={1}
        onAdd={() => {}}
        onAddNote={() => {}}
        onAddArrow={() => {}}
        onZoom={() => {}}
        onFit={() => {}}
        layout={{
          label: 'Layout',
          title: 'Lay out "System overview": arrange every shape that is not pinned.',
          enabled: true,
          busy: false,
          run,
        }}
      />,
    );
    const layout = screen.getByRole('button', { name: 'Layout' });
    expect(layout).toHaveAttribute(
      'title',
      'Lay out "System overview": arrange every shape that is not pinned.',
    );
    expect(layout).not.toHaveAttribute('aria-disabled');
    fireEvent.click(layout);
    expect(run).toHaveBeenCalledTimes(1);

    rerender(
      <CanvasToolbar
        project={project}
        editable
        scale={1}
        onAdd={() => {}}
        onAddNote={() => {}}
        onAddArrow={() => {}}
        onZoom={() => {}}
        onFit={() => {}}
        layout={{
          label: 'Stop layout (40%)',
          title: 'Laying out 500 shapes: 40% done. Press to stop it; nothing moves then.',
          enabled: true,
          busy: true,
          run,
        }}
      />,
    );
    const busy = screen.getByRole('button', { name: 'Stop layout (40%)' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).not.toHaveAttribute('aria-disabled');
    fireEvent.click(busy);
    expect(run).toHaveBeenCalledTimes(2);

    rerender(
      <CanvasToolbar
        project={project}
        editable
        scale={1}
        onAdd={() => {}}
        onAddNote={() => {}}
        onAddArrow={() => {}}
        onZoom={() => {}}
        onFit={() => {}}
        layout={{
          label: 'Layout',
          title: 'Visual Anything is not connected, so nothing can be laid out.',
          enabled: false,
          busy: false,
          run,
        }}
      />,
    );
    const off = screen.getByRole('button', { name: 'Layout' });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    // Still pressable, so that it can say why it does nothing.
    fireEvent.click(off);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('has no Layout without the prop', () => {
    toolbar();
    expect(screen.queryByRole('button', { name: 'Layout' })).not.toBeInTheDocument();
  });

  it('hands its select over, so that the focus can be moved to it', () => {
    const addSelect = createRef<HTMLSelectElement>();
    toolbar({ addSelect });
    expect(addSelect.current).toBe(screen.getByRole('combobox', { name: 'Add an element' }));
  });
});

describe('the toolbar’s one row (A5)', () => {
  const LAYOUT = { label: 'Layout', title: 'Lay out the view', enabled: true, busy: false };

  it('draws its buttons as icons from the set, each named for screen readers and in its tooltip', () => {
    toolbar({ stacking: STACKING, layout: { ...LAYOUT, run: () => {} } });
    const row = screen.getByRole('toolbar', { name: 'Canvas' });
    for (const name of ['Note', 'Arrow', 'Layout', 'Fit', 'Zoom in', 'Zoom out', 'Bring forward']) {
      const button = within(row).getByRole('button', { name });
      expect(button.querySelector('svg'), name).toHaveAttribute('aria-hidden', 'true');
    }
    // The names are hidden in the row, and written out under More.
    expect(within(row).getByRole('button', { name: 'Note' }).querySelector('span')).toHaveClass(
      'canvas-toolbar-label',
    );
    expect(readSource('canvas/more.css')).toMatch(
      /\.canvas-toolbar-more-panel \.canvas-toolbar-label\s*\{[^}]*position: static/,
    );
  });

  it('says each button’s key in its tooltip, where it has one', () => {
    toolbar();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('title', 'Zoom in (+)');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
      'title',
      'Zoom out (−)',
    );
    const fit = screen.getByRole('button', { name: 'Fit' });
    expect(fit).toHaveAttribute('title', 'Fit (0)');
    expect(fit).toHaveAttribute('aria-keyshortcuts', '0');
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('title', 'Note');
  });

  it('shows how far a layout has come in the row while it runs', () => {
    toolbar({ layout: { ...LAYOUT, label: 'Stop layout (40%)', busy: true, run: () => {} } });
    const busy = screen.getByRole('button', { name: 'Stop layout (40%)' });
    expect(busy.querySelector('span')).not.toHaveClass('canvas-toolbar-label');
  });

  it('groups its controls between thin lines, adding first and zooming last', () => {
    toolbar({ stacking: STACKING, layout: { ...LAYOUT, run: () => {} } });
    const row = screen.getByRole('toolbar', { name: 'Canvas' });
    const children = [...row.children];
    const separators = children.filter((child) => child.matches('.canvas-toolbar-separator'));
    expect(separators).toHaveLength(2);
    for (const separator of separators) expect(separator).toHaveAttribute('aria-hidden', 'true');
    expect(children[0]).toHaveClass('canvas-toolbar-add');
    const spacer = children.findIndex((child) => child.matches('.canvas-toolbar-spacer'));
    const zoomOut = children.indexOf(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomOut).toBeGreaterThan(spacer);
    // A line beside a group that is not there, or beside the spacer, hides.
    expect(readSource('styles.css')).toMatch(
      /\.canvas-toolbar-separator:has\(\+ :is\(\.canvas-toolbar-separator, \.canvas-toolbar-spacer\)\)/,
    );
  });

  it('makes Add element its one primary action, and every other control quiet', () => {
    const css = readSource('styles.css');
    expect(css).toMatch(
      /\.canvas-toolbar \.canvas-toolbar-add select\s*\{[^}]*background: var\(--accent-fill\)/,
    );
    expect(css).toMatch(
      /\.canvas-toolbar summary,\s*\.canvas-toolbar-zoom\s*\{[^}]*border: var\(--stroke-thin\) solid transparent;\s*border-radius: var\(--radius-md\);\s*background: transparent/,
    );
  });

  it('holds the keyboard help, which no longer floats over the canvas', () => {
    toolbar();
    const row = screen.getByRole('toolbar', { name: 'Canvas' });
    const keys = within(row).getByText('Keyboard').closest('details');
    expect(keys).toHaveClass('canvas-keys');
    expect(within(keys as HTMLElement).getByText('Shift+arrow keys')).toBeInTheDocument();
    expect(readSource('canvas/keyboard.css')).not.toMatch(/\.canvas-keys\s*\{[^}]*bottom:/);
  });
});
