/**
 * The Face section's draft (ADR 0083): the face as its text areas hold it, and the parts Apply sends,
 * only those that changed.
 */
import { compileFace, layOutFace, type ResolvedFace } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  STARTING_FACE,
  changesOf,
  componentFaceCommand,
  draftOf,
  elementFaceCommand,
  faceOfDraft,
  linesOf,
  offsetOf,
} from './faceDraft';

const TABLE: ResolvedFace = {
  size: 'shape',
  markup: ['<header>', '  <b>{{name}}</b>', '</header>', '<rows/>'],
  style: ['b { font-size: 14px; }'],
  variants: [{ id: 'far', markup: ['<b>{{name}}</b>'] }],
  collapsed: 'far',
};

describe('the face draft', () => {
  it('holds a face as text, and gives the same face back', () => {
    const draft = draftOf(TABLE);
    expect(draft.markup).toBe('<header>\n  <b>{{name}}</b>\n</header>\n<rows/>');
    expect(draft.variants).toEqual([{ id: 'far', markup: '<b>{{name}}</b>' }]);
    expect(faceOfDraft(draft)).toEqual(TABLE);
    expect(changesOf(draft, TABLE)).toBeUndefined();
    expect(draftOf(undefined)).toEqual({
      size: 'shape',
      markup: '',
      style: '',
      variants: [],
      collapsed: '',
    });
  });

  it('sends only the parts that changed, and an emptied markup is inherited again', () => {
    const draft = draftOf(TABLE);
    expect(changesOf({ ...draft, style: 'b { font-size: 16px; }\n\n' }, TABLE)).toEqual({
      style: ['b { font-size: 16px; }'],
    });
    expect(changesOf({ ...draft, size: 'content', collapsed: '' }, TABLE)).toEqual({
      size: 'content',
      collapsed: null,
    });
    expect(changesOf({ ...draft, markup: '  \n' }, TABLE)).toEqual({ markup: null });
    expect(changesOf({ ...draft, variants: [] }, TABLE)).toEqual({ variants: [] });
    expect(changesOf(draftOf(STARTING_FACE), undefined)).toEqual({
      markup: STARTING_FACE.markup,
      style: STARTING_FACE.style,
    });
  });

  it('starts from a face that writes the name and the detail, which the core reads', () => {
    const compiled = compileFace(STARTING_FACE);
    expect(compiled.problems).toEqual([]);
    const drawing = layOutFace(
      compiled,
      {
        name: 'API',
        component: 'Service',
        attributes: [],
        detail: [
          {
            text: 'Team A',
            bold: false,
            italic: false,
            strike: false,
            underline: false,
            code: false,
            highlight: false,
          },
        ],
        badges: ['PII'],
      },
      { width: 160, height: 72 },
    );
    expect(drawing.runs.map((each) => each.text)).toEqual(['API', 'Team A', 'PII']);
  });

  it('finds where a line and a column are, for the problems that move there', () => {
    const text = 'ab\ncdef\ng';
    expect(offsetOf(text, 2, 3)).toBe(5);
    expect(offsetOf(text, 3, 0)).toBe(8);
    expect(offsetOf(text, 9, 9)).toBe(text.length);
    expect(linesOf('a\r\nb\n\n')).toEqual(['a', 'b']);
  });

  it('makes one command for a component’s face and one for an element’s', () => {
    expect(componentFaceCommand('shop.cart', { style: [] })).toEqual({
      type: 'set-component-appearance',
      component: 'shop.cart',
      appearanceTraits: { face: { style: [] } },
    });
    expect(elementFaceCommand('cart', null)).toEqual({
      type: 'update-element',
      id: 'cart',
      changes: { appearanceTraits: { face: null } },
    });
  });
});
