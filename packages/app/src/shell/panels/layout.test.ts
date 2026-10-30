import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@visual-anything/core';
import {
  DEFAULT_LAYOUT,
  MIN_PANEL_WIDTH,
  keyedWidth,
  maxPanelWidth,
  panelShortcut,
  sameLayout,
  shownWidth,
} from './layout';

describe('the side panels’ widths', () => {
  it('go from 200 px to half the window, and never below 200 px', () => {
    expect(MIN_PANEL_WIDTH).toBe(200);
    expect(maxPanelWidth(1600)).toBe(800);
    expect(maxPanelWidth(1001)).toBe(500);
    expect(maxPanelWidth(300)).toBe(200);
  });

  it('never go past the 2,000 px the preference keeps, however wide the window', () => {
    expect(maxPanelWidth(5000)).toBe(2000);
    expect(shownWidth(2400, 5000)).toBe(2000);
  });

  it('open at the preference’s defaults, 288 and 320 px', () => {
    expect(DEFAULT_LAYOUT).toBe(DEFAULT_PREFERENCES.sidePanels);
    expect(DEFAULT_LAYOUT.model).toEqual({ width: 288, collapsed: false });
    expect(DEFAULT_LAYOUT.inspector).toEqual({ width: 320, collapsed: false });
    expect(sameLayout(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT })).toBe(true);
    expect(
      sameLayout(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, model: { width: 288, collapsed: true } }),
    ).toBe(false);
  });

  it('show the width chosen, within what the window allows now', () => {
    expect(shownWidth(320, 1600)).toBe(320);
    expect(shownWidth(700, 1000)).toBe(500);
    expect(shownWidth(120, 1000)).toBe(200);
    expect(shownWidth(250.6, 1000)).toBe(251);
  });

  it('move the edge by 16 px with the arrows, towards where it moves, and go to the ends with Home and End', () => {
    // The model panel's edge is its right side: Right widens it.
    expect(keyedWidth('model', 'ArrowRight', 300, 1600)).toBe(316);
    expect(keyedWidth('model', 'ArrowLeft', 300, 1600)).toBe(284);
    // The inspector's edge is its left side: Left widens it.
    expect(keyedWidth('inspector', 'ArrowLeft', 300, 1600)).toBe(316);
    expect(keyedWidth('inspector', 'ArrowRight', 300, 1600)).toBe(284);
    expect(keyedWidth('model', 'Home', 300, 1600)).toBe(200);
    expect(keyedWidth('inspector', 'End', 300, 1600)).toBe(800);
    expect(keyedWidth('model', 'ArrowLeft', 205, 1600)).toBe(200);
    expect(keyedWidth('model', 'ArrowRight', 795, 1600)).toBe(800);
    expect(keyedWidth('model', 'Enter', 300, 1600)).toBeUndefined();
    expect(keyedWidth('model', 'ArrowUp', 300, 1600)).toBeUndefined();
  });
});

describe('the side panels’ shortcuts', () => {
  const press = (key: string, more: Partial<KeyboardEvent> = {}) => ({
    key,
    code: `Key${key.toUpperCase()}`,
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    ...more,
  });

  it('are Alt+Shift+M for the model panel and Alt+Shift+N for the inspector', () => {
    expect(panelShortcut(press('M'))).toBe('model');
    expect(panelShortcut(press('n'))).toBe('inspector');
  });

  it('read the key’s place where Option or another layout types another character', () => {
    expect(panelShortcut(press('Â', { code: 'KeyM' }))).toBe('model');
    expect(panelShortcut(press('˜', { code: 'KeyN' }))).toBe('inspector');
  });

  it('need Alt and Shift, and nothing else', () => {
    expect(panelShortcut(press('m', { shiftKey: false }))).toBeUndefined();
    expect(panelShortcut(press('m', { altKey: false }))).toBeUndefined();
    expect(panelShortcut(press('m', { ctrlKey: true }))).toBeUndefined();
    expect(panelShortcut(press('m', { metaKey: true }))).toBeUndefined();
    expect(panelShortcut(press('i'))).toBeUndefined();
  });
});
