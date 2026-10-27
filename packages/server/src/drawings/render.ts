/**
 * Making a drawing of HTML (ADR 0068), as the worker does it: read with parse5, cleaned from the
 * allow-list, laid out and drawn by satori with its text as the outlines of Roboto's glyphs. satori is
 * given no way to load anything: no picture reaches it, its fonts are given, and the characters they
 * lack are left out before it sees them, so it never asks for more.
 *
 * The SVG it writes is cleaned by the core afterwards, where the drawing is answered (`make.ts`).
 */
import { DRAWING_LIMITS, type Problem } from '@visual-anything/core';
import satori from 'satori';
import { cleanHtml } from './clean';
import { robotoFonts } from './fonts';
import { covers } from './glyphs';
import { layoutInput } from './layout-input';
import { DrawingRefusal, readHtml } from './read';
import { DrawingReport } from './report';
import { cutAt, withoutUnusedDefinitions } from './svg-output';

/** What making a drawing gave: the SVG satori wrote and what was dropped, or why it was refused. */
export type Rendered =
  { ok: true; svg: string; report: string[] } | { ok: false; problem: Problem };

/** Makes the SVG of HTML laid out at `width` CSS pixels. */
export async function renderDrawing(html: string, width: number): Promise<Rendered> {
  const report = new DrawingReport();
  try {
    const document = readHtml(html, report);
    const { fonts, coverage } = robotoFonts();
    const page = cleanHtml(document, report, { covers: (code) => covers(coverage, code) });
    let styleErrors = 0;
    let missing = 0;
    // satori writes some of what it cannot read to the console instead: counted, and kept quiet.
    const { warn, error: logError, log } = console;
    const quiet = (...said: unknown[]) => {
      if (said.some((each) => typeof each === 'string' && /^Invalid value/.test(each))) {
        styleErrors += 1;
      }
    };
    console.warn = quiet;
    console.error = quiet;
    console.log = quiet;
    let svg: string;
    try {
      svg = await satori(layoutInput(page, width) as never, {
        width,
        fonts,
        embedFont: true,
        // Never called for what the fonts draw; anything else is left out.
        loadAdditionalAsset: (_code: string, segment: string) => {
          missing += [...segment].length;
          return Promise.resolve([]);
        },
        onStyleError: () => {
          styleErrors += 1;
        },
      });
    } finally {
      console.warn = warn;
      console.error = logError;
      console.log = log;
    }
    const tall = /^<svg width="[\d.]+" height="([\d.]+)"/.exec(svg)?.[1];
    const cut = tall !== undefined && Number(tall) > DRAWING_LIMITS.height;
    svg = cutAt(withoutUnusedDefinitions(svg), DRAWING_LIMITS.height);
    report.add(
      'style value the layout could not read',
      'style values the layout could not read',
      styleErrors,
    );
    report.add(
      'character Roboto cannot draw, such as an emoji',
      'characters Roboto cannot draw, such as emoji',
      missing,
    );
    if (cut) report.note(`The drawing is cut at ${DRAWING_LIMITS.height} pixels high.`);
    return { ok: true, svg, report: report.lines() };
  } catch (error) {
    if (error instanceof DrawingRefusal) return { ok: false, problem: error.problem };
    throw error;
  }
}
