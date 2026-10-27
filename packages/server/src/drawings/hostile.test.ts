/**
 * Hostile HTML (ADR 0068): scripts in every place HTML allows one, handlers, `javascript:` and `data:`
 * addresses, frames, forms, styles that load, `url()`, `@import`, `<base>`, `<meta http-equiv>`,
 * `srcset`, SVG and MathML inside HTML, entities, deep nesting, huge files and style bombs. Each is
 * dropped or refused; nothing runs, nothing is fetched, and every drawing made is what the core's
 * cleaner keeps. Each is made within a CPU-time budget, measured as the process's time, so that a busy
 * machine does not fail it.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { cleanSvg } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HTML_CAPS } from './caps';
import { makeDrawing } from './make';
import { renderDrawing } from './render';
import { cpuNow } from './test/cpu';

const SIZE = HTML_CAPS.input;

/** What a page could do if anything in it ran, or loaded: each would leave its mark. */
const RAN = 'globalThis.__ran = true';

const HOSTILE: readonly [string, string][] = [
  ['a script', `<p>x</p><script>${RAN}</script>`],
  ['a script in the head', `<head><script src="https://example.com/x.js"></script></head><p>x</p>`],
  ['a script after the body', `<body><p>x</p></body><script>${RAN}</script>`],
  ['a script in a table', `<table><script>${RAN}</script><tr><td>x</td></tr></table>`],
  ['a script in SVG', `<svg><script>${RAN}</script><circle r="4"/></svg><p>x</p>`],
  ['a script in a template', `<template><script>${RAN}</script></template><p>x</p>`],
  ['a script in noscript', `<noscript><script>${RAN}</script><p>n</p></noscript><p>x</p>`],
  ['a module script', `<script type="module">import "https://example.com/x.js"</script><p>x</p>`],
  [
    'handlers',
    `<p onclick="${RAN}" onmouseover="${RAN}" onload="${RAN}">x</p><body onload="${RAN}">`,
  ],
  [
    'javascript: and data: addresses',
    `<a href="javascript:${RAN}">x</a><a href="data:text/html,<script>${RAN}</script>">y</a>`,
  ],
  [
    'frames',
    `<iframe src="https://example.com/"></iframe><iframe srcdoc="<script>${RAN}</script>"></iframe><frameset><frame src="x"></frameset><p>x</p>`,
  ],
  [
    'objects and embeds',
    `<object data="https://example.com/x.swf"></object><embed src="x.swf"><applet code="x"></applet><p>x</p>`,
  ],
  [
    'forms',
    `<form action="https://example.com/"><input name="a" value="b" autofocus onfocus="${RAN}"><button formaction="x">b</button><select><option>o</option></select><textarea>t</textarea></form><p>x</p>`,
  ],
  [
    'pictures',
    `<img src="https://example.com/x.png" onerror="${RAN}"><img srcset="https://example.com/a.png 1x"><picture><source srcset="x.webp"></picture><video poster="x.png" src="x.mp4"></video><audio src="x.mp3"></audio><canvas></canvas><p>x</p>`,
  ],
  [
    'links, bases and refreshes',
    `<head><link rel="stylesheet" href="https://example.com/x.css"><link rel="preload" href="x"><base href="https://example.com/"><meta http-equiv="refresh" content="0;url=https://example.com/"><meta http-equiv="Content-Security-Policy" content="x"></head><p>x</p>`,
  ],
  [
    'styles that load',
    `<style>@import url("https://example.com/x.css"); @import "y.css"; @font-face { font-family: X; src: url(https://example.com/x.woff) } p { background: url(https://example.com/x.png); background-image: url('x.png'); list-style-image: url(x.png); border-image: url(x.png) 30; cursor: url(x.cur), auto; mask: url(#m); content: url(x.png) }</style><p style="background-image: url(https://example.com/y.png); behavior: url(x.htc); -moz-binding: url(x.xml#y)">x</p>`,
  ],
  [
    'styles that hide an address',
    `<p style="background: u\\72l(https://example.com/x.png); color: expression(${RAN}); background-image: image-set('x.png' 1x); background: -webkit-image-set(url(x.png) 1x)">x</p>`,
  ],
  [
    'styles in comments and strings',
    `<style>/* p { color: red } */ p::after { content: "url(https://example.com/)" } .a { color: "}" }</style><p class="a">x</p>`,
  ],
  [
    'media and other @ rules',
    `<style>@media screen { p { background: url(x.png) } } @supports (display: grid) { p { color: red } } @keyframes k { from { color: red } } @layer a { p { color: red } } @namespace svg url(http://www.w3.org/2000/svg); @charset "utf-8";</style><p>x</p>`,
  ],
  [
    'SVG and MathML inside HTML',
    `<svg><foreignObject><p>x</p></foreignObject><image href="https://example.com/x.png"/><a href="javascript:x"><text>t</text></a><use href="https://example.com/x.svg#a"/></svg><math><mtext><img src="x"></mtext><maction actiontype="statusline">m</maction></math><p>x</p>`,
  ],
  [
    'entities',
    `<p>&lt;script&gt;${RAN}&lt;/script&gt; &amp;amp; &#x3C;img src=x&#x3E; &notanentity; &#0; &#xD800; &#1114112;</p>`,
  ],
  [
    'comments and processing instructions',
    `<!-- <script>${RAN}</script> --><?xml-stylesheet href="https://example.com/x.css"?><![CDATA[<script>${RAN}</script>]]><p>x</p><!--> <img src=x> -->`,
  ],
  ['doctype with an outside DTD', `<!DOCTYPE html SYSTEM "https://example.com/x.dtd"><p>x</p>`],
  [
    'custom elements and slots',
    `<my-widget onclick="${RAN}"><template shadowrootmode="open"><script>${RAN}</script></template></my-widget><dialog open>d</dialog><details open><summary>s</summary>d</details><slot>s</slot><p>x</p>`,
  ],
  [
    'tags in odd case and odd places',
    `<P ONCLICK="${RAN}">x</P><sCrIpT>${RAN}</ScRiPt><div/onclick="${RAN}">y</div><div onclick =${RAN}>z</div>`,
  ],
  [
    'attributes past the cap',
    `<p ${Array.from({ length: 2000 }, (_, at) => `a${at}="javascript:x"`).join(' ')} onclick="${RAN}">x</p>`,
  ],
  ['deep nesting', `${'<div>'.repeat(127)}x`],
  ['nesting past the reader', '<div>'.repeat(SIZE / 5)],
  ['a huge file', `<p>${'word '.repeat((SIZE - 10) / 5)}</p>`],
  ['a file of nothing but tags', '<span></span>'.repeat(SIZE / 13)],
  [
    'a style bomb',
    `<style>${'p { color: red; color: blue; color: green; color: red; color: blue }'.repeat(255)}</style>${'<p>x</p>'.repeat(5000)}`,
  ],
  [
    'many selectors',
    `<style>${Array.from({ length: 255 }, (_, rule) => `${Array.from({ length: 16 }, (_, at) => `.c${rule}x${at}`).join(',')}{color:red}`).join('')}</style><p class="${Array.from({ length: 4000 }, (_, at) => `c${at % 255}x${at % 16}`).join(' ')}">x</p>`,
  ],
];

/** What no drawing may hold: the ways a picture could run something or load something. */
const NEVER = [
  /<script/i,
  /javascript:/i,
  // Any address but SVG's own namespace.
  /https?:\/\/(?!www\.w3\.org\/2000\/svg")/,
  /url\((?!#)/,
  /<image/i,
  /<foreignObject/i,
  /href=/i,
  /\bon[a-z]+=/i,
  /<text/i,
];

describe('hostile HTML, read, cleaned and drawn', () => {
  let attempts: string[] = [];

  beforeEach(() => {
    attempts = [];
    const refuse = (name: string) => () => {
      attempts.push(name);
      throw new Error('no network');
    };
    vi.stubGlobal('fetch', refuse('fetch'));
    vi.spyOn(http, 'request').mockImplementation(refuse('http.request'));
    vi.spyOn(http, 'get').mockImplementation(refuse('http.get'));
    vi.spyOn(https, 'request').mockImplementation(refuse('https.request'));
    vi.spyOn(https, 'get').mockImplementation(refuse('https.get'));
    vi.spyOn(net, 'connect').mockImplementation(refuse('net.connect'));
    vi.spyOn(dns, 'lookup').mockImplementation(refuse('dns.lookup'));
    delete (globalThis as { __ran?: boolean }).__ran;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(HOSTILE)(
    '%s: drops it, runs and fetches nothing, within its budget',
    async (_name, html) => {
      expect(Buffer.byteLength(html)).toBeLessThanOrEqual(SIZE);
      const started = cpuNow();
      const outcome = await renderDrawing(html, 400);
      const took = cpuNow() - started;
      expect(took).toBeLessThan(2_000);
      expect(attempts).toEqual([]);
      expect((globalThis as { __ran?: boolean }).__ran).toBeUndefined();
      if (!outcome.ok) {
        expect(outcome.problem.code).toBe('image-too-large');
        return;
      }
      for (const never of NEVER) expect(outcome.svg).not.toMatch(never);
      const cleaned = cleanSvg(outcome.svg);
      if (cleaned.ok) {
        for (const never of NEVER) expect(cleaned.value.svg).not.toMatch(never);
      } else {
        expect(cleaned.problem.code).toBe('image-too-large');
      }
    },
  );

  it('reports what it drops, in the core’s words', async () => {
    const outcome = await renderDrawing(
      `<script>${RAN}</script><p onclick="${RAN}">See <a href="javascript:x">this</a></p><iframe></iframe><style>@import url(x.css); p { background: url(x.png) }</style>`,
      400,
    );
    expect(outcome).toMatchObject({
      ok: true,
      report: [
        '1 @ rule',
        '1 value that is not allowed',
        '1 script element',
        '1 event handler attribute',
        '1 a element unwrapped, its contents kept',
        '1 outside reference',
        '1 iframe element',
      ],
    });
  });
});

describe('hostile HTML through the drawing’s worker', () => {
  it.each(
    HOSTILE.filter(([name]) =>
      [
        'a script',
        'handlers',
        'styles that load',
        'pictures',
        'frames',
        'nesting past the reader',
        'a style bomb',
      ].includes(name),
    ),
  )(
    '%s: made or refused in the worker, which reaches no network',
    async (_name, html) => {
      const made = await makeDrawing(html, 400);
      // The worker answers how often anything tried to reach the network, and a drawing it made after
      // any attempt is refused as program-failed: only image-too-large may refuse these.
      if (!made.ok) expect(made.problems.map((each) => each.code)).toEqual(['image-too-large']);
      else for (const never of NEVER) expect(made.svg).not.toMatch(never);
    },
    60_000,
  );
});
