/**
 * Helpers for tests of the theme: jsdom has no `matchMedia`, so a test gives the system's setting; and
 * jsdom loads no CSS, so a test reads the stylesheets as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ThemeName } from '@visual-anything/core';
import { vi } from 'vitest';

/** The app's `src` folder. Resolved from a path, since Vite rewrites `import.meta.url` for its server. */
export const SOURCE_FOLDER = resolve(import.meta.dirname, '..');

/** The text of a file of the app, by its path from `src`, or from the package with `../`. */
export function readSource(path: string): string {
  return readFileSync(resolve(SOURCE_FOLDER, path), 'utf8');
}

/**
 * Makes `matchMedia('(prefers-color-scheme: dark)')` answer as a system in `theme` would, until the
 * test ends; `set` changes the system's setting and tells the listeners, as a browser does.
 */
export function stubSystemTheme(theme: ThemeName): { set(theme: ThemeName): void } {
  let current = theme;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const matchMedia = (query: string): MediaQueryList => {
    const isDark = query.includes('prefers-color-scheme: dark');
    const list = {
      get matches() {
        return isDark && current === 'dark';
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      dispatchEvent: () => true,
    };
    return list as unknown as MediaQueryList;
  };
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    set(next) {
      current = next;
      for (const listener of [...listeners]) {
        listener({ matches: next === 'dark' } as MediaQueryListEvent);
      }
    },
  };
}
