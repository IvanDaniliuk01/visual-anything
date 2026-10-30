import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  MIN_PANEL_WIDTH,
  PANEL_STORAGE_KEY,
  keyedWidth,
  maxPanelWidth,
  panelShortcut,
  readLayout,
  shownWidth,
  writeLayout,
} from './layout';

/** A storage that keeps what it is given, as local storage does. */
function memory(initial?: string): Storage & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  if (initial !== undefined) kept.set(PANEL_STORAGE_KEY, initial);
  return {
    kept,
    get length() {
      return kept.size;
    },
    clear: () => kept.clear(),
    key: (index) => [...kept.keys()][index] ?? null,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
}

/** A storage whose every use throws, as a browser that blocks storage does. */
const BROKEN: Storage = {
  length: 0,
  clear: () => {
    throw new Error('blocked');
  },
  key: () => {
    throw new Error('blocked');
  },
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('the side panels’ widths', () => {
  it('go from 200 px to half the window, and never below 200 px', () => {
    expect(MIN_PANEL_WIDTH).toBe(200);
    expect(maxPanelWidth(1600)).toBe(800);
    expect(maxPanelWidth(1001)).toBe(500);
    expect(maxPanelWidth(300)).toBe(200);
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

describe('the side panels kept in local storage', () => {
  it('start from the defaults when nothing is kept', () => {
    expect(readLayout(memory())).toEqual(DEFAULT_LAYOUT);
    expect(readLayout(undefined)).toEqual(DEFAULT_LAYOUT);
  });

  it('read back what was written', () => {
    const storage = memory();
    const layout = {
      model: { width: 260, collapsed: true },
      inspector: { width: 410, collapsed: false },
    };
    writeLayout(storage, layout);
    expect(JSON.parse(storage.kept.get(PANEL_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      ...layout,
    });
    expect(readLayout(storage)).toEqual(layout);
  });

  it('take the default for each value that cannot be read, and keep the rest', () => {
    expect(
      readLayout(
        memory(
          JSON.stringify({
            version: 1,
            model: { width: 'wide', collapsed: true },
            inspector: { width: 12, collapsed: 'yes' },
          }),
        ),
      ),
    ).toEqual({
      model: { width: DEFAULT_LAYOUT.model.width, collapsed: true },
      inspector: { width: MIN_PANEL_WIDTH, collapsed: false },
    });
    expect(readLayout(memory('{not json'))).toEqual(DEFAULT_LAYOUT);
    expect(readLayout(memory('[1, 2]'))).toEqual(DEFAULT_LAYOUT);
    expect(readLayout(memory(JSON.stringify({ model: { width: Infinity } })))).toEqual(
      DEFAULT_LAYOUT,
    );
  });

  it('fall back to the defaults, and keep working, when storage throws', () => {
    expect(readLayout(BROKEN)).toEqual(DEFAULT_LAYOUT);
    expect(() => writeLayout(BROKEN, DEFAULT_LAYOUT)).not.toThrow();
  });
});
