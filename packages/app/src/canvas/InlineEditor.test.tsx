import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEditor } from './InlineEditor';

function edit(multiline = false) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineEditor
      rect={{ x: 0, y: 0, width: 180, height: 72 }}
      camera={{ x: 0, y: 0, scale: 1 }}
      value="Patient"
      multiline={multiline}
      label="Name of Patient"
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const field = screen.getByRole('textbox', { name: 'Name of Patient' });
  return { field, onCommit, onCancel };
}

describe('InlineEditor', () => {
  it('commits with Enter', () => {
    const { field, onCommit } = edit();
    fireEvent.change(field, { target: { value: 'Client' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Client');
  });

  it('cancels with Escape', () => {
    const { field, onCancel } = edit();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter and Escape to an input method while it composes text', () => {
    const { field, onCommit, onCancel } = edit();
    fireEvent.change(field, { target: { value: 'にほ' } });
    // Enter picks the input method's candidate; Escape drops what it composes.
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });
    // Safari ends a composition with an Enter that says it no longer composes, with key code 229.
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '日本' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('日本');
  });

  it('keeps the keys typed in it from the shortcuts of the window', () => {
    const { field } = edit();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    try {
      fireEvent.keyDown(field, { key: '[', ctrlKey: true });
      expect(outside).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', outside);
    }
  });

  it('wraps a note’s selection in markers with the keys of text emphasis', () => {
    const note = edit(true);
    (note.field as HTMLTextAreaElement).setSelectionRange(0, 7);
    fireEvent.keyDown(note.field, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(note.field, { key: 'Enter', ctrlKey: true });
    expect(note.onCommit).toHaveBeenCalledWith('**Patient**');
  });

  it('leaves the keys of text emphasis alone in a name', () => {
    const { field, onCommit } = edit();
    (field as HTMLInputElement).setSelectionRange(0, 7);
    fireEvent.keyDown(field, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
