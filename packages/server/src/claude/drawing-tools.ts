/**
 * Claude's `import_drawing` (ADR 0068): HTML Claude passes, made into a drawing by the local program
 * and shown by an element, as one undoable action of Claude's, `Import "<name>" as a drawing`. The
 * drawing is made where this MCP entry point runs, in a worker of its own limited in memory and time,
 * as the program makes one; nothing in the HTML runs, and nothing it names is fetched.
 */
import { DRAWING_LIMITS, modelIndexOf } from '@visual-anything/core';
import { z } from 'zod';
import { prepareMadeDrawing } from '../drawings/import';
import { DrawingQueue } from '../drawings/queue';
import { WRITE, act, fail, id, tool, withoutUndefined } from './kit';
import type { Tool } from './tools';

/**
 * The drawings this entry point makes, one at a time and at most four waiting, as the program makes
 * them: each worker may hold 256 MiB, so Claude's calls in parallel take turns (ADR 0068).
 */
const drawings = new DrawingQueue();

const importDrawing = tool({
  name: 'import_drawing',
  title: 'Import HTML as a drawing',
  description: `Turns static HTML you pass, such as a pricing card, a legend, a status panel or a small table, into a picture, and shows it as the drawing of an element, as one undoable action labelled Import "<name>" as a drawing. Pass element to show it on an element of the project; otherwise a new element named after the file is made, of component (Box by default), in view when you give one, sized to the drawing.

Visual Anything reads the HTML from an allow-list and lays it out itself: nothing in it runs, and nothing it names is fetched. Kept: structure (div, p, section, header, …), headings, lists, text formatting, tables (laid out as rows and columns of boxes) and style rules that select by an element name, a class or an id, with layout, size, border, colour and text properties. Dropped, and listed in the answer: scripts, handlers, links' addresses, frames, forms, images, SVG, styles that load (url(), @import, @font-face), shadows, filters and gradients. Text is drawn in Roboto as outlines, whatever font the page names; emoji are left out.

Keep it short: a drawing holds about 50 words, a card, a legend or a short table, not a long page. Past that the answer says to shorten the HTML or make it narrower. The width is the page's width in CSS pixels, from 64 to 2000, 800 by default; its height is what the content needs, up to 4000.

Example: { "name": "pricing.html", "html": "<div style=\\"padding: 16px; border: 2px solid #1D4F91; border-radius: 12px\\"><h2 style=\\"margin: 0; color: #1D4F91\\">Basic</h2><p>$10 a month, one user</p></div>", "width": 320, "view": "overview" }
Example: { "name": "legend.html", "html": "<ul><li><b>Blue</b>: services</li><li><b>Grey</b>: data stores</li></ul>", "width": 240, "element": "api" }`,
  input: {
    html: z
      .string()
      .min(1)
      .max(DRAWING_LIMITS.input)
      .describe('The HTML itself, a page or a fragment, at most 512 KiB; never a URL or a path.'),
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'The file’s name, such as "pricing.html": it names the action, the image and a new element. Left out, "drawing.html".',
      ),
    width: z
      .number()
      .int()
      .min(DRAWING_LIMITS.width.least)
      .max(DRAWING_LIMITS.width.most)
      .optional()
      .describe('The width the page is laid out at, in CSS pixels; 800 by default.'),
    element: id()
      .optional()
      .describe('An element that shows the drawing, instead of a new one; its size stays.'),
    component: id()
      .optional()
      .describe('The component of the new element that shows it; systems.box by default.'),
    view: id().optional().describe('The view the new element is made in.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    if (args.element !== undefined && (args.component !== undefined || args.view !== undefined)) {
      return fail(
        'Give element to show the drawing on an element, or component and view for a new one, not both.',
      );
    }
    if (/^\s*(https?|ftp|file):/i.test(args.html) || !args.html.includes('<')) {
      return fail(
        'Pass the HTML itself: Visual Anything never fetches anything, so a URL or a path is refused. If you only have an address, ask the person for the file.',
      );
    }
    const name = args.name ?? 'drawing.html';
    const made = await drawings.make(args.html, args.width ?? DRAWING_LIMITS.width.initial);
    if (!made.ok) {
      return fail(`Not imported: ${made.problems.map((each) => each.message).join(' ')}`);
    }
    const choices = withoutUndefined({
      element: args.element,
      component: args.component,
      view: args.view,
    });
    const prepared = prepareMadeDrawing(await program.project(), name, made, choices);
    if (!prepared.ok) return fail(`Not imported: ${prepared.problems.join(' ')}`);
    return act(program, prepared.command, async (answer) => {
      const index = modelIndexOf(await program.project());
      const shownBy =
        prepared.element ?? answer.created.find((each) => index.element(each) !== undefined);
      return withoutUndefined({
        image: prepared.image,
        element: shownBy,
        size: { width: made.width, height: made.height },
        dropped:
          made.report.length > 0
            ? made.report
            : ['Nothing: the HTML held only what a drawing keeps.'],
      });
    });
  },
});

/** Claude's drawing tools, in the order Claude reads them. */
export const DRAWING_TOOLS: readonly Tool[] = [importDrawing];
