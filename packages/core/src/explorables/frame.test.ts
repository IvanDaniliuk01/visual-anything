import fc from 'fast-check';
import { parse } from 'parse5';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_HTTP_EQUIV, buildFrame, cspHash, explorablePage, framePolicy } from './frame';
import type { FrameInput } from './types';

const HTML = 'http://www.w3.org/1999/xhtml';
const APP = 'http://127.0.0.1:47700';

interface Found {
  scripts: { text: string; namespace: string; src: boolean }[];
  styles: { text: string; namespace: string }[];
  metas: Record<string, string>[];
  handlers: string[];
}

/** What a browser's HTML parser finds in a document: parse5 follows the HTML standard's parser. */
function found(html: string): Found {
  const result: Found = { scripts: [], styles: [], metas: [], handlers: [] };
  type Node = {
    nodeName: string;
    tagName?: string;
    namespaceURI?: string;
    attrs?: { name: string; value: string }[];
    childNodes?: Node[];
    content?: Node;
    value?: string;
  };
  const textOf = (node: Node) =>
    (node.childNodes ?? [])
      .filter((child) => child.nodeName === '#text')
      .map((child) => child.value ?? '')
      .join('');
  const walk = (node: Node) => {
    const attrs = node.attrs ?? [];
    for (const attr of attrs) if (/^on/i.test(attr.name)) result.handlers.push(attr.value);
    if (node.tagName === 'script') {
      result.scripts.push({
        text: textOf(node),
        namespace: node.namespaceURI ?? '',
        src: attrs.some((attr) => attr.name === 'src'),
      });
    }
    if (node.tagName === 'style') {
      result.styles.push({ text: textOf(node), namespace: node.namespaceURI ?? '' });
    }
    if (node.tagName === 'meta') {
      result.metas.push(Object.fromEntries(attrs.map((attr) => [attr.name, attr.value])));
    }
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(parse(html, { scriptingEnabled: true }) as unknown as Node);
  return result;
}

function input(text: string, libraries: string[] = [], runtime = 'va.start();'): FrameInput {
  return {
    text,
    runtime,
    appOrigin: APP,
    scriptLibraries: libraries.map((code, at) => ({ global: `lib${at}`, text: code })),
  };
}

/** The policy's directives, by name. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((part) => {
      const [name, ...values] = part.split(' ');
      return [name as string, values];
    }),
  );
}

/** Text that is no markup at all, with the characters that matter to HTML's states. */
const plain = fc
  .array(
    fc.constantFrom(
      'a',
      'Z',
      ' ',
      '\n',
      '\r',
      '\r\n',
      '\0',
      '-',
      '!',
      '>',
      '"',
      "'",
      '/',
      '=',
      '&amp;',
      '< ',
      'é',
      '😀',
    ),
    { maxLength: 12 },
  )
  .map((parts) => parts.join(''));

/** What a script's text may hold, the sequences that move the tokenizer's script states among them. */
const scriptText = fc
  .array(
    fc.constantFrom(
      'x = 1;',
      ' ',
      '\n',
      '\r',
      '\r\n',
      '\0',
      '"',
      "'",
      '<',
      '-',
      '>',
      '/',
      '!',
      '<!--',
      '-->',
      '--!>',
      '<script>',
      '<script ',
      '<SCRIPT>',
      '<scriptx>',
      '</script',
      '</script >',
      '</SCRIPT>',
      '</scriptx>',
      '</script1>',
      '<\\/script>',
      '<!-',
      '</',
      '</style>',
    ),
    { maxLength: 14 },
  )
  .map((parts) => parts.join(''));

const attributeValue = fc
  .array(fc.constantFrom('a', '>', '<script>', 'x()', '</script>', ' ', '\0', '-->'), {
    maxLength: 5,
  })
  .map((parts) => parts.join(''));

/** A piece of an explorable page, as authors and Claude write them, and the tricks they may hold. */
const piece: fc.Arbitrary<string> = fc.oneof(
  plain,
  scriptText.map((body) => `<script>${body}</script>`),
  scriptText.map((body) => `<script type="module">${body}</script>`),
  scriptText.map((body) => `<script src="x.js">${body}</script>`),
  scriptText.map((body) => `<ScRiPt defer>${body}</sCrIpT>`),
  scriptText.map((body) => `<style>${body}</style>`),
  scriptText.map((body) => `<!--${body}-->`),
  scriptText.map((body) => `<textarea>${body}</textarea>`),
  scriptText.map((body) => `<title>${body}</title>`),
  scriptText.map((body) => `<noscript>${body}</noscript>`),
  scriptText.map((body) => `<xmp>${body}</xmp>`),
  scriptText.map((body) => `<template><script>${body}</script></template>`),
  attributeValue.map((value) => `<div title="${value.replace(/"/g, '')}">`),
  attributeValue.map((value) => `<p data-x='${value.replace(/'/g, '')}'>`),
  attributeValue.map((value) => `<img alt=${value.replace(/[\s>]/g, '') || 'x'} onerror="f()">`),
  fc.constantFrom(
    '<!-->',
    '<!--->',
    '<!---->',
    '<!-- a --!> b -->',
    '<!doctype html>',
    '<!DOCTYPE html PUBLIC "a>b">',
    '<?xml x>',
    '</ x>',
    '</>',
    '<html lang="en">',
    '<head>',
    '</head>',
    '<body>',
    '</div>',
    '</p>',
    '<meta http-equiv="Content-Security-Policy" content="script-src *">',
    '<META HTTP-EQUIV=refresh content="0;url=http://example.com">',
    '<meta charset="utf-8">',
    '<svg viewBox="0 0 10 10"><rect width="5" height="5"/><text>a</text></svg>',
    '<svg><foreignObject><p>x</p></foreignObject></svg>',
    '<svg><foreignObject><script>in.html()</script></foreignObject></svg>',
    '<math><mi>x</mi></math>',
    '<svg><p>out</p>',
    '<a href="javascript:alert(1)">link</a>',
    '<button onclick="alert(1)">b</button>',
  ),
);

const page = fc.array(piece, { maxLength: 10 }).map((pieces) => pieces.join(''));

function sorted(texts: string[]): string[] {
  return [...texts].sort();
}

describe('the frame builder', () => {
  it('puts the runtime, the libraries in order, then the explorable, under one policy', () => {
    const frame = buildFrame(
      input('<!doctype html><p>Hi</p><script>draw()</script><style>p{color:red}</style>', [
        'window.d3 = {};',
        'window.katex = {};',
      ]),
    );
    expect(frame.html.startsWith('<!DOCTYPE html><html><head><meta charset="utf-8"><script>')).toBe(
      true,
    );
    const seen = found(frame.html);
    expect(seen.scripts.map((each) => each.text)).toEqual([
      'va.start();',
      'window.d3 = {};',
      'window.katex = {};',
      'draw()',
    ]);
    expect(frame.scriptHashes).toEqual(seen.scripts.map((each) => cspHash(each.text)));
    expect(frame.styleHashes).toEqual([cspHash('p{color:red}')]);
    expect(frame.policy).toBe(
      [
        "default-src 'none'",
        `script-src 'report-sample' ${frame.scriptHashes.map((hash) => `'${hash}'`).join(' ')}`,
        `style-src 'report-sample' '${cspHash('p{color:red}')}'`,
        'img-src data: blob:',
        'font-src data:',
        "connect-src 'none'",
        "worker-src 'none'",
        "child-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        `frame-ancestors ${APP}`,
        'sandbox allow-scripts',
      ].join('; '),
    );
  });

  it('hashes as the browser does: known SHA-256 sources', () => {
    // The digest of "alert('Hello, world.');", as CSP's own specification gives it.
    expect(cspHash("alert('Hello, world.');")).toBe(
      'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=',
    );
  });

  it('allows no style when the page has none', () => {
    const frame = buildFrame(input('<p>x</p>'));
    expect(directives(frame.policy).get('style-src')).toEqual(["'none'"]);
  });

  it('makes line endings LF and escapes NUL before hashing', () => {
    const frame = buildFrame(input('<script>a\r\nb\rc"\0"</script>', ['x\r\n"\0"'], 'r\r\n'));
    expect(frame.html).not.toMatch(/[\r\0]/);
    const seen = found(frame.html).scripts.map((each) => each.text);
    expect(seen).toEqual(['r\n', 'x\n"\\x00"', 'a\nb\nc"\\x00"']);
    expect(frame.scriptHashes).toEqual(seen.map(cspHash));
  });

  it('keeps a library whole whatever it holds', () => {
    const library = 'var a = "</script><script>evil()</script>"; /* <!-- <script> */ b = 1 <!--x;';
    const frame = buildFrame(input('', [library]));
    const seen = found(frame.html).scripts;
    expect(seen).toHaveLength(2);
    expect(seen[1]?.text).toBe(
      'var a = "<\\/script><script>evil()<\\/script>"; /* <\\x21-- <script> */ b = 1 <\\x21--x;',
    );
  });

  it('refuses an origin that could add to the policy, and text past its cap', () => {
    for (const appOrigin of [
      'http://127.0.0.1:47700; script-src *',
      "http://127.0.0.1 'unsafe-inline'",
      '*',
      'http://127.0.0.1:47700/',
      '',
    ]) {
      expect(() => buildFrame({ ...input(''), appOrigin })).toThrow(/origin/);
    }
    expect(() => buildFrame(input('x'.repeat(512 * 1024 + 1)))).toThrow(/at most/);
    expect(() => framePolicy(['sha256-x'], [], APP)).toThrow(/SHA-256/);
    expect(() =>
      buildFrame({ ...input(''), scriptLibraries: [{ global: 'a b', text: '' }] }),
    ).toThrow(/global/);
  });

  describe('what the explorable’s text cannot smuggle', () => {
    const smuggled = (text: string) => {
      const frame = buildFrame(input(text));
      const policy = directives(frame.policy);
      const allowed = new Set([
        ...(policy.get('script-src') ?? []),
        ...(policy.get('style-src') ?? []),
      ]);
      return { frame, seen: found(frame.html), allowed };
    };

    it('ends a script where HTML does, so a string holding </script> hashes what runs', () => {
      const { frame, seen } = smuggled(
        '<script>var s = "</script><script>more()</script>";</script>',
      );
      const page = seen.scripts.slice(1).map((each) => each.text);
      expect(page).toEqual(['var s = "', 'more()']);
      expect(frame.scriptHashes.slice(1)).toEqual(page.map(cspHash));
    });

    it('hashes nothing in comments, attributes, raw text or a script with src', () => {
      const { allowed } = smuggled(
        '<!-- <script>a()</script> --><div title="<script>b()</script>"></div>' +
          '<textarea><script>c()</script></textarea><noscript><script>d()</script></noscript>' +
          '<xmp><script>e()</script></xmp><script src="x.js">f()</script>',
      );
      for (const code of ['a()', 'b()', 'c()', 'd()', 'e()', 'f()']) {
        expect(allowed.has(`'${cspHash(code)}'`)).toBe(false);
      }
    });

    it('never lets event handlers, style attributes or javascript: addresses run', () => {
      const { frame, seen } = smuggled(
        '<img src=x onerror="alert(1)"><a href="javascript:alert(2)">a</a>' +
          '<p style="color:red" onclick=alert(3)>p</p><svg onload="alert(4)"></svg>',
      );
      expect(seen.handlers).toHaveLength(3);
      expect(frame.policy).not.toMatch(/unsafe|\*|'self'/);
      const scripts = directives(frame.policy).get('script-src') ?? [];
      expect(scripts.every((each) => each === "'report-sample'" || /^'sha256-/.test(each))).toBe(
        true,
      );
      for (const code of ['alert(1)', 'alert(3)', 'alert(4)', 'color:red']) {
        expect(frame.policy).not.toContain(cspHash(code));
      }
    });

    it('makes every <meta http-equiv> inert', () => {
      const { seen } = smuggled(
        '<meta http-equiv="Content-Security-Policy" content="script-src *">' +
          '<META HTTP-EQUIV=refresh content="0;url=http://example.com"><meta charset=utf-8>',
      );
      expect(seen.metas.every((meta) => !('http-equiv' in meta))).toBe(true);
      expect(seen.metas.filter((meta) => NEUTRAL_HTTP_EQUIV in meta)).toHaveLength(2);
    });

    it('leaves a script inside SVG unhashed, so it does not run', () => {
      const { allowed } = smuggled('<svg><script>svg()</script></svg>');
      expect(allowed.has(`'${cspHash('svg()')}'`)).toBe(false);
    });

    it('reads the escaped states of a script as HTML does', () => {
      const text = '<script><!--<script></script>still()--></script><script>next()</script>';
      const { frame, seen } = smuggled(text);
      const page = seen.scripts.slice(1).map((each) => each.text);
      expect(page).toEqual(['<!--<script></script>still()-->', 'next()']);
      expect(frame.scriptHashes.slice(1)).toEqual(page.map(cspHash));
    });
  });

  describe('properties', () => {
    it('keeps the runtime and every library one hashed script whatever any of them hold', () => {
      fc.assert(
        fc.property(
          scriptText,
          fc.array(scriptText, { maxLength: 3 }),
          fc.oneof(page, fc.string({ maxLength: 60 })),
          (runtime, libraries, text) => {
            const frame = buildFrame(input(text, libraries, runtime));
            expect(frame.html).not.toMatch(/[\r\0]/);
            const seen = found(frame.html).scripts.slice(0, 1 + libraries.length);
            expect(seen.every((each) => each.namespace === HTML && !each.src)).toBe(true);
            expect(seen.map((each) => cspHash(each.text))).toEqual(
              frame.scriptHashes.slice(0, 1 + libraries.length),
            );
          },
        ),
        { numRuns: 300 },
      );
    });

    it('covers every inline script and style a page holds, and nothing else, by a hash', () => {
      fc.assert(
        fc.property(page, (text) => {
          const frame = buildFrame(input(text));
          const seen = found(frame.html);
          const scripts = seen.scripts
            .slice(1)
            .filter((each) => each.namespace === HTML && !each.src)
            .map((each) => each.text);
          const styles = seen.styles
            .filter((each) => each.namespace === HTML)
            .map((each) => each.text);
          expect(sorted(frame.scriptHashes.slice(1))).toEqual(sorted(scripts.map(cspHash)));
          expect(sorted(frame.styleHashes)).toEqual(sorted(styles.map(cspHash)));
          expect(seen.metas.every((meta) => !('http-equiv' in meta))).toBe(true);
        }),
        { numRuns: 500 },
      );
    });

    it('serves a policy that allows nothing but hashes and the app, whatever the text', () => {
      fc.assert(
        fc.property(fc.oneof(page, fc.string({ maxLength: 200 })), (text) => {
          const frame = buildFrame(input(text));
          const policy = directives(frame.policy);
          expect([...policy.keys()]).toEqual([
            'default-src',
            'script-src',
            'style-src',
            'img-src',
            'font-src',
            'connect-src',
            'worker-src',
            'child-src',
            'frame-src',
            'object-src',
            'base-uri',
            'form-action',
            'frame-ancestors',
            'sandbox',
          ]);
          for (const name of ['script-src', 'style-src']) {
            const values = policy.get(name) ?? [];
            expect(
              values.every(
                (each) =>
                  each === "'report-sample'" ||
                  each === "'none'" ||
                  /^'sha256-[A-Za-z0-9+/]{43}='$/.test(each),
              ),
            ).toBe(true);
          }
          expect(policy.get('script-src')?.slice(1)).toEqual([
            ...new Set(frame.scriptHashes.map((hash) => `'${hash}'`)),
          ]);
          expect(policy.get('sandbox')).toEqual(['allow-scripts']);
          expect(policy.get('frame-ancestors')).toEqual([APP]);
        }),
        { numRuns: 300 },
      );
    });

    it('writes a page without markup as it was written, but for line endings and NUL', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (raw) => {
          const text = raw.replace(/</g, '');
          expect(explorablePage(text).html).toBe(
            text.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD'),
          );
        }),
        { numRuns: 300 },
      );
    });
  });
});
