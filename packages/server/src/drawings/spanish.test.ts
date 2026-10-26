/**
 * What making a drawing says to the person, in Spanish (ADR 0038): every kind of thing the report
 * counts, the sentences it adds, and every reason a drawing is refused, read through the app's
 * catalog, whose templates keep what the message holds as it was.
 */
import { DRAWING_LIMITS } from '@visual-anything/core';
import { translateMessage, untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { describe, expect, it } from 'vitest';
import { HTML_CAPS } from './caps';
import { cleanHtml } from './clean';
import { makeDrawing } from './make';
import { DrawingRefusal, readHtml } from './read';
import { renderDrawing } from './render';
import { DrawingReport } from './report';

/** Pages that make the report say each thing it counts, once and more than once. */
const PAGES = [
  `<head><title>t</title><meta charset="utf-8"></head><!-- c --><p onclick="x" title="t" href="h" xml:lang="en">See <a href="h">this</a></p>
   <script>x</script><script>y</script><iframe></iframe><svg></svg>
   <style>@import url(x); @media print {} div p {} p:hover {} p { box-shadow: 0 0 1px #000; filter: blur(1px); color: u\\72l(x); background: linear-gradient(#fff, #000) }</style>
   <table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>
   <div style="overflow: hidden"><p style="overflow: hidden">a</p><p style="overflow: hidden">b</p></div>
   <p>😀 👍</p><p style="width: 12zz; height: 3zz">x</p><div style="height: 5000px">tall</div>`,
  `<p ${Array.from({ length: 258 }, (_, at) => `a${at}`).join(' ')}>x</p>${'<div>'.repeat(66)}x${'</div>'.repeat(66)}<p>${'a'.repeat(4_100)}</p>`,
  `<p ${Array.from({ length: 257 }, (_, at) => `a${at}`).join(' ')}>x</p>${'<div>'.repeat(65)}x${'</div>'.repeat(65)}<p>${'a'.repeat(4_001)}</p><p>😀</p>`,
  `<style>.a { box-shadow: 0 0 1px #000; background: linear-gradient(#fff, #000) }</style><div style="overflow: hidden"><p style="overflow: hidden">x</p></div><p class="a">x</p>`,
];

async function reportLines(): Promise<string[]> {
  const lines: string[] = [];
  for (const page of PAGES) {
    const outcome = await renderDrawing(page, 400);
    if (outcome.ok) lines.push(...outcome.report);
  }
  // Past the elements a drawing keeps, which only the cleaner says.
  const report = new DrawingReport();
  cleanHtml(readHtml('<p></p>'.repeat(5_002), report), report, { covers: () => true });
  const one = new DrawingReport();
  cleanHtml(readHtml('<p></p>'.repeat(4_999), one), one, { covers: () => true });
  return [...lines, ...report.lines(), ...one.lines()];
}

function refusalOf(html: string): string {
  try {
    const report = new DrawingReport();
    cleanHtml(readHtml(html, report), report, { covers: () => true });
  } catch (error) {
    if (error instanceof DrawingRefusal) return error.problem.message;
    throw error;
  }
  throw new Error('It was not refused.');
}

async function refusals(): Promise<string[]> {
  const made = [
    await makeDrawing('<p>x</p>', 10),
    await makeDrawing('x'.repeat(HTML_CAPS.input + 1)),
  ].flatMap((each) => (each.ok ? [] : each.problems.map((problem) => problem.message)));
  return [
    ...made,
    refusalOf('<div>'.repeat(200)),
    refusalOf('<p>x</p>'.repeat(15_000)),
    refusalOf(`<style>${'p{color:red}'.repeat(257)}</style>`),
    refusalOf(
      `<style>${Array.from({ length: 17 }, (_, at) => `.c${at}`).join(',')}{color:red}</style>`,
    ),
    refusalOf(
      `<style>${'p{color:red;color:blue;color:green;color:red;color:blue}'.repeat(250)}</style>${'<p>x</p>'.repeat(100)}`,
    ),
    // What the worker's limits and the core's cleaner say, as `make.ts` writes it.
    `Making the drawing took over ${HTML_CAPS.timeMs / 1000} seconds, so it was stopped. Shorten the HTML, or make it narrower.`,
    `Making the drawing needed over ${HTML_CAPS.memoryMb} MiB of memory, so it was stopped. Shorten the HTML, or make it narrower.`,
    'The drawing could not be made: its worker stopped (1).',
    'Making the drawing tried to reach the network, which it never may, so nothing was made.',
    'The drawing is too large to keep as a picture: The cleaned SVG text is over 64 KiB. Shorten the HTML, or make it narrower.',
    'The HTML draws nothing a picture can keep: Nothing drawable is left in the SVG picture.',
    'Cleaning the picture removed: 1 stroke dash pattern finer than the picture can show, 2 other attributes.',
    'Visual Anything is making 4 drawings already: ask again once they are made.',
  ];
}

describe('what making a drawing says, in Spanish', () => {
  it('has a template for every line of the report', async () => {
    const lines = await reportLines();
    expect(lines.length).toBeGreaterThan(30);
    expect(lines.flatMap((line) => untranslatedParts('es', line))).toEqual([]);
  }, 60_000);

  it('has a template for every reason a drawing is refused', async () => {
    const all = await refusals();
    expect(all.flatMap((line) => untranslatedParts('es', line))).toEqual([]);
  }, 60_000);

  it('keeps what the message holds as it was', () => {
    expect(translateMessage('es', '2 script elements')).toBe('2 elementos script');
    expect(
      translateMessage('es', `The drawing is cut at ${DRAWING_LIMITS.height} pixels high.`),
    ).toBe('El dibujo se corta a 4000 píxeles de alto.');
    expect(
      translateMessage(
        'es',
        'The drawing is too large to keep as a picture: The cleaned SVG text is over 64 KiB. Shorten the HTML, or make it narrower.',
      ),
    ).toMatch(/^El dibujo es demasiado grande para guardarlo como imagen: .* Acortar el HTML/);
  });
});
