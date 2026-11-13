import { describe, expect, it } from 'vitest';
import { KEPT_FRAMES, KeptFrames } from './kept-frames';

/** A frame held by the keeper, hidden or not, that records when the keeper lets it go. */
function frame(keeper: KeptFrames, hidden = true) {
  const made = {
    hidden,
    evicted: 0,
    handle: undefined as unknown as ReturnType<KeptFrames['hold']>,
  };
  made.handle = keeper.hold({
    evictable: () => made.hidden,
    evict: () => {
      made.evicted += 1;
    },
  });
  return made;
}

describe('the frames a tab keeps (ADR 0107, 2026-11-12)', () => {
  it('keeps eight', () => {
    expect(KEPT_FRAMES).toBe(8);
    const keeper = new KeptFrames();
    const frames = Array.from({ length: 8 }, () => frame(keeper));
    expect(frames.every((each) => each.evicted === 0)).toBe(true);
    expect(keeper.size).toBe(8);
  });

  it('lets the one used longest ago go past eight, once', () => {
    const keeper = new KeptFrames();
    const frames = Array.from({ length: 8 }, () => frame(keeper));
    frames[0]?.handle.use();
    frame(keeper);
    expect(frames.map((each) => each.evicted)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    // Asked to go, it still counts until it is removed; nothing else goes meanwhile.
    frames[2]?.handle.use();
    expect(frames[1]?.evicted).toBe(1);
    frames[1]?.handle.release();
    expect(keeper.size).toBe(8);
  });

  it('never lets go a frame that shows, as the panel’s, a tour’s and a live one on screen', () => {
    const keeper = new KeptFrames();
    const shown = Array.from({ length: 8 }, () => frame(keeper, false));
    const hidden = frame(keeper);
    expect(hidden.evicted).toBe(1);
    expect(shown.every((each) => each.evicted === 0)).toBe(true);
    hidden.handle.release();
    // Nine that show are kept: none may go.
    const ninth = frame(keeper, false);
    expect(ninth.evicted).toBe(0);
    expect(keeper.size).toBe(9);
    // Once one hides, it goes.
    const first = shown[0];
    if (!first) throw new Error('No frame.');
    first.hidden = true;
    first.handle.changed();
    expect(first.evicted).toBe(1);
  });

  it('forgets a frame released', () => {
    const keeper = new KeptFrames(2);
    const a = frame(keeper);
    a.handle.release();
    a.handle.release();
    frame(keeper);
    frame(keeper);
    expect(keeper.size).toBe(2);
    expect(a.evicted).toBe(0);
  });
});
