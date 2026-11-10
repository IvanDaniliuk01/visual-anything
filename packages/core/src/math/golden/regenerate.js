// Records Chrome's measurements of KaTeX's own HTML, which the golden test compares the layout with
// (ADR 0106). It renders every formula of a corpus with katex.render in headless Chrome and records,
// relative to the formula's origin (the left of its content, on its baseline), each glyph's pen x and
// baseline, each rule's box and each SVG piece's clipped box, in px, with the KaTeX em forced to PXEM.
//
// Not part of the test run. Run it only when KaTeX is upgraded, on a machine with Chrome installed and
// puppeteer-core reachable (`pnpm add -D puppeteer-core` in a scratch checkout, not committed):
//
//   CORPUS=corpus PXEM=16 node packages/core/src/math/golden/regenerate.js
//
// for CORPUS in corpus and corpus2 and PXEM in 16, 13, 19.36 and 24 (16 writes the file without a px
// suffix). CHROME names Chrome's executable if it is not at Windows' default path. Then format the
// files with `pnpm exec prettier --write packages/core/src/math/golden` and run the golden test; the
// upgrade lands only when it passes.
/* global process, console, document, NodeFilter, getComputedStyle, katex */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { default: puppeteer } = await import('puppeteer-core');
const C = process.env.CORPUS || 'corpus';
const EM = +(process.env.PXEM || 16); // px per KaTeX em
const SUF = EM === 16 ? '' : `-${EM}px`;
const corpus = JSON.parse(fs.readFileSync(path.join(here, `${C}.json`), 'utf8'));

const dist = path.dirname(createRequire(import.meta.url).resolve('katex'));
let css = fs.readFileSync(path.join(dist, 'katex.min.css'), 'utf8');
// Inline the woff2 fonts and drop the woff/ttf fallbacks.
css = css.replace(
  /src:url\(fonts\/([^)]+)\.woff2\) format\("woff2"\)(,url\([^)]+\) format\("[^"]+"\))*/g,
  (_, name) => {
    const b64 = fs.readFileSync(path.join(dist, 'fonts', name + '.woff2')).toString('base64');
    return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
  },
);
const js = fs.readFileSync(path.join(dist, 'katex.min.js'), 'utf8');
const html = `<!DOCTYPE html><html><head><style>${css}
body{margin:0;white-space:nowrap} #c{width:4000px} #c .katex{font-size:${EM}px} .f{margin:0 0 40px 20px}
</style><script>${js}</script></head><body><div id="c"></div></body></html>`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-first-run', '--force-device-scale-factor=1'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 4200, height: 1000, deviceScaleFactor: 1 });
  await page.setContent(html);
  const result = await page.evaluate(async (corpus) => {
    const fams = [
      'Main',
      'Math',
      'AMS',
      'Size1',
      'Size2',
      'Size3',
      'Size4',
      'Caligraphic',
      'Fraktur',
      'Script',
      'SansSerif',
      'Typewriter',
    ];
    for (const f of fams) await document.fonts.load(`16px KaTeX_${f}`);
    await document.fonts.load('italic 16px KaTeX_Math');
    await document.fonts.load('bold 16px KaTeX_Main');
    await document.fonts.load('italic 16px KaTeX_Main');
    const c = document.getElementById('c');
    const out = [];
    for (const { tex, d } of corpus) {
      const div = document.createElement('div');
      div.className = 'f';
      c.appendChild(div);
      katex.render(tex, div, { displayMode: d, output: 'html' });
      out.push(div);
    }
    await document.fonts.ready;
    const probe = () => {
      const s = document.createElement('span');
      s.style.cssText = 'display:inline-block;width:0;height:0';
      return s;
    };
    const res = [];
    for (const div of out) {
      const htmlRoot = div.querySelector('.katex-html');
      const o = probe();
      htmlRoot.insertBefore(o, htmlRoot.firstChild);
      // A probe before every text node gives its baseline.
      const walker = document.createTreeWalker(htmlRoot, NodeFilter.SHOW_TEXT);
      const texts = [];
      // Tags (	ag) sit at the right edge of the container: not part of the formula's own layout.
      while (walker.nextNode())
        if (!walker.currentNode.parentElement.closest('.katex-tag')) texts.push(walker.currentNode);
      const probes = texts.map((t) => {
        const p = probe();
        t.parentNode.insertBefore(p, t);
        return p;
      });
      const or = o.getBoundingClientRect();
      const ox = or.left,
        oy = or.bottom;
      const glyphs = [];
      texts.forEach((t, i) => {
        const base = probes[i].getBoundingClientRect().bottom - oy;
        const cs = getComputedStyle(t.parentNode);
        let k = 0;
        for (const ch of t.data) {
          const r = document.createRange();
          r.setStart(t, k);
          r.setEnd(t, k + ch.length);
          const rect = r.getClientRects()[0];
          k += ch.length;
          if (ch === '\u200b' || /\s/.test(ch) || ch === '\u00a0') continue;
          glyphs.push({
            char: ch,
            x: rect.left - ox,
            w: rect.width,
            baseline: base,
            font: cs.fontFamily.split(',')[0],
            style: cs.fontStyle,
            weight: cs.fontWeight,
            size: parseFloat(cs.fontSize),
          });
        }
      });
      const rules = [];
      for (const el of htmlRoot.querySelectorAll(
        '.frac-line,.overline-line,.underline-line,.katex-hline,.katex-hdashline,.katex-rule,.vertical-separator,.katex-sout,.fbox',
      )) {
        const r = el.getBoundingClientRect();
        rules.push({
          kind: [...el.classList].join('.'),
          x: r.left - ox,
          y: r.top - oy,
          w: r.width,
          h: r.height,
        });
      }
      const svgs = [];
      for (const el of htmlRoot.querySelectorAll('svg')) {
        const r = el.getBoundingClientRect();
        let L = r.left,
          T = r.top,
          R = r.right,
          B = r.bottom;
        for (let a = el.parentElement; a && a !== htmlRoot; a = a.parentElement) {
          if (getComputedStyle(a).overflow !== 'visible') {
            const q = a.getBoundingClientRect();
            L = Math.max(L, q.left);
            T = Math.max(T, q.top);
            R = Math.min(R, q.right);
            B = Math.min(B, q.bottom);
          }
        }
        svgs.push({ kind: el.parentElement.className, x: L - ox, y: T - oy, w: R - L, h: B - T });
      }
      const bases = htmlRoot.querySelectorAll('.katex-base');
      const last = bases[bases.length - 1].getBoundingClientRect();
      res.push({ width: last.right - ox, glyphs, rules, svgs });
    }
    return res;
  }, corpus);
  const target = path.join(here, `truth-${C}${SUF}.json`);
  fs.writeFileSync(
    target,
    JSON.stringify(result.map((r, i) => ({ tex: corpus[i].tex, d: corpus[i].d, ...r }))),
  );
  console.log('wrote', target);
  console.log(
    'formulas',
    result.length,
    'glyphs',
    result.reduce((a, r) => a + r.glyphs.length, 0),
  );
} finally {
  await browser.close();
}
