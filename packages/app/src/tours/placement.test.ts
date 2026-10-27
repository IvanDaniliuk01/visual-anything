/** Where a tour's caption goes, clear of what the step marks (ADR 0077). */
import { describe, expect, it } from 'vitest';
import type { Camera } from '../canvas/camera';
import { buildScene } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { farthestSide, marksOnScreen, placeCaption } from './placement';

const SCREEN = { width: 1200, height: 800 };
const CARD = { height: 200, width: 400 };

describe('farthestSide', () => {
  it('takes the bottom with no marks on screen, as the card sat before', () => {
    expect(farthestSide([], SCREEN, CARD)).toBe('bottom');
    expect(farthestSide([{ x: -500, y: -500, width: 100, height: 100 }], SCREEN, CARD)).toBe(
      'bottom',
    );
  });

  it('takes the side with the most room for the card beyond the marks', () => {
    // Marks along the bottom: the card goes to the top.
    expect(farthestSide([{ x: 100, y: 600, width: 1000, height: 150 }], SCREEN, CARD)).toBe('top');
    // Marks along the top: the bottom.
    expect(farthestSide([{ x: 100, y: 40, width: 1000, height: 150 }], SCREEN, CARD)).toBe(
      'bottom',
    );
    // Marks down the left side, from top to bottom: the right.
    expect(farthestSide([{ x: 20, y: 20, width: 300, height: 760 }], SCREEN, CARD)).toBe('right');
    // And down the right side: the left.
    expect(farthestSide([{ x: 880, y: 20, width: 300, height: 760 }], SCREEN, CARD)).toBe('left');
  });

  it('reads the marks together, as the rectangle around all of them on screen', () => {
    const marks = [
      { x: 100, y: 500, width: 100, height: 100 },
      { x: 900, y: 650, width: 100, height: 100 },
    ];
    expect(farthestSide(marks, SCREEN, CARD)).toBe('top');
  });

  it('prefers the bottom when every side has room', () => {
    expect(farthestSide([{ x: 590, y: 390, width: 20, height: 20 }], SCREEN, CARD)).toBe('bottom');
  });
});

describe('placeCaption', () => {
  const marks = [{ x: 100, y: 600, width: 1000, height: 150 }];

  it('keeps the corner a step fixes, wherever its marks are', () => {
    expect(
      placeCaption({ fixed: 'top-left', marks, screen: SCREEN, card: CARD, fresh: true }),
    ).toBe('top-left');
  });

  it('takes the farthest side when the camera stops on a step', () => {
    expect(
      placeCaption({ current: 'bottom', marks, screen: SCREEN, card: CARD, fresh: true }),
    ).toBe('top');
  });

  it('stays where it is for a reveal that it does not cover', () => {
    expect(
      placeCaption({
        current: 'bottom',
        marks: [{ x: 100, y: 40, width: 200, height: 100 }],
        screen: SCREEN,
        card: CARD,
        shown: { x: 300, y: 560, width: 600, height: 200 },
        fresh: false,
      }),
    ).toBe('bottom');
  });

  it('moves for a reveal that it would cover', () => {
    expect(
      placeCaption({
        current: 'bottom',
        marks,
        screen: SCREEN,
        card: CARD,
        shown: { x: 300, y: 560, width: 600, height: 200 },
        fresh: false,
      }),
    ).toBe('top');
  });
});

describe('marksOnScreen', () => {
  const project = loadSample();
  const scene = buildScene(project, 'system-overview');
  const [shape] = scene.shapes;
  const [line] = scene.relations;
  if (!shape || !line) throw new Error('The sample draws too little.');

  it('puts each marked shape and line where the camera shows it', () => {
    const camera: Camera = { x: 10, y: 20, scale: 2 };
    const [rect] = marksOnScreen(scene, new Set([shape.key]), camera);
    expect(rect).toEqual({
      x: shape.rect.x * 2 + 10,
      y: shape.rect.y * 2 + 20,
      width: shape.rect.width * 2,
      height: shape.rect.height * 2,
    });
    const lines = marksOnScreen(scene, new Set([line.relation]), camera);
    expect(lines).toHaveLength(1);
    expect(marksOnScreen(scene, new Set(['gone']), camera)).toEqual([]);
  });
});
