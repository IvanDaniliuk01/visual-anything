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

describe('applyGuidance for exploring and playback', () => {
  const filters = {
    components: ['systems.database'],
    relationTypes: [],
    conditions: [{ of: 'elements' as const, attribute: 'owner', test: 'is' as const, value: 'A' }],
  };

  it('keeps Claude’s filters to apply, numbered, for the view it names', () => {
    expect(applyGuidance(NO_GUIDANCE, { kind: 'filter', filters, view: 'v' }, 4)).toEqual({
      filter: { filters, view: 'v', request: 4 },
    });
  });

  it('keeps Claude’s focus to apply, with how far it reaches', () => {
    expect(
      applyGuidance(
        NO_GUIDANCE,
        {
          kind: 'focus-view',
          targets: ['a'],
          degrees: 'all',
          direction: 'incoming',
          isolate: true,
        },
        5,
      ),
    ).toEqual({
      focusView: {
        focus: { targets: ['a'], degrees: 'all', direction: 'incoming', isolate: true },
        request: 5,
      },
    });
  });

  it('clears the filters and turns the focus off together', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'filter', filters }, 1);
    state = applyGuidance(state, { kind: 'clear-explore', view: 'v' }, 2);
    expect(state).toEqual({
      filter: {
        filters: { components: [], relationTypes: [], conditions: [] },
        view: 'v',
        request: 2,
      },
      focusView: { view: 'v', request: 2 },
    });
  });

  it('keeps the last request of playback', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'playback', scenario: 's', action: 'play' }, 1);
    state = applyGuidance(
      state,
      { kind: 'playback', scenario: 's', action: 'go-to-step', step: 2 },
      2,
    );
    expect(state).toEqual({
      playback: { scenario: 's', action: 'go-to-step', step: 2, request: 2 },
    });
  });

  it('keeps the choices Claude plays with, and the alternative it chooses (ADR 0078)', () => {
    let state = applyGuidance(
      NO_GUIDANCE,
      { kind: 'playback', scenario: 's', action: 'play', choices: { stock: 'no' } },
      1,
    );
    expect(state).toEqual({
      playback: { scenario: 's', action: 'play', choices: { stock: 'no' }, request: 1 },
    });
    state = applyGuidance(
      state,
      { kind: 'playback', scenario: 's', action: 'choose', decision: 'stock', alternative: 'yes' },
      2,
    );
    expect(state).toEqual({
      playback: {
        scenario: 's',
        action: 'choose',
        decision: 'stock',
        alternative: 'yes',
        request: 2,
      },
    });
  });

  it('keeps every request while marks, moves and captions come and go', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'filter', filters }, 1);
    state = applyGuidance(state, { kind: 'playback', scenario: 's', action: 'play' }, 2);
    state = applyGuidance(state, { kind: 'caption', text: 'Here.' }, 3);
    state = applyGuidance(state, { kind: 'highlight', targets: ['a'] }, 4);
    state = applyGuidance(state, { kind: 'caption', text: '' }, 5);
    expect(state).toEqual({
      filter: { filters, request: 1 },
      playback: { scenario: 's', action: 'play', request: 2 },
      marks: { kind: 'highlight', targets: ['a'], request: 4 },
    });
  });

  it('keeps the last request of a layout, for the view and containers it names', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'layout' }, 1);
    expect(state).toEqual({ layout: { request: 1 } });
    state = applyGuidance(state, { kind: 'layout', view: 'v', containers: ['a'] }, 2);
    state = applyGuidance(state, { kind: 'caption', text: 'Laid out.' }, 3);
    expect(state).toEqual({
      layout: { view: 'v', containers: ['a'], request: 2 },
      caption: 'Laid out.',
    });
    // Clearing the guidance takes back what shows, never a layout already run.
    expect(applyGuidance(state, { kind: 'clear' }, 4)).toEqual({});
  });

  it('keeps the last request of a tour, which takes Claude’s marks, move and caption away', () => {
    let state = applyGuidance(NO_GUIDANCE, { kind: 'filter', filters }, 1);
    state = applyGuidance(state, { kind: 'focus', targets: ['a'] }, 2);
    state = applyGuidance(state, { kind: 'caption', text: 'Look here.' }, 3);
    state = applyGuidance(state, { kind: 'tour', tour: 't' }, 4);
    // The tour shows its own caption card and marks, full screen.
    expect(state).toEqual({ filter: { filters, request: 1 }, tour: { tour: 't', request: 4 } });
    state = applyGuidance(state, { kind: 'tour', tour: 't', step: 2 }, 5);
    expect(state.tour).toEqual({ tour: 't', step: 2, request: 5 });
    // Clearing the guidance never ends a tour the person watches: the request goes, nothing else.
    expect(applyGuidance(state, { kind: 'clear' }, 6)).toEqual({});
  });
});
