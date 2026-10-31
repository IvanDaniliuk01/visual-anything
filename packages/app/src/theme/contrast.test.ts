/**
 * The contrast of every pair of theme colors the stylesheets use, in both themes: 4.5:1 for text, and
 * 3:1 for control boundaries, focus rings, selection and other marks (WCAG 2.1 AA).
 */
import { THEME_NAMES } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../canvas/colors';
import { THEMES, type ShellColors } from './themes';

type Token = keyof ShellColors;

const TEXT = 4.5;
const MARK = 3;

/** Every background text is written on, somewhere in the app. */
const BACKGROUNDS: readonly Token[] = [
  'surface', // the header, fields in the inspector
  'panel', // the model panel, the inspector, status screens
  'surfaceRaised', // the toolbar, menus, dialogs, notices, the status card, the inline editor
  'surfaceHover', // a control under the pointer
  'surfacePressed', // a control pressed, the theme chosen
  'accentSoft', // a selected row in the outline and World's tree, badges
  'problemSoft', // an error notice, a canvas failure, a status screen's detail
  'warningSoft', // a warning notice, the shell's notice, the inspector's warnings
  'emphasisHighlight', // a run of text emphasis written ==highlight== (ADR 0082)
  'emphasisCode', // inline code and code blocks in a text that takes emphasis (ADR 0082)
];

/** Every color text is written in, on any of the backgrounds. */
const TEXTS: readonly Token[] = ['text', 'textMuted', 'accent', 'problem', 'warning'];

/** Pairs that are not text on a background above, each with the selectors that use it. */
const PAIRS: readonly { color: Token; on: Token; minimum: number; where: string }[] = [
  { color: 'onAccent', on: 'accentFill', minimum: TEXT, where: 'a primary action' },
  { color: 'onAccent', on: 'accentFillHover', minimum: TEXT, where: '.dialog-confirm:hover' },
  { color: 'onProblem', on: 'problemFill', minimum: TEXT, where: '.dialog-actions .danger' },
  { color: 'onProblem', on: 'problemFillHover', minimum: TEXT, where: '.danger:hover' },
  // Control boundaries: every control, on whatever it sits on or shows while used.
  {
    color: 'controlBorder',
    on: 'surface',
    minimum: MARK,
    where: '.history-button, .theme-control',
  },
  { color: 'controlBorder', on: 'panel', minimum: MARK, where: '.inspector input' },
  { color: 'controlBorder', on: 'surfaceRaised', minimum: MARK, where: '.canvas-toolbar button' },
  { color: 'controlBorder', on: 'surfaceHover', minimum: MARK, where: 'a hovered control' },
  { color: 'controlBorder', on: 'surfacePressed', minimum: MARK, where: '.theme-option:checked' },
  { color: 'controlBorder', on: 'canvas', minimum: MARK, where: '.canvas-toolbar over the canvas' },
  // Focus rings, outside or inside what they mark.
  { color: 'focusRing', on: 'surface', minimum: MARK, where: ':focus-visible in the header' },
  { color: 'focusRing', on: 'panel', minimum: MARK, where: '.tree-row:focus-visible' },
  { color: 'focusRing', on: 'surfaceRaised', minimum: MARK, where: '.canvas-menu button' },
  { color: 'focusRing', on: 'surfaceHover', minimum: MARK, where: 'a focused menu item' },
  { color: 'focusRing', on: 'canvas', minimum: MARK, where: '.canvas-host:focus-visible' },
  // Marks.
  { color: 'accent', on: 'accentSoft', minimum: MARK, where: '.tree-row selected bar' },
  { color: 'accent', on: 'panel', minimum: MARK, where: '.panel-tab selected underline' },
  { color: 'accent', on: 'surfaceRaised', minimum: MARK, where: '.notice-info bar, status bar' },
  { color: 'accent', on: 'surface', minimum: MARK, where: '.shell-mark' },
  { color: 'problem', on: 'surfaceRaised', minimum: MARK, where: '.status-problem top' },
  { color: 'problem', on: 'problemSoft', minimum: MARK, where: '.notice-error bar' },
  { color: 'problem', on: 'surface', minimum: MARK, where: '[aria-invalid] border' },
  { color: 'warning', on: 'warningSoft', minimum: MARK, where: '.notice-warning bar' },
  { color: 'selected', on: 'canvas', minimum: MARK, where: 'selection on the canvas' },
  { color: 'highlight', on: 'canvas', minimum: MARK, where: 'guidance and playback (M4, M5)' },
  // A comparison's marks (ADR 0070): on the canvas, and as swatches in the legend and the Changes tab.
  ...(['changeAdded', 'changeRemoved', 'changeChanged', 'changeMoved'] as const).flatMap((color) =>
    (['canvas', 'panel', 'surfaceRaised', 'surfaceHover', 'accentSoft'] as const).map((on) => ({
      color,
      on,
      minimum: MARK,
      where: 'a comparison’s marks, the legend and the Changes tab',
    })),
  ),
];

describe.each(THEME_NAMES)('the %s theme', (name) => {
  const colors = THEMES[name].shell.colors;

  it.each(TEXTS)('writes %s text at 4.5:1 or more on every background', (text) => {
    for (const background of BACKGROUNDS) {
      const ratio = contrastRatio(colors[text], colors[background]);
      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it.each(PAIRS)('draws $color on $on at $minimum:1 or more ($where)', ({ color, on, minimum }) => {
    expect(contrastRatio(colors[color], colors[on])).toBeGreaterThanOrEqual(minimum);
  });

  it('draws the Delete button’s boundary at 3:1 on the dialog, as every control', () => {
    expect(contrastRatio(colors.controlBorder, colors.surfaceRaised)).toBeGreaterThanOrEqual(MARK);
  });

  it('raises surfaces in the dark by making them lighter', () => {
    if (name !== 'dark') return;
    const lightness = (token: Token) => contrastRatio(colors[token], '#000000');
    expect(lightness('panel')).toBeGreaterThan(lightness('canvas'));
    expect(lightness('surfaceRaised')).toBeGreaterThan(lightness('panel'));
  });

  it('shares the focus ring with the selection on the canvas', () => {
    expect(colors.focusRing).toBe(colors.selected);
  });
});
