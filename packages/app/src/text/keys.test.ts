import { describe, expect, it } from 'vitest';
import { emphasisKeyOf, toggleEmphasis } from './keys';

const key = (key: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra }) as const;

describe('emphasisKeyOf', () => {
  it('reads the editor keys of ADR 0082, with Ctrl or ⌘', () => {
    expect(emphasisKeyOf(key('b'))).toBe('bold');
    expect(emphasisKeyOf(key('I'))).toBe('italic');
    expect(emphasisKeyOf(key('u'))).toBe('underline');
    expect(emphasisKeyOf(key('X', { shiftKey: true }))).toBe('strike');
    expect(emphasisKeyOf(key('e'))).toBe('code');
    expect(emphasisKeyOf(key('h', { shiftKey: true }))).toBe('highlight');
    expect(emphasisKeyOf(key('b', { ctrlKey: false, metaKey: true }))).toBe('bold');
  });

  it('reads nothing else', () => {
    expect(emphasisKeyOf(key('b', { ctrlKey: false }))).toBeUndefined();
    expect(emphasisKeyOf(key('x'))).toBeUndefined();
    expect(emphasisKeyOf(key('h'))).toBeUndefined();
    expect(emphasisKeyOf(key('b', { altKey: true }))).toBeUndefined();
    expect(emphasisKeyOf(key('b', { shiftKey: true }))).toBeUndefined();
  });
});

describe('toggleEmphasis', () => {
  it('wraps a selection, leaving the spaces at its ends outside', () => {
    expect(toggleEmphasis('a word here', 1, 7, 'bold')).toEqual({
      text: 'a **word** here',
      start: 4,
      end: 8,
    });
  });

  it('takes markers away from around the selection, or from inside it', () => {
    expect(toggleEmphasis('a **word** here', 4, 8, 'bold')).toEqual({
      text: 'a word here',
      start: 2,
      end: 6,
    });
    expect(toggleEmphasis('a **word** here', 2, 10, 'bold')).toEqual({
      text: 'a word here',
      start: 2,
      end: 6,
    });
  });

  it('tells italic from bold', () => {
    expect(toggleEmphasis('**word**', 2, 6, 'italic').text).toBe('***word***');
    expect(toggleEmphasis('***word***', 3, 7, 'italic').text).toBe('**word**');
    expect(toggleEmphasis('***word***', 3, 7, 'bold').text).toBe('*word*');
    expect(toggleEmphasis('*word*', 1, 5, 'bold').text).toBe('***word***');
  });

  it('puts the cursor between new markers when nothing is selected', () => {
    expect(toggleEmphasis('ab', 1, 1, 'code')).toEqual({ text: 'a``b', start: 2, end: 2 });
    expect(toggleEmphasis('ab', 1, 1, 'strike')).toEqual({ text: 'a~~~~b', start: 3, end: 3 });
  });

  it('writes each mark with its own markers', () => {
    expect(toggleEmphasis('x', 0, 1, 'underline').text).toBe('++x++');
    expect(toggleEmphasis('x', 0, 1, 'highlight').text).toBe('==x==');
    expect(toggleEmphasis('x', 0, 1, 'strike').text).toBe('~~x~~');
    expect(toggleEmphasis('x', 0, 1, 'italic').text).toBe('*x*');
  });
});
