/**
 * Claude's tool for aligning shapes (ADR 0074): `align_shapes` aligns, distributes or sizes alike the
 * shapes of elements in a view, as the canvas's Align does, as one undoable action of Claude's. It
 * reads the view as the canvas draws it, with the app's own scene, so that what it lines up is what
 * the person sees; each shape is stored relative to its own container, pinned.
 */
import { modelIndexOf } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The ways, as the tool takes them, in the order the canvas's menus list them. */
const HOWS = [
  'left',
  'centers',
  'right',
  'top',
  'middles',
  'bottom',
  'distribute-horizontally',
  'distribute-vertically',
  'same-width',
  'same-height',
] as const;

const alignShapes = tool({
  name: 'align_shapes',
  title: 'Align shapes in a view',
  description: `Aligns, distributes or sizes alike the shapes of elements in a view, as the canvas's Align does, as one undoable action; every shape of each element takes part, and each is stored relative to its own container, pinned, so layout keeps it there. how is one of:
- left, centers, right: their left edges, their centers or their right edges on one line down the view, on the bounds of the shapes given;
- top, middles, bottom: their top edges, their middles or their bottom edges on one line across;
- distribute-horizontally, distribute-vertically: equal gaps between them, the first and the last staying (three shapes or more);
- same-width, same-height: the widest one's width, or the tallest one's height, each keeping its top left corner.
Shapes in different containers align on the canvas. A row moves its table, and an element drawn as a part of a drawing has no place of its own, so it takes no part. Nothing changes when they are aligned already. Use it to tidy what the person arranged, or what you placed with set_positions; lay_out_view arranges a whole view.

Example: { "view": "system-overview", "elements": ["booking-agent", "appointments-api", "reminder-service"], "how": "top" }
Example: { "view": "system-overview", "elements": ["whatsapp", "booking-agent", "scheduling"], "how": "distribute-horizontally" }`,
  input: {
    view: id().describe('The view, by its id.'),
    elements: z
      .array(id())
      .min(1)
      .max(1000)
      .describe('The elements whose shapes to align, by their ids; two shapes or more.'),
    how: z.enum(HOWS),
  },
  hints: WRITE,
  run: async (args, program) => {
    const project = await program.project();
    const view = project.views.find((each) => each.id === args.view);
    if (!view) return fail(`There is no view "${args.view}".`);
    const index = modelIndexOf(project);
    const unknown = args.elements.filter((element) => index.element(element) === undefined);
    if (unknown.length > 0) {
      return fail(
        `There are no elements ${unknown.map((each) => `"${each}"`).join(', ')}. Use find_elements or read_view to find the right ids.`,
      );
    }
    // The canvas's own scene and maths, loaded once Claude first aligns.
    const [{ buildSceneAfresh }, { indexScene }, { alignCommand }, { selectionOf }] =
      await Promise.all([
        import('@visual-anything/app/src/canvas/scene'),
        import('@visual-anything/app/src/canvas/hit'),
        import('@visual-anything/app/src/canvas/alignActions'),
        import('@visual-anything/app/src/editor/selection'),
      ]);
    const indexed = indexScene(buildSceneAfresh(project, view.id));
    const missing = args.elements.filter((element) => !indexed.byElement.has(element));
    if (missing.length > 0) {
      return fail(
        `The view "${view.name}" draws no shape of ${missing.map((each: Id) => `"${each}"`).join(', ')}: they are out of its scope, or inside a collapsed container. Use read_view to see what it draws.`,
      );
    }
    const aligned = alignCommand(
      indexed,
      project,
      view.id,
      selectionOf(args.elements.map((element) => ({ kind: 'element' as const, id: element }))),
      args.how,
    );
    if ('reason' in aligned) {
      return /already/.test(aligned.reason)
        ? ok({ done: 'Nothing changed, so nothing was recorded.', note: aligned.reason })
        : fail(aligned.reason);
    }
    return act(program, aligned.command);
  },
});

/** Aligning shapes (ADR 0074). */
export const ALIGN_TOOLS: readonly Tool[] = [alignShapes];
