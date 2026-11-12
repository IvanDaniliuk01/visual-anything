/**
 * Claude's tools for pictures (ADR 0098): `add_picture` keeps an image file inside the project folder
 * as a media file and places it on a view as a picture, a free shape, and `add_video` does the same
 * with a video file (stage 2), without a poster, since the program decodes no video. `read_view`
 * lists pictures and videos, and `update_free_shape` and `delete_free_shapes` take them as they take
 * notes.
 */
import {
  isVideoFormat,
  mediaFileName,
  pictureSize,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { VIDEO_NAME } from '../media/project-file';
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

/** How a picture or a video is placed once its file is kept, as one undoable action. */
async function place(
  args: {
    view: string;
    path: string;
    x?: number | undefined;
    y?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
    name?: string | undefined;
  },
  program: Parameters<Tool['run']>[1],
  video: boolean,
) {
  if (/^\s*[a-z][a-z0-9+.-]+:\/\//i.test(args.path) || /^\s*(data|file|blob):/i.test(args.path)) {
    return fail(`"${args.path}" is an address: Visual Anything never fetches anything. ${FILES}`);
  }
  if (VIDEO_NAME.test(args.path) !== video) {
    return fail(
      video
        ? `"${args.path}" is not a video file: add_video takes an MP4 or WebM file, and add_picture an image.`
        : `"${args.path}" is a video file: add_video adds it.`,
    );
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
  if (isVideoFormat(media.format) !== video) {
    return fail(
      video
        ? `Not added: "${args.path}" is not a video. add_picture adds an image.`
        : `Not added: "${args.path}" is a video. add_video adds it.`,
    );
  }
  const ratio = media.width / media.height;
  const size =
    args.width !== undefined
      ? { width: args.width, height: args.height ?? args.width / ratio }
      : args.height !== undefined
        ? { width: args.height * ratio, height: args.height }
        : pictureSize(media);
  const at =
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
        ...at,
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
      placed: { ...at, ...size },
      ...(kept.removed.length > 0 ? { cleaned: kept.removed } : {}),
      ...(video
        ? {
            poster:
              'none: Visual Anything decodes no video, so the canvas shows a dark box with a play mark until the person presses "Make its poster" in its inspector, or plays it.',
          }
        : {}),
    }),
  );
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
  run: (args, program) => place(args, program, false),
});

const addVideo = tool({
  name: 'add_video',
  title: 'Add a video',
  description: `Adds a video to a view, as one undoable action: an MP4 of H.264 or a WebM of VP8, VP9 or AV1 inside the project folder, drawn loose on the canvas as a picture is, which plays muted and in a loop when the person clicks it. A video is drawing only; it is not part of the model.

${FILES}

Visual Anything reads the file's container strictly before it keeps it, into media/<hash>.mp4 or .webm, and overwrites, without moving anything, the metadata where phones keep a video's place and camera. A file is at most 50 MiB and 8,192 pixels a side; past 25 MiB, tell the person that it joins the project's git history. Undoing the action keeps the file.

Visual Anything decodes no video, so a video Claude adds has no poster, the still it shows until it plays: the canvas draws a dark box with a play mark and its name until the person presses "Make its poster" in its inspector. read_view lists it among pictures with video: true.

Its size is its own, scaled to fit 480 units a side, unless width or height is given (the other follows its proportions). Without x and y it goes under what the view draws. Give it a name that says what it shows.

Example: { "view": "system-overview", "path": "videos/check-in.mp4", "name": "A patient checking in" }`,
  input: {
    view: id(),
    path: z
      .string()
      .min(1)
      .max(1024)
      .describe('The video file’s path from the project folder, such as "videos/check-in.mp4".'),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    name: z.string().min(1).max(200).optional().describe('What it shows, in a few words.'),
  },
  hints: WRITE,
  run: (args, program) => place(args, program, true),
});

export const PICTURE_TOOLS: readonly Tool[] = [addPicture, addVideo];
