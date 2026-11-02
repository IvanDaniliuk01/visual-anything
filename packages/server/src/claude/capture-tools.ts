/**
 * `capture_view` (ADR 0081): Claude sees a view as the app draws it. The tab the person used last
 * renders it off screen with its canvas's scene, renderer, marks, theme and overlays, at the width
 * asked for, and answers with a PNG that Claude reads as an image. It is a read: no view file, no
 * history, no camera of the tab changes, and it never opens a browser.
 */
import {
  CAPTURE_WIDTH,
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_ELEMENTS,
  MAX_CAPTURE_HEIGHT,
  modelIndexOf,
  type CaptureAsk,
  type CaptureFailure,
  type CapturePicture,
  type CaptureRegion,
  type CaptureReport,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, fail, id, tool } from './kit';
import type { Tool, ToolOutcome } from './tools';

/** How many elements' names the answer spells out before it counts the rest. */
const NAMES_SAID = 10;

const MIB = 1024 * 1024;

const captureView = tool({
  name: 'capture_view',
  title: 'See a view as the app draws it',
  description: `Answers a picture of a view as the app the person has open draws it, as a PNG image you can look at: its shapes, lines, names and details as the canvas writes them at that size, the theme, the overlays and their legend, what is collapsed, and what filters and focus hide or dim, without the selection's or guidance's marks. The tab the person used last draws it off screen, so their tab neither moves nor flickers, and nothing changes: no view, no history, no camera. Use it to check a view after you build it or lay it out (lay_out_view), before you tell the person it is done, and look for overlapping shapes, lines across names, and what reads badly.

region is "whole" (the default), "viewport" (what the tab shows now), or a list of ids of elements, notes and arrows whose shapes to frame, to read a part closely. width is the picture's width in pixels, ${CAPTURE_WIDTH.least} to ${CAPTURE_WIDTH.most}, ${CAPTURE_WIDTH.initial} by default; a region taller than ${MAX_CAPTURE_HEIGHT} pixels at that width is drawn narrower. The canvas writes names only where shapes are large enough on screen, so a large view seen whole shows blocks: frame some elements, or widen it, to read them. A picture past ${MAX_CAPTURE_BYTES / MIB} MiB is refused, saying so. It pictures only a view a tab shows: with view left out, the one the tab shows; it never opens another, nor a browser. With no app open, open_app opens one.

Example: { "view": "system-overview" }
Example: { "view": "system-overview", "region": ["checkout", "payments"], "width": 1600 }
Example: { "region": "viewport", "theme": "dark" }`,
  input: {
    view: id()
      .optional()
      .describe(
        'The view to picture; left out, the one the tab the person used last shows. It must be the one that tab shows.',
      ),
    region: z
      .union([z.enum(['whole', 'viewport']), z.array(id()).min(1).max(MAX_CAPTURE_ELEMENTS)])
      .optional()
      .describe(
        'What the picture shows: "whole" (the default), "viewport", or ids of elements, notes and arrows whose shapes it frames.',
      ),
    width: z
      .number()
      .int()
      .min(CAPTURE_WIDTH.least)
      .max(CAPTURE_WIDTH.most)
      .optional()
      .describe(`In pixels; ${CAPTURE_WIDTH.initial} by default.`),
    theme: z
      .enum(['light', 'dark'])
      .optional()
      .describe('The theme to draw in; left out, the one the tab shows.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    if (args.view !== undefined && !state.views.some((view) => view.id === args.view)) {
      return fail(`There is no view "${args.view}". read_view and get_project name the views.`);
    }
    const region: CaptureRegion = args.region ?? 'whole';
    if (Array.isArray(region)) {
      const index = modelIndexOf(state);
      // Notes and arrows are framed by their ids too, in any view that holds them.
      const free = new Set(state.views.flatMap((view) => view.freeShapes.map((shape) => shape.id)));
      const unknown = region.filter((each) => index.element(each) === undefined && !free.has(each));
      if (unknown.length > 0) {
        return fail(
          `No element, note or arrow has these ids: ${unknown.join(', ')}. Use find_elements or read_view to find the right ones.`,
        );
      }
    }
    if (program.capture === undefined) {
      return fail('This Visual Anything takes no pictures of a view.');
    }
    const ask: CaptureAsk = {
      ...(args.view === undefined ? {} : { view: args.view }),
      region,
      width: args.width ?? CAPTURE_WIDTH.initial,
      ...(args.theme === undefined ? {} : { theme: args.theme }),
    };
    return answerOf(state, ask, await program.capture(ask));
  },
});

/** The capture tools, in the order Claude reads them. */
export const CAPTURE_TOOLS: readonly Tool[] = [captureView];

/** What Claude reads of a capture: the picture with a short text, or why there is none. */
function answerOf(state: ProjectSnapshot, ask: CaptureAsk, report: CaptureReport): ToolOutcome {
  if (report.picture !== undefined) {
    return {
      ok: true,
      value: describePicture(state, ask, report.picture),
      image: { data: report.picture.png, mimeType: 'image/png' },
    };
  }
  if (report.failure !== undefined) return fail(failureNote(state, ask, report.failure));
  if (report.apps === 0) {
    return fail(
      'No app has the project open, so there is nothing to picture: the app draws it. Call open_app to open it, or ask the person to, then call capture_view again. capture_view never opens a browser itself.',
    );
  }
  switch (report.unanswered) {
    case 'timed-out':
      return fail(
        `The app did not answer within ${Math.round((report.waited ?? 0) / 1000)} s, so there is no picture. Try a smaller width or a region, or call capture_view again in a moment.`,
      );
    case 'gone':
      return fail(
        'The app closed before it answered, so there is no picture. Call open_app to open it again, then call capture_view again.',
      );
    default:
      return fail(
        'No open tab took the picture: only the tab the person used last does, and none of the open tabs is. Ask the person to bring the app’s tab to the front, or call open_app, then call capture_view again.',
      );
  }
}

/** The short text beside a picture: the view, what it shows, its size, theme and zoom. */
function describePicture(state: ProjectSnapshot, ask: CaptureAsk, picture: CapturePicture): string {
  const view = viewName(state, picture.view);
  const shows =
    ask.region === 'whole'
      ? 'the whole view'
      : ask.region === 'viewport'
        ? 'what the tab shows now'
        : `the shapes of ${ask.region.length} ${ask.region.length === 1 ? 'element' : 'elements'} (${names(state, ask.region)})`;
  const sentences = [
    `View ${view}: ${shows}, ${picture.width} × ${picture.height} pixels, in the ${picture.theme} theme, at ${round(picture.scale)} pixels per canvas unit, with names and details as the canvas writes them at that zoom.`,
  ];
  if (picture.width < ask.width) {
    sentences.push(
      `It is narrower than the ${ask.width} pixels asked for, so that all of it fits ${MAX_CAPTURE_HEIGHT} pixels tall.`,
    );
  }
  if (picture.missing !== undefined && picture.missing.length > 0) {
    sentences.push(
      `These have no shape the canvas draws there: ${names(state, picture.missing)}. They may be outside the view's scope, hidden by its filters or focus, or inside a collapsed container.`,
    );
  }
  return sentences.join(' ');
}

/** Why the tab used last took no picture, and what to do. */
function failureNote(state: ProjectSnapshot, ask: CaptureAsk, failure: CaptureFailure): string {
  const asked = ask.view === undefined ? 'the view' : `the view ${viewName(state, ask.view)}`;
  switch (failure.failed) {
    case 'other-view': {
      const shown = failure.shows === undefined ? 'another view' : viewName(state, failure.shows);
      const wanted = ask.view === undefined ? 'that view' : viewName(state, ask.view);
      return `The tab the person used last shows ${shown}, not ${wanted}, and capture_view never changes the view a tab shows. Leave view out to see ${shown}; or open ${wanted} in a tab first, with open_app naming it, or with guidance that names it (highlight, pan_to or lay_out_view), which opens it in the tab the person used last, then call capture_view again.`;
    }
    case 'too-large':
      return `The picture would take ${((failure.bytes ?? 0) / MIB).toFixed(1)} MiB, more than the ${MAX_CAPTURE_BYTES / MIB} MiB a picture may. Ask for a smaller width, or a region: "viewport", or some elements' ids.`;
    case 'empty':
      return `${capitalized(asked)} draws nothing yet: add elements to it, or give it a scope that takes some.`;
    case 'not-drawn': {
      const named = Array.isArray(ask.region) ? `: ${names(state, ask.region)}` : '';
      return `None of the elements named has a shape the canvas draws in ${asked}${named}. They may be outside its scope, hidden by its filters or focus, or inside a collapsed container; read_view says what it shows.`;
    }
    case 'no-canvas':
      return 'The tab the person used last draws no canvas now, as when its canvas has not started or it opened no project. Ask the person to bring the app’s tab to the front, or call open_app, then call capture_view again.';
    case 'failed':
      return `The app could not draw the picture: ${failure.why ?? 'it gave no reason.'}`;
  }
}

/** A view's name and id, as the answers write it. */
function viewName(state: ProjectSnapshot, view: Id): string {
  const name = state.views.find((each) => each.id === view)?.name;
  return name === undefined ? `"${view}"` : `"${name}" (${view})`;
}

/** The names of some elements, the first few, then how many more. */
function names(state: ProjectSnapshot, ids: readonly Id[]): string {
  const index = modelIndexOf(state);
  const said = ids.slice(0, NAMES_SAID).map((each) => {
    const name = index.element(each)?.name;
    return name === undefined ? each : `"${name}" (${each})`;
  });
  const rest = ids.length - said.length;
  return rest > 0 ? `${said.join(', ')} and ${rest} more` : said.join(', ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
