/**
 * Link card… on the canvas toolbar (ADR 0098, stage 3): it asks for a web address, refuses one that
 * is not http or https, adds a card for one that is, and closes on Escape.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../../test/sample';
import { CanvasToolbar } from '../CanvasToolbar';

function toolbar(onAddLinkCard = vi.fn()) {
  render(
    <CanvasToolbar
      project={loadSample()}
      editable
      scale={1}
      onAdd={() => {}}
      onAddNote={() => {}}
      onAddArrow={() => {}}
      onZoom={() => {}}
      onFit={() => {}}
      onAddLinkCard={onAddLinkCard}
    />,
  );
  return { onAddLinkCard };
}

describe('Link card… on the canvas toolbar', () => {
  it('asks for an address, refuses one that is not http or https, and adds one that is', () => {
    const { onAddLinkCard } = toolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Link card…' }));
    const address = screen.getByLabelText('Web address');
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Write an address that starts with https://.',
    );
    expect(onAddLinkCard).not.toHaveBeenCalled();
    fireEvent.change(address, { target: { value: ' https://Example.org/guide ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddLinkCard).toHaveBeenCalledExactlyOnceWith('https://example.org/guide');
    expect(screen.queryByLabelText('Web address')).toBeNull();
  });

  it('closes on Escape, adding nothing', () => {
    const { onAddLinkCard } = toolbar();
    fireEvent.click(screen.getByRole('button', { name: 'Link card…' }));
    fireEvent.keyDown(screen.getByLabelText('Web address'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onAddLinkCard).not.toHaveBeenCalled();
  });
});
