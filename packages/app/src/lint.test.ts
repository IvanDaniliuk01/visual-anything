import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const config = (await import(pathToFileURL(join(ROOT, 'eslint.config.js')).href)) as {
  default: Linter.Config[];
  pageSafety: Linter.Config;
};

/** Lints with the page-safety rules alone, without type information, so that it runs on any text. */
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    },
    config.pageSafety,
  ],
});

/** The rules that code breaks, linted as a file of the app. */
async function broken(
  code: string,
  file = 'packages/app/src/canvas/example.tsx',
): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, file) });
  return (result?.messages ?? []).map((message) => message.ruleId ?? message.message);
}

describe('the lint rules that keep markup out of the page', () => {
  it('are part of the project’s configuration', () => {
    expect(config.default).toContain(config.pageSafety);
  });

  it.each([
    ['innerHTML', 'element.innerHTML = text;', 'no-restricted-properties'],
    ['outerHTML', 'element.outerHTML = text;', 'no-restricted-properties'],
    [
      'insertAdjacentHTML',
      "element.insertAdjacentHTML('beforeend', text);",
      'no-restricted-properties',
    ],
    ['setHTMLUnsafe', 'element.setHTMLUnsafe(text);', 'no-restricted-properties'],
    [
      'createContextualFragment',
      'range.createContextualFragment(text);',
      'no-restricted-properties',
    ],
    ['srcdoc', 'frame.srcdoc = text;', 'no-restricted-properties'],
    ['document.write', 'document.write(text);', 'no-restricted-properties'],
    ['document.writeln', 'document.writeln(text);', 'no-restricted-properties'],
    [
      'dangerouslySetInnerHTML',
      'const e = <div dangerouslySetInnerHTML={{ __html: text }} />;',
      'no-restricted-syntax',
    ],
    ['srcDoc', 'const e = <iframe srcDoc={text} />;', 'no-restricted-syntax'],
    ['Graphics.svg', 'graphics.svg(text);', 'no-restricted-syntax'],
    ['parseHTMLUnsafe', 'Document.parseHTMLUnsafe(text);', 'no-restricted-syntax'],
    [
      'DOMParser',
      "new DOMParser().parseFromString(text, 'image/svg+xml');",
      'no-restricted-syntax',
    ],
    [
      'parseAsGraphicsContext',
      'Assets.load({ src, data: { parseAsGraphicsContext: true } });',
      'no-restricted-syntax',
    ],
    ['HTMLText', "import { HTMLText } from 'pixi.js';", 'no-restricted-imports'],
    ['HTMLTextStyle', "import { HTMLTextStyle, Text } from 'pixi.js';", 'no-restricted-imports'],
    ['DOMContainer', "import { DOMContainer } from 'pixi.js';", 'no-restricted-imports'],
    ['pixi.js/text-html', "import 'pixi.js/text-html';", 'no-restricted-imports'],
    ['pixi.js/dom', "import { DOMContainer } from 'pixi.js/dom';", 'no-restricted-imports'],
  ])('refuse %s outside tests', async (_name, code, rule) => {
    expect(await broken(code)).toContain(rule);
    expect(await broken(code, 'packages/app/src/canvas/example.test.tsx')).toEqual([]);
  });

  it('let the app write text as text, and draw with canvas text', async () => {
    expect(
      await broken(
        "import { BitmapText, Graphics, Text } from 'pixi.js';\nelement.textContent = text;\nconst e = <div title={text}>{text}</div>;\ngraphics.texture(texture);",
      ),
    ).toEqual([]);
  });
});
