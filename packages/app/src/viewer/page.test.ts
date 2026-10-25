import { createHash } from 'node:crypto';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { PAGE_DATA_ID, pageDataOf, readPageData } from './data';
import { LARGE_PAGE, PAGE_POLICY_RULES, pageTitle, writePage, type ViewerAssets } from './page';

const sample = loadSample();

const ASSETS: ViewerAssets = {
  script: 'document.body.dataset.viewer = "ready";',
  style: ':root { color: CanvasText; }',
};

function hashOf(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** The policy a page's `<meta>` gives, by directive. */
function policyOf(html: string): Map<string, string[]> {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!meta) throw new Error('The page has no policy.');
  return new Map(
    (meta[1] ?? '').split(';').map((directive) => {
      const [name = '', ...values] = directive.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

/** Every `<script>` and `<style>` of a page: its attributes and what it holds. */
function elementsOf(html: string, tag: 'script' | 'style'): { attributes: string; body: string }[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi'))].map(
    ([, attributes = '', body = '']) => ({ attributes, body }),
  );
}

describe('The read-only page', () => {
  it('is one file: the viewer inline, the project as data, and nothing it loads', async () => {
    const { html } = await writePage({
      assets: ASSETS,
      data: pageDataOf(sample),
      title: 'My systems',
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\bhref\s*=/i);
    const scripts = elementsOf(html, 'script');
    expect(scripts.map((each) => each.attributes.trim())).toEqual([
      '',
      `type="application/json" id="${PAGE_DATA_ID}"`,
      'type="module"',
    ]);
    expect(scripts[2]?.body).toBe(ASSETS.script);
    expect(elementsOf(html, 'style').map((each) => each.body)).toEqual([ASSETS.style]);
  });

  it('runs only its own scripts and styles, by their hashes, and connects nowhere', async () => {
    const { html, policy } = await writePage({
      assets: ASSETS,
      data: pageDataOf(sample),
      title: 'My systems',
    });
    const directives = policyOf(html);
    expect([...directives.keys()]).toEqual(PAGE_POLICY_RULES.map(([name]) => name));
    expect(directives.get('default-src')).toEqual(["'none'"]);
    const [firstPaint, , viewer] = elementsOf(html, 'script');
    expect(directives.get('script-src')).toEqual([
      hashOf(firstPaint?.body ?? ''),
      hashOf(viewer?.body ?? ''),
    ]);
    expect(directives.get('style-src')).toEqual([hashOf(ASSETS.style)]);
    expect(directives.get('img-src')).toEqual(['data:', 'blob:']);
    expect(directives.get('connect-src')).toEqual(["'none'"]);
    expect(directives.get('worker-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'none'"]);
    expect(directives.get('require-trusted-types-for')).toEqual(["'script'"]);
    expect(directives.get('trusted-types')).toEqual(['default']);
    expect(policy).not.toMatch(/unsafe|'self'|https?:|\*|ws:|wss:|'strict-dynamic'|nonce/);
    // The policy comes before anything it governs.
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.search(/<(script|style)\b/));
  });

  it('keeps its data from closing the element it is in', async () => {
    const hostile = '</script><script>alert(1)</script><!-- & \u2028';
    const named = {
      ...sample,
      model: {
        ...sample.model,
        elements: sample.model.elements.map((element, at) =>
          at === 0 ? { ...element, name: hostile } : element,
        ),
      },
    };
    const { html } = await writePage({ assets: ASSETS, data: pageDataOf(named), title: 'x' });
    expect(elementsOf(html, 'script')).toHaveLength(3);
    const data = elementsOf(html, 'script')[1]?.body ?? '';
    expect(data).not.toMatch(/[<>&\u2028]/);
    const read = readPageData(data, validateFile);
    if (!read.ok) throw new Error(read.problems.join('\n'));
    expect(read.project.model.elements[0]?.name).toBe(hostile);
  });

  it('escapes what in the viewer’s script would end it early, and hashes it as escaped', async () => {
    const script = 'const a = "</script>"; const b = "<!-- x"; const c = /<\\/SCRIPT/;';
    const { html } = await writePage({
      assets: { ...ASSETS, script },
      data: pageDataOf(sample),
      title: 'x',
    });
    const viewer = elementsOf(html, 'script')[2]?.body ?? '';
    expect(viewer).not.toMatch(/<\/script|<!--/i);
    expect(viewer).toBe('const a = "<\\/script>"; const b = "<\\x21-- x"; const c = /<\\/SCRIPT/;');
    expect(policyOf(html).get('script-src')).toContain(hashOf(viewer));
  });

  it('writes what the browser would read otherwise as escapes, so that the hash still matches', async () => {
    const nul = String.fromCharCode(0);
    const script = `const d = "a${nul}b"; const e = \`x\r\ny\`;`;
    const { html } = await writePage({
      assets: { ...ASSETS, script },
      data: pageDataOf(sample),
      title: 'x',
    });
    const viewer = elementsOf(html, 'script')[2]?.body ?? '';
    expect(viewer).toBe('const d = "a\\x00b"; const e = `x\\r\ny`;');
    expect(viewer).not.toMatch(/[\0\r]/);
    expect(policyOf(html).get('script-src')).toContain(hashOf(viewer));
  });

  it('refuses a style that would end its element', async () => {
    await expect(
      writePage({
        assets: { ...ASSETS, style: 'a{}</style><script>' },
        data: pageDataOf(sample),
        title: 'x',
      }),
    ).rejects.toThrow();
  });

  it('writes the project’s name as its title, as text', async () => {
    const { html } = await writePage({
      assets: ASSETS,
      data: pageDataOf(sample),
      title: pageTitle('<b>Shop</b> & "co"'),
    });
    expect(html).toContain(
      '<title>&lt;b&gt;Shop&lt;/b&gt; &amp; &quot;co&quot; · Visual Anything</title>',
    );
  });

  it('says how large it is, and whether that is past what the export warns about', async () => {
    const small = await writePage({ assets: ASSETS, data: pageDataOf(sample), title: 'x' });
    expect(small.bytes).toBe(new TextEncoder().encode(small.html).length);
    expect(small.large).toBe(false);
    const large = await writePage({
      assets: { ...ASSETS, script: `/*${'x'.repeat(LARGE_PAGE)}*/` },
      data: pageDataOf(sample),
      title: 'x',
    });
    expect(large.large).toBe(true);
  });
});
