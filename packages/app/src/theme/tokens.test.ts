import { THEME_NAMES } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { GENERATE_COMMAND, cssVariable, themeStyleSheet } from './css';
import { SCALE } from './scale';
import { readSource } from './testing';
import { THEMES, shellColorEntries } from './themes';

const committed = readSource('theme/tokens.css');

/** The declarations of each rule of the stylesheet, by its selector. */
function rulesOf(css: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const [, property, value] of (body ?? '').matchAll(/([\w-]+):\s*([^;]+);/g)) {
      declarations.set(property ?? '', value ?? '');
    }
    const key = (selector ?? '').replace(/\/\*.*?\*\//gs, '').trim();
    rules.set(key, new Map([...(rules.get(key) ?? []), ...declarations]));
  }
  return rules;
}

describe('tokens.css', () => {
  it(`is what themes.ts and scale.ts generate; run \`${GENERATE_COMMAND}\` after changing them`, () => {
    expect(committed).toBe(themeStyleSheet());
  });

  it('defines every color of both themes, light by default and dark by the system or by choice', () => {
    const rules = rulesOf(committed);
    const light = rules.get(':root');
    const bySystem = rules.get(":root:not([data-theme='light'])");
    const byChoice = rules.get(":root[data-theme='dark']");
    for (const [token, color] of shellColorEntries(THEMES.light.shell.colors)) {
      expect(light?.get(cssVariable(token))).toBe(color.toLowerCase());
    }
    for (const [token, color] of shellColorEntries(THEMES.dark.shell.colors)) {
      expect(bySystem?.get(cssVariable(token))).toBe(color.toLowerCase());
      expect(byChoice?.get(cssVariable(token))).toBe(color.toLowerCase());
    }
    expect(light?.get('color-scheme')).toBe('light');
    expect(byChoice?.get('color-scheme')).toBe('dark');
    expect(byChoice?.get('--shadow-3')).toBe(THEMES.dark.shell.shadows[2]);
  });

  it('gives both themes the same tokens', () => {
    for (const name of THEME_NAMES) {
      expect(Object.keys(THEMES[name].shell.colors)).toEqual(
        Object.keys(THEMES.light.shell.colors),
      );
    }
  });

  it('defines the scales once, the same in both themes', () => {
    const declarations = rulesOf(committed).get(':root');
    expect(declarations?.get('--space-2')).toBe(SCALE.space[2]);
    expect(declarations?.get('--z-notices')).toBe(SCALE.z.notices);
    expect(declarations?.get('--text-xs')).toBe('0.857rem');
    expect(committed.match(/--space-2:/g)).toHaveLength(1);
  });

  it('turns token names into CSS variables', () => {
    expect(cssVariable('surfaceRaised')).toBe('--surface-raised');
    expect(cssVariable('problemFillHover')).toBe('--problem-fill-hover');
    expect(cssVariable('text')).toBe('--text');
  });

  it('puts notices above dialogs, menus above the inline editor, and that above the toolbar', () => {
    const z = SCALE.z;
    expect(Number(z.notices)).toBeGreaterThan(Number(z.dialog));
    expect(Number(z.dialog)).toBeGreaterThan(Number(z.menu));
    expect(Number(z.menu)).toBeGreaterThan(Number(z.editor));
    expect(Number(z.editor)).toBeGreaterThan(Number(z.toolbar));
  });

  it('never goes below 12 px for text, at the default text size of 14 px', () => {
    for (const size of Object.values(SCALE.text)) {
      expect(parseFloat(size) * 14).toBeGreaterThanOrEqual(11.99);
    }
  });
});
