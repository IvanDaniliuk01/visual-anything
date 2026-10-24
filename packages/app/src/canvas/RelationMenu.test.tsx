import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { RelationMenu } from './RelationMenu';

const project = loadSample();

function open() {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  render(
    <div>
      <button type="button">Elsewhere</button>
      <RelationMenu
        project={project}
        from="appointments-api"
        to="appointments-db"
        at={{ x: 10, y: 10 }}
        onChoose={onChoose}
        onClose={onClose}
      />
    </div>,
  );
  const menu = screen.getByRole('menu', { name: 'Relate Appointments API to Appointments DB' });
  return { menu, onChoose, onClose, items: screen.getAllByRole('menuitem') };
}

describe('RelationMenu', () => {
  it('moves through its items with the arrow keys, Home and End, round at the ends', () => {
    const { menu, items } = open();
    const first = items[0] as HTMLElement;
    const last = items.at(-1) as HTMLElement;
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(last).toHaveFocus();
    expect(last).toHaveTextContent('Cancel');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(first).toHaveFocus();
  });

  it('chooses the item with the focus with Enter, and closes with Escape', () => {
    const { menu, onChoose, onClose } = open();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('systems.reads-from');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the pointer is pressed outside it, and not inside it', () => {
    const { onClose, items } = open();
    fireEvent.pointerDown(items[0] as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
