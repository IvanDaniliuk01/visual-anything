/**
 * Claude's tool for duplicates (ADR 0103): `duplicate_elements` makes new elements with what others
 * hold, as the app's Paste as duplicates and Duplicate do, in one undoable action labelled Claude.
 * Showing the same elements in another view is not duplicating them: that is `add_to_view`.
 */
import type { Command } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { WRITE, act, id, tool } from './kit';

const duplicateElements = tool({
  name: 'duplicate_elements',
  title: 'Duplicate elements',
  description: `Makes duplicates of elements in a view, as one undoable action: each a new element with its original's component, attributes, description and appearance, and with it duplicates of everything its original holds, at any depth, and of the relations among everything duplicated. Relations to anything else are not duplicated. The duplicates land inside into, through the nesting relation type the view would choose for creating an element there, or in World when into is left out; with beside true, each lands in the containers its original sits in. One that lands where its original sits is named with " (copy)". positions places the shapes of the given elements' duplicates, relative to the container they land in or to the canvas in World, left for layout to change; without them, layout places them. It answers the duplicates of the given elements by their originals, and every id it made.

To show the same elements in another view, without making new ones, use add_to_view instead: an element shown in several views is the same data, renamed everywhere at once.

Example: { "view": "system-overview", "elements": ["clinic-booking"], "positions": [{ "element": "clinic-booking", "x": 900, "y": 0 }] }
Example: { "view": "system-overview", "elements": ["reminder-service"], "beside": true }`,
  input: {
    view: id(),
    elements: z.array(id()).min(1),
    into: id().optional().describe('The container they land in; left out for World.'),
    beside: z
      .boolean()
      .optional()
      .describe('true: each lands in the containers its original sits in. Not with into.'),
    positions: z
      .array(z.object({ element: id(), x: z.number(), y: z.number() }))
      .optional()
      .describe('Where the duplicate of each given element goes, by the given element’s id.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const command: Command = {
      type: 'duplicate-elements',
      view: args.view,
      elements: args.elements,
      ...(args.into === undefined ? {} : { container: args.into }),
      ...(args.beside === undefined ? {} : { beside: args.beside }),
      ...(args.positions === undefined ? {} : { positions: args.positions }),
    };
    return act(program, command, (answer) => ({
      duplicates: args.elements.map((original, at) => ({
        of: original,
        id: answer.created[at] as Id,
      })),
      created: answer.created,
    }));
  },
});

/** Claude's tools for duplicates (ADR 0103). */
export const DUPLICATE_TOOLS = [duplicateElements];
