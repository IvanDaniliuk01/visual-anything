import { THEME_NAMES } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import {
  ARROW_STROKE,
  CANVAS_BACKGROUND,
  DIMMED_ALPHA,
  HIGHLIGHT,
  MARKER_RING,
  NOTE_FILL,
  NOTE_STROKE,
  NOTE_TEXT,
  RELATION_LABEL_HALO,
  RELATION_LABEL_TEXT,
  contrastRatio,
  readableTextColors,
} from './colors';

describe('readableTextColors', () => {
  it('writes dark text on a light fill and light text on a dark one', () => {
    expect(readableTextColors('#DCEBFF').name).toBe('#1F2933');
    expect(readableTextColors('#1D4F91').name).toBe('#FFFFFF');
  });

  it.each(['#FFFFFF', '#F3F5F8', '#DCEBFF', '#FFF3C9', '#808080', '#1D4F91', '#000000'])(
    'keeps both lines of text on %s at a contrast of at least 4.5:1',
    (fill) => {
      const colors = readableTextColors(fill);
      expect(contrastRatio(colors.name, fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.detail, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('works each fill out once', () => {
    expect(readableTextColors('#172B45')).toBe(readableTextColors('#172B45'));
  });
});

describe('the canvas colors', () => {
  it('are the light theme’s, from the one source of theme colors', () => {
    const light = THEMES.light.canvas;
    expect(CANVAS_BACKGROUND).toBe(light.background);
    expect([NOTE_FILL, NOTE_STROKE, NOTE_TEXT]).toEqual([
      light.noteFill,
      light.noteStroke,
      light.noteText,
    ]);
    expect(ARROW_STROKE).toBe(light.freeArrow);
    expect([RELATION_LABEL_TEXT, RELATION_LABEL_HALO]).toEqual([
      light.relationLabelText,
      light.relationLabelBack,
    ]);
    expect(HIGHLIGHT).toBe(light.highlight);
    expect(MARKER_RING).toBe(light.background);
  });
});

describe('the emphasis colors', () => {
  it.each(THEME_NAMES)(
    'keeps the highlight at 3:1 against the %s canvas, which also rings the markers',
    (name) => {
      const theme = THEMES[name].canvas;
      expect(contrastRatio(theme.highlight, theme.background)).toBeGreaterThanOrEqual(3);
    },
  );

  it('dims faintly, never to nothing', () => {
    expect(contrastRatio(HIGHLIGHT, MARKER_RING)).toBeGreaterThanOrEqual(3);
    expect(DIMMED_ALPHA).toBeGreaterThan(0);
    expect(DIMMED_ALPHA).toBeLessThan(0.5);
  });
});
