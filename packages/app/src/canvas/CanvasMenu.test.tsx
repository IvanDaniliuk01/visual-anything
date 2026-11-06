import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasMenu } from './CanvasMenu';

function menu(editable = true) {
  const onPaste = vi.fn();
  const onPasteAsDuplicates = vi.fn();
  const onClose = vi.fn();
  render(
    <CanvasMenu
      at={{ x: 10, y: 10 }}
      editable={editable}
      onPaste={onPaste}
      onPasteAsDuplicates={onPasteAsDuplicates}
      onClose={onClose}
    />,
  );
  return { onPaste, onPasteAsDuplicates, onClose };
}

describe('the canvas’s menu', () => {
  it('offers Paste and Paste as duplicates, the first with the focus', () => {
    const { onPaste, onPasteAsDuplicates } = menu();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Paste', 'Paste as duplicates']);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
    expect(onPaste).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste as duplicates' }));
    expect(onPasteAsDuplicates).toHaveBeenCalledOnce();
  });

  it('does nothing while the project cannot be changed', () => {
    const { onPaste, onPasteAsDuplicates } = menu(false);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste as duplicates' }));
    expect(onPaste).not.toHaveBeenCalled();
    expect(onPasteAsDuplicates).not.toHaveBeenCalled();
  });

  it('closes with Escape', () => {
    const { onClose } = menu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
