import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
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

  it('hands its select over, so that the focus can be moved to it', () => {
    const addSelect = createRef<HTMLSelectElement>();
    toolbar({ addSelect });
    expect(addSelect.current).toBe(screen.getByRole('combobox', { name: 'Add an element' }));
  });
});
