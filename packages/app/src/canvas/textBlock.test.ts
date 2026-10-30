import { emphasisRuns } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_INSET,
  DETAIL_LINE_HEIGHT,
  NAME_LINE_HEIGHT,
  placeTextBlock,
  type TextBlockInput,
} from './textBlock';

/** "Nota de paso": a tall shape whose detail is a long sentence. */
const tall: TextBlockInput = {
  area: { x: 0, y: 0, width: 320, height: 96 },
  wrap: 308,
  name: 'Nota de paso',
  detail:
    'Una corrida de auditoría que lee las fichas del día, compara lo facturado con lo atendido y deja una nota por diferencia',
};

describe('placing a shape’s name and detail (ADR 0082)', () => {
  it('centres the whole block, the name moving up by half the detail', () => {
    const block = placeTextBlock(tall);
    const height = block.nameHeight + 2 + block.detailHeight;
    expect(block.nameTop).toBeCloseTo((96 - height) / 2);
    expect(block.detailTop).toBeCloseTo(block.nameTop + block.nameHeight + 2);
    expect(block.detailLines).toBeGreaterThan(1);
  });

  it('draws a shape with no detail as before: its name in the middle', () => {
    const block = placeTextBlock({ ...tall, detail: '' });
    expect(block.nameTop + block.nameHeight / 2).toBeCloseTo(48);
    expect(block.detailLines).toBe(0);
  });

  it('starts at the top, 8 units in, or ends at the bottom', () => {
    const top = placeTextBlock({ ...tall, placement: 'top' });
    expect(top.nameTop).toBe(BLOCK_INSET);
    const bottom = placeTextBlock({ ...tall, placement: 'bottom' });
    expect(bottom.detailTop + bottom.detailHeight).toBeCloseTo(96 - BLOCK_INSET);
  });

  it('wraps the detail to its lines, 3 unless said, cut with "…"', () => {
    const roomy = { ...tall, area: { ...tall.area, height: 400 }, wrap: 120 };
    const three = placeTextBlock(roomy);
    expect(three.detailLines).toBe(3);
    expect(three.detailCut).toBe(true);
    expect(three.detail?.lines.at(-1)?.pieces.at(-1)?.text.endsWith('…')).toBe(true);
    expect(placeTextBlock({ ...roomy, lines: 5 }).detailLines).toBe(5);
    expect(placeTextBlock({ ...roomy, lines: 1 }).detailLines).toBe(1);
  });

  it('gives the detail only what the area holds under the name', () => {
    const low = placeTextBlock({ ...tall, area: { ...tall.area, height: 48 } });
    expect(low.nameLines).toBe(1);
    expect(low.nameHeight + 2 + low.detailHeight).toBeLessThanOrEqual(48);
    const none = placeTextBlock({ ...tall, area: { ...tall.area, height: NAME_LINE_HEIGHT } });
    expect(none.detailLines).toBe(0);
    expect(none.detailCut).toBe(true);
  });

  it('wraps a long name first, and cuts it to the area', () => {
    const long = placeTextBlock({ ...tall, name: 'A very long name '.repeat(8), wrap: 120 });
    expect(long.nameLines).toBeGreaterThan(1);
    expect(long.nameCut).toBe(true);
    expect(long.nameHeight).toBeLessThanOrEqual(96);
  });

  it('lays out a detail’s runs when it takes text emphasis', () => {
    const block = placeTextBlock({
      ...tall,
      detail: 'the **orders** table',
      detailRuns: emphasisRuns('the **orders** table'),
    });
    expect(block.detail?.lines[0]?.pieces.map((piece) => piece.variant)).toEqual([
      'regular',
      'bold',
      'regular',
    ]);
    expect(block.detailHeight).toBe(DETAIL_LINE_HEIGHT);
  });
});
