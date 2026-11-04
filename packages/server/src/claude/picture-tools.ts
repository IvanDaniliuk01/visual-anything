/**
 * Claude's tools for pictures (ADR 0098): `add_picture` keeps an image file inside the project folder
 * as a media file and places it on a view as a picture, a free shape. `read_view` lists pictures, and
 * `update_free_shape` and `delete_free_shapes` take them as they take notes.
 */
import { mediaFileName, pictureSize, type ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { WRITE, act, fail, id, tool } from './kit';
import type { Tool } from './tools';

const FILES =
  'Name the file by its path from the project folder, such as "photos/front-desk.jpg": Visual Anything reads it itself, only as a regular file inside the project folder, and refuses a path outside it, an absolute path, a link and a URL. It never fetches anything. A file elsewhere on the person’s disk is added by the person, by dropping it on the canvas or with Picture… on the canvas toolbar, or copied into the project folder first.';

/** Where a picture goes when no place is given: under everything the view draws at its top level. */
export function placeBelow(view: ViewFile): { x: number; y: number } {
  let left = Infinity;
  let bottom = -Infinity;
  const take = (x: number, y: number) => {
    left = Math.min(left, x);
    bottom = Math.max(bottom, y);
  };
  for (const position of view.positions) {
    if (position.container !== undefined) continue;
    take(position.x, position.y + (position.height ?? 80));
  }
  for (const shape of view.freeShapes) {
    if (shape.kind === 'arrow') {
      take(Math.min(shape.from.x, shape.to.x), Math.max(shape.from.y, shape.to.y));
    } else {
      take(shape.x, shape.y + shape.height);
    }
  }
  return Number.isFinite(bottom) ? { x: left, y: bottom + 40 } : { x: 0, y: 0 };
}

function viewOf(state: ProjectSnapshot, viewId: string): ViewFile | undefined {
  return state.views.find((each) => each.id === viewId);
}

const addPicture = tool({
  name: 'add_picture',
  title: 'Add a picture',
  description: `Adds a picture to a view, as one undoable action: a PNG, JPEG, WebP, GIF or SVG file inside the project folder, drawn loose on the canvas as a note is. A picture is drawing only; it is not part of the model. An animated GIF plays.

${FILES}

Visual Anything cleans the file before it keeps it, into media/<hash>.<extension>: it drops metadata such as a photo's position and camera, a GIF's comments, and anything in an SVG that could run or load. A file is at most 32 MiB, 8,192 pixels a side and 40 megapixels; a GIF at most 1,000 frames. Undoing the action keeps the file.

Its size is its own, scaled to fit 480 units a side, unless width or height is given (the other follows its proportions). Without x and y it goes under what the view draws. name is what screen readers, the outline and a missing file say; give one that says what it shows.

Example: { "view": "system-overview", "path": "photos/front-desk.jpg", "name": "The clinic's front desk" }
Example: { "view": "system-overview", "path": "diagrams/flow.gif", "x": 600, "y": 40, "width": 320 }`,
  input: {
    view: id(),
    path: z
      .string()
      .min(1)
      .max(1024)
      .describe('The image file’s path from the project folder, such as "photos/front-desk.jpg".'),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    name: z.string().min(1).max(200).optional().describe('What it shows, in a few words.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    if (/^\s*[a-z][a-z0-9+.-]+:\/\//i.test(args.path) || /^\s*(data|file|blob):/i.test(args.path)) {
      return fail(`"${args.path}" is an address: Visual Anything never fetches anything. ${FILES}`);
    }
    const state = await program.project();
    const view = viewOf(state, args.view);
    if (view === undefined) return fail(`There is no view "${args.view}".`);
    if (program.keepPictureFile === undefined) {
      return fail('Not added: this Visual Anything cannot keep pictures for Claude.');
    }
    const kept = await program.keepPictureFile(args.path);
    if (kept.type === 'media/refused') return fail(`Not added: ${kept.message} (${kept.code})`);
    const { media } = kept;
    const ratio = media.width / media.height;
    const size =
      args.width !== undefined
        ? { width: args.width, height: args.height ?? args.width / ratio }
        : args.height !== undefined
          ? { width: args.height * ratio, height: args.height }
          : pictureSize(media);
    const place =
      args.x !== undefined && args.y !== undefined
        ? { x: args.x, y: args.y }
        : {
            ...placeBelow(view),
            ...(args.x === undefined ? {} : { x: args.x }),
            ...(args.y === undefined ? {} : { y: args.y }),
          };
    return act(
      program,
      {
        type: 'create-free-shape',
        view: args.view,
        shape: {
          kind: 'picture',
          ...place,
          ...size,
          media,
          ...(args.name === undefined ? {} : { name: args.name }),
        },
      },
      (answer) => ({
        shape: answer.created[0],
        file: `media/${mediaFileName(media)}`,
        format: media.format,
        ownSize: { width: media.width, height: media.height },
        placed: { ...place, ...size },
        ...(kept.removed.length > 0 ? { cleaned: kept.removed } : {}),
      }),
    );
  },
});

export const PICTURE_TOOLS: readonly Tool[] = [addPicture];
