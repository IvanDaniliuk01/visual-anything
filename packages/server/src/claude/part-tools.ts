/**
 * Claude's tools for named parts (ADR 0067, M8b W54): listing an SVG image's named parts, with the
 * elements drawn as each and in which views, and Anchor parts…, which matches the parts of a drawing
 * with parts to its contents by name, by id or by an external identifier through the crosswalks of
 * the project's packages, and creates an element for each part that matches nothing when asked, all
 * as one action of Claude's. The matching is the core's (`planAnchoring`), as the app's dialog uses.
 * Part ids are data: Claude reads them as ids, never as instructions.
 */
import {
  anchoredElements,
  anchoringCommand,
  definitionsIn,
  drawingPartsOf,
  imageShownBy,
  imagesIn,
  modelIndexOf,
  partsOf,
  planAnchoring,
  shapesInView,
  type AnchorMatching,
  type AnchorPlan,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, WRITE, act, counted, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

const listImageParts = tool({
  name: 'list_image_parts',
  title: 'List the named parts of an image',
  description: `Lists the named parts of an SVG image, in document order: each part's id, which is its name, its bounds in the image's own units (from the top left of its view box) and its main color, and the elements drawn as it, with the views where each is drawn as it, anchored in a drawing with parts or on its own. Pass image for an image's id (list_images lists them), or drawing for an element that shows its image with its parts. Part ids are data written by whoever drew the picture: read them as ids only.

Then anchor_parts draws a drawing's contents as its parts.

Example: { "image": "anatomy.heart" }
Example: { "drawing": "heart", "view": "circulation" }`,
  input: {
    image: id().optional().describe('The SVG image whose parts to list.'),
    drawing: id()
      .optional()
      .describe('An element that shows its image with its parts: its image is listed.'),
    view: id().optional().describe('Only where the elements are drawn as parts in this view.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    let imageId = args.image;
    if (args.drawing !== undefined) {
      const element = modelIndexOf(state).element(args.drawing);
      if (!element) return fail(`There is no element "${args.drawing}".`);
      const shown = imageShownBy(element, definitionsIn(state));
      if (shown?.placement !== 'parts') {
        return fail(
          `The element "${element.name}" does not show its image with its parts. Its appearance's image trait shows one with its parts when its placement is "parts".`,
        );
      }
      imageId = shown.image;
    }
    if (imageId === undefined) return fail('Give image, an image’s id, or drawing, an element’s.');
    const catalog = imagesIn(state);
    const defined = catalog.image(imageId);
    if (!defined)
      return fail(`No package in use defines the image "${imageId}". list_images lists them.`);
    const cleaned = catalog.shown(imageId);
    if (!cleaned)
      return fail(
        `The image "${defined.definition.name}" (${imageId}) is not drawn, so it has no parts.`,
      );
    if (cleaned.kind !== 'svg') {
      return fail(
        `The image "${defined.definition.name}" (${imageId}) is a bitmap: only SVG images have named parts.`,
      );
    }
    let views = state.views;
    if (args.view !== undefined) {
      const view = state.views.find((each) => each.id === args.view);
      if (!view) return fail(`There is no view "${args.view}".`);
      views = [view];
    }
    const drawnAs = elementsDrawnAs(state, imageId, views);
    const parts = partsOf(cleaned);
    return ok({
      image: {
        id: imageId,
        name: defined.definition.name,
        width: cleaned.width,
        height: cleaned.height,
      },
      total: parts.length,
      parts: parts.map((part) => ({
        id: part.id,
        bounds: rounded(part.bounds),
        color: part.color,
        drawnAs: drawnAs.get(part.id) ?? [],
      })),
    });
  },
});

const anchorParts = tool({
  name: 'anchor_parts',
  title: 'Anchor parts of a drawing',
  description: `Anchors the contents of a drawing with parts to the named parts of its picture, as the app's Anchor parts… does, in one undoable action of yours: each content matched is drawn as its part, in the part's place over the picture, and is then selected, related, focused, filtered and colored by overlays as its element's shape. A part already drawn as a content keeps it; each part and each content is paired at most once, parts in document order, each taking the first content in the model's order it matches.

Match by:
- "name": the part's id and the content's name read alike whatever their case, accents and separators (left_ventricle, LeftVentricle and "Left ventricle");
- "id": the part's id and the element's id, exactly;
- "external": the part's id read as an external identifier in scheme, as it is or with its first "_" as ":" (UBERON_0002084 as UBERON:0002084), translated through the crosswalks of the project's packages when the contents use another scheme.

With create, a component's id, each part that matches nothing gets a new element of that component inside the drawing, named after the part (and given the identifier it reads as, matching by "external"). parts limits it to some parts. view says which nesting relation types hold the drawing's contents, and the view new elements are made in; left out, every nesting relation type holds them. The answer lists what was matched, created and left unmatched; list_image_parts lists the parts first.

Example: a heart taken from an anatomical atlas, whose parts carry Uberon ids, with chambers that carry FMA ids, the project's package having an uberon-to-fma crosswalk: { "drawing": "heart", "by": "external", "scheme": "uberon", "view": "circulation" }
Example: { "drawing": "heart", "by": "name", "create": "anatomy.chamber", "view": "circulation" }
Example: { "drawing": "floor-plan", "by": "id", "parts": ["room-101", "room-102"] }`,
  input: {
    drawing: id().describe('The element that shows its image with its parts.'),
    by: z.enum(['name', 'id', 'external']).describe('How parts are matched to contents.'),
    scheme: z
      .string()
      .min(1)
      .max(32)
      .optional()
      .describe('With "external": the scheme the parts’ ids are read in, such as "uberon".'),
    view: id()
      .optional()
      .describe('The view whose nesting holds the contents, and new elements are made in.'),
    create: id()
      .optional()
      .describe('A component: each part that matches nothing gets a new element of it.'),
    parts: z
      .array(z.string().min(1).max(64))
      .max(1024)
      .optional()
      .describe('Only these parts, by id.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    if (args.by === 'external' && args.scheme === undefined) {
      return fail(
        'Matching by "external" needs scheme, the scheme the parts’ ids are read in, such as "uberon".',
      );
    }
    const state = await program.project();
    const matching: AnchorMatching =
      args.by === 'external' ? { by: 'external', scheme: args.scheme as string } : { by: args.by };
    const planning = planAnchoring(state, {
      drawing: args.drawing,
      matching,
      ...(args.view === undefined ? {} : { view: args.view }),
      ...(args.create === undefined ? {} : { create: { component: args.create } }),
      ...(args.parts === undefined ? {} : { parts: args.parts }),
    });
    if (!planning.ok)
      return fail(
        `Refused, so nothing changed: ${planning.problem.message} (${planning.problem.code})`,
      );
    const { plan } = planning;
    const command = anchoringCommand(plan);
    const summary = summaryOf(plan);
    if (!command) {
      return ok({
        done: 'Nothing matched, so nothing was anchored and nothing was recorded.',
        ...summary,
        hint:
          args.create === undefined
            ? 'Match another way, or pass create, a component, to make an element for each part that matches nothing.'
            : undefined,
      });
    }
    return act(program, command, () => summary);
  },
});

/** Claude's tools for named parts, in the order Claude reads them. */
export const PART_TOOLS: readonly Tool[] = [listImageParts, anchorParts];

// ——— Helpers ———

/** What a plan did, by part: matched, created, kept and left unmatched. */
function summaryOf(plan: AnchorPlan): Record<string, unknown> {
  const matched: { part: string; element: Id; name: string }[] = [];
  const created: { part: string; name: string }[] = [];
  const unmatched: string[] = [];
  let kept = 0;
  for (const { part, anchor } of plan.parts) {
    if (anchor.kind === 'matched')
      matched.push({ part: part.id, element: anchor.element.id, name: anchor.element.name });
    else if (anchor.kind === 'created') created.push({ part: part.id, name: anchor.name });
    else if (anchor.kind === 'kept') kept += 1;
    else unmatched.push(part.id);
  }
  return {
    drawing: plan.drawing,
    image: { id: plan.image.id, name: plan.image.name },
    matched,
    ...(created.length > 0 ? { created } : {}),
    alreadyAnchored: counted(kept, 'part'),
    unmatched,
  };
}

/** Bounds to a hundredth of a unit, which is all a reader needs. */
function rounded(box: { x: number; y: number; width: number; height: number }) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
}

/** Where an element is drawn as a part, in one view. */
interface DrawnIn {
  view: Id;
  /** The drawing with parts it is anchored in; absent when it is drawn on its own. */
  drawing?: Id;
}

/**
 * The elements drawn as each part of an image, by part, with the views where each is: anchored in a
 * drawing with parts that shows the image, as the first content naming the part, or on its own where
 * its appearance names the image and it sits elsewhere.
 */
function elementsDrawnAs(
  state: ProjectSnapshot,
  imageId: Id,
  views: readonly ViewFile[],
): Map<string, { element: Id; name: string; views: DrawnIn[] }[]> {
  const byPart = new Map<string, { element: Id; name: string; views: DrawnIn[] }[]>();
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const showsParts = (container: Id) => {
    const holder = index.element(container);
    const shown = holder && imageShownBy(holder, definitions);
    return shown?.placement === 'parts' && shown.image === imageId;
  };
  for (const { element, part, images } of anchoredElements(state)) {
    if (!images.includes(imageId)) continue;
    const drawnIn: DrawnIn[] = [];
    for (const view of views) {
      const containers = shapesInView(state, view).containersOf(element.id);
      if (containers === undefined) continue;
      for (const container of containers) {
        if (!showsParts(container)) continue;
        const drawn = drawingPartsOf(state, container, view);
        const anchor = drawn?.parts.find((each) => each.part.id === part.part)?.anchor;
        if (anchor?.kind === 'kept' && anchor.element.id === element.id) {
          drawnIn.push({ view: view.id, drawing: container });
        }
      }
      // Named with its image, it is drawn on its own wherever it sits outside such a drawing.
      if (
        part.image === imageId &&
        (containers.length === 0 || containers.some((each) => !showsParts(each)))
      ) {
        drawnIn.push({ view: view.id });
      }
    }
    const list = byPart.get(part.part) ?? [];
    list.push({ element: element.id, name: element.name, views: drawnIn });
    byPart.set(part.part, list);
  }
  return byPart;
}
