/** The script that writes the theme on the page before its first paint: `public/theme.js`. */
import { runInNewContext } from 'node:vm';
import { THEME_PARAM } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from './store';
import { readSource } from './testing';

const SCRIPT = readSource('../public/theme.js');

interface Page {
  hash?: string;
  kept?: string | null;
  systemDark?: boolean;
  /** Whether the page has session storage and matchMedia. */
  bare?: boolean;
}

/** Runs the script on a page as given, and returns the `data-theme` it wrote, if any. */
function paint({ hash = '', kept = null, systemDark = false, bare = false }: Page) {
  const attributes = new Map<string, string>();
  const context = {
    URLSearchParams,
    location: { hash },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
    },
    ...(bare
      ? {}
      : {
          sessionStorage: {
            getItem: (key: string) => (key === THEME_STORAGE_KEY ? kept : null),
          },
          matchMedia: (query: string) => ({
            matches: systemDark && query === '(prefers-color-scheme: dark)',
          }),
        }),
  };
  runInNewContext(SCRIPT, context);
  return attributes.get('data-theme');
}

describe('the first paint', () => {
  it('takes the theme the address carries', () => {
    expect(paint({ hash: `#token=abc&${THEME_PARAM}=dark`, kept: 'light' })).toBe('dark');
    expect(paint({ hash: `#${THEME_PARAM}=light`, systemDark: true })).toBe('light');
  });

  it('takes the choice the tab kept when the address carries none', () => {
    expect(paint({ kept: 'dark' })).toBe('dark');
    expect(paint({ kept: 'light', systemDark: true })).toBe('light');
  });

  it('follows the system for "system", for nothing kept and for what it does not know', () => {
    expect(paint({ kept: 'system', systemDark: true })).toBe('dark');
    expect(paint({ systemDark: true })).toBe('dark');
    expect(paint({ hash: '#theme=sepia', kept: 'constructor', systemDark: false })).toBe('light');
  });

  it('draws light on a page without session storage or matchMedia, and never fails', () => {
    expect(paint({ bare: true })).toBe('light');
    expect(paint({ bare: true, hash: '#theme=dark' })).toBe('dark');
  });

  it('only reads: it writes nothing but the attribute', () => {
    expect(SCRIPT).not.toMatch(/setItem|replaceState|innerHTML|document\.write/);
  });
});
