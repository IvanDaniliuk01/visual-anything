/** @vitest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATE_KATEX_CSS, KATEX_CSS_FILES, generatedKatexStylesheets } from './katex-css';

const committed = {
  layout: readFileSync(KATEX_CSS_FILES.layout, 'utf8'),
  fonts: readFileSync(KATEX_CSS_FILES.fonts, 'utf8'),
};

describe('KaTeX’s stylesheets (ADR 0106)', () => {
  it(`are what the pinned KaTeX's katex.css gives; run \`${GENERATE_KATEX_CSS}\` after upgrading it`, async () => {
    expect(committed).toEqual(await generatedKatexStylesheets());
  });

  it('keep KaTeX’s rules apart from its fonts, and load nothing in the rules', () => {
    expect(committed.layout).not.toContain('@font-face');
    expect(committed.layout).not.toMatch(/url\(|@import/);
    expect(committed.layout).toMatch(/\.katex-display\s*\{/);
  });

  it('name each font by its woff2 file alone, a file of the app’s that is never inlined', () => {
    const faces = [...committed.fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
      (face) => face[1] ?? '',
    );
    expect(faces).toHaveLength(20);
    for (const face of faces) {
      const sources = [...face.matchAll(/url\('([^']+)'\)\s*format\('([^']+)'\)/g)];
      expect(sources).toHaveLength(1);
      const [, url = '', kind] = sources[0] ?? [];
      expect(kind).toBe('woff2');
      expect(url).toMatch(
        /^\.\.\/\.\.\/node_modules\/katex\/dist\/fonts\/KaTeX_[\w-]+\.woff2\?no-inline$/,
      );
      expect(existsSync(resolve(KATEX_CSS_FILES.fonts, '..', url.replace(/\?.*/, '')))).toBe(true);
    }
  });

  it('are taken by the app’s page, the rules by each panel that draws Math', () => {
    const source = (path: string) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
    expect(source('../main.tsx')).toContain("import './text/katex-fonts.css';");
    expect(source('./MathFormula.tsx')).toContain("import './katex.css';");
  });
});
