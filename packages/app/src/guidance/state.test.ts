import { describe, expect, it } from 'vitest';
import { NO_GUIDANCE, applyGuidance } from './state';

describe('applyGuidance', () => {
  it('marks targets, replacing the marks before', () => {
    const first = applyGuidance(NO_GUIDANCE, { kind: 'highlight', targets: ['a'] }, 1);
    expect(first).toEqual({ marks: { kind: 'highlight', targets: ['a'], request: 1 } });
    const second = applyGuidance(first, { kind: 'highlight', targets: ['b'], view: 'v' }, 2);
    expect(second).toEqual({ marks: { kind: 'highlight', targets: ['b'], view: 'v', request: 2 } });
  });

  it('focuses on targets and moves the canvas to the first one', () => {
    expect(
      applyGuidance(NO_GUIDANCE, { kind: 'focus', targets: ['a', 'b'], view: 'v' }, 3),
    ).toEqual({
      marks: { kind: 'focus', targets: ['a', 'b'], view: 'v', request: 3 },
      panTo: { target: 'a', view: 'v', request: 3 },
    });
  });

  it('keeps the marks while it moves the canvas or shows a caption', () => {
    const marked = applyGuidance(NO_GUIDANCE, { kind: 'highlight', targets: ['a'] }, 1);
    const moved = applyGuidance(marked, { kind: 'pan-to', target: 'b' }, 2);
    expect(moved).toEqual({ ...marked, panTo: { target: 'b', request: 2 } });
    const captioned = applyGuidance(moved, { kind: 'caption', text: 'Here.' }, 3);
    expect(captioned).toEqual({ ...moved, caption: 'Here.' });
  });

  it('takes the caption away with an empty one', () => {
    const captioned = applyGuidance(NO_GUIDANCE, { kind: 'caption', text: 'Here.' }, 1);
    expect(applyGuidance(captioned, { kind: 'caption', text: '' }, 2)).toEqual({});
  });

  it('takes everything away when cleared', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'focus', targets: ['a'] }, 1);
    state = applyGuidance(state, { kind: 'caption', text: 'Here.' }, 2);
    expect(applyGuidance(state, { kind: 'clear' }, 3)).toEqual({});
  });
});
