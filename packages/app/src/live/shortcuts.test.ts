import { describe, expect, it } from 'vitest';
import { historyShortcut, isTextEntry, type ShortcutKeys } from './shortcuts';

function keys(key: string, modifiers: Partial<ShortcutKeys> = {}): ShortcutKeys {
  return {
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe('historyShortcut', () => {
  it.each([
    ['Ctrl+Z', keys('z', { ctrlKey: true })],
    ['⌘Z', keys('z', { metaKey: true })],
    ['Ctrl+Z with Caps Lock', keys('Z', { ctrlKey: true })],
  ])('undoes with %s', (_name, pressed) => {
    expect(historyShortcut(pressed)).toBe('undo');
  });

  it.each([
    ['Ctrl+Shift+Z', keys('Z', { ctrlKey: true, shiftKey: true })],
    ['⌘⇧Z', keys('Z', { metaKey: true, shiftKey: true })],
    ['Ctrl+Y', keys('y', { ctrlKey: true })],
  ])('redoes with %s', (_name, pressed) => {
    expect(historyShortcut(pressed)).toBe('redo');
  });

  it.each([
    ['Z alone', keys('z')],
    ['Shift+Z', keys('Z', { shiftKey: true })],
    ['Ctrl+Alt+Z, which is AltGr+Z on Windows', keys('z', { ctrlKey: true, altKey: true })],
    ['⌥⌘Z', keys('z', { metaKey: true, altKey: true })],
    ['⌘Y, which shows the history in Safari', keys('y', { metaKey: true })],
    ['Ctrl+Shift+Y', keys('Y', { ctrlKey: true, shiftKey: true })],
    ['Ctrl+X', keys('x', { ctrlKey: true })],
  ])('leaves %s alone', (_name, pressed) => {
    expect(historyShortcut(pressed)).toBeUndefined();
  });

  it('finds the Z key on keyboard layouts without Latin letters', () => {
    expect(historyShortcut({ ...keys('z', { ctrlKey: true }), key: 'я', code: 'KeyZ' })).toBe(
      'undo',
    );
  });

  it('follows the letter, not the key’s place, on Latin layouts such as AZERTY', () => {
    // On AZERTY, the key that types "z" sits where QWERTY has "W".
    expect(historyShortcut({ ...keys('z', { ctrlKey: true }), code: 'KeyW' })).toBe('undo');
    expect(historyShortcut({ ...keys('w', { ctrlKey: true }), code: 'KeyZ' })).toBeUndefined();
  });
});

describe('isTextEntry', () => {
  function make(html: string): HTMLElement {
    document.body.innerHTML = html;
    const target = document.querySelector<HTMLElement>('[data-target]');
    if (!target) throw new Error('The markup has no target.');
    return target;
  }

  it.each(['text', 'search', 'url', 'email', 'password', 'number', 'tel', 'date'])(
    'counts an input of type %s as text entry',
    (type) => {
      expect(isTextEntry(make(`<input data-target type="${type}">`))).toBe(true);
    },
  );

  it('counts an input without a type, and a text area, as text entry', () => {
    expect(isTextEntry(make('<input data-target>'))).toBe(true);
    expect(isTextEntry(make('<textarea data-target></textarea>'))).toBe(true);
  });

  it.each(['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'])(
    'does not count an input of type %s',
    (type) => {
      expect(isTextEntry(make(`<input data-target type="${type}">`))).toBe(false);
    },
  );

  it('counts editable content and what it holds', () => {
    expect(isTextEntry(make('<div data-target contenteditable></div>'))).toBe(true);
    expect(isTextEntry(make('<div contenteditable="true"><b data-target>x</b></div>'))).toBe(true);
    expect(
      isTextEntry(make('<div contenteditable="plaintext-only"><i data-target>x</i></div>')),
    ).toBe(true);
  });

  it('does not count content that is not editable', () => {
    expect(
      isTextEntry(make('<div contenteditable><b contenteditable="false" data-target></b></div>')),
    ).toBe(false);
    expect(isTextEntry(make('<button data-target>Undo</button>'))).toBe(false);
    expect(isTextEntry(make('<div data-target tabindex="0"></div>'))).toBe(false);
    expect(isTextEntry(document.body)).toBe(false);
    expect(isTextEntry(window)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
