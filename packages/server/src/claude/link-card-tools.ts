/**
 * Claude's tool for link cards (ADR 0098, stage 3): `add_link_card` places a card that holds a web
 * address, a title, an optional description and an optional picture, an image file inside the
 * project folder kept as a media file as `add_picture` keeps one. It never fetches anything: only
 * the person fetches a card's preview, by pressing Fetch the preview in its inspector. `read_view`
 * lists cards under `links`, and `update_free_shape` and `delete_free_shapes` take them.
 */
import {
  LINK_CAPS,
  LINK_CARD_SIZE,
  checkLinkAddress,
  isVideoFormat,
  linkHost,
  linkPictureGrowth,
  mediaFileName,
} from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import { z } from 'zod';
import { WRITE, act, fail, id, tool } from './kit';
import { placeBelow } from './picture-tools';
import type { Tool } from './tools';

const addLinkCard = tool({
  name: 'add_link_card',
  title: 'Add a link card',
  description: `Adds a link card to a view, as one undoable action: a card that holds a web address, a title, and an optional description and picture, drawn loose on the canvas as a note is. A click on its address opens it in a new tab of the person's browser; nothing of the page is embedded. A link card is drawing only; it is not part of the model.

Visual Anything never fetches anything for Claude: give the title, and a description if it helps, yourself. The person can fetch the page's own title, description and image by pressing "Fetch the preview" in the card's inspector, the only time Visual Anything reaches the internet.

url is an https or http address. title is one line of at most ${LINK_CAPS.title} characters; description at most ${LINK_CAPS.description.toLocaleString('en-US')}. picture, optional, is an image file inside the project folder, named by its path from the folder, such as "photos/guide.png", kept as add_picture keeps one; never an address.

A card is ${LINK_CARD_SIZE.width} by ${LINK_CARD_SIZE.height} units, taller by its picture's height at its width, at most ${LINK_CARD_SIZE.pictureMost} more, unless width or height is given. Without x and y it goes under what the view draws.

Example: { "view": "system-overview", "url": "https://example.org/intake-guide", "title": "The intake guide", "description": "How a patient is received at the front desk." }`,
  input: {
    view: id(),
    url: z.string().min(1).max(LINK_CAPS.url).describe('The web address, https or http.'),
    title: z.string().min(1).max(LINK_CAPS.title).describe('What the card shows first: one line.'),
    description: z.string().min(1).max(LINK_CAPS.description).optional(),
    picture: z
      .string()
      .min(1)
      .max(1024)
      .optional()
      .describe('An image file’s path from the project folder, such as "photos/guide.png".'),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  },
  hints: WRITE,
  run: async (args, program) => {
    const address = checkLinkAddress(args.url);
    if (!address.ok) {
      return fail(`"${args.url}" ${address.reason}: a link card holds an https or http address.`);
    }
    const state = await program.project();
    const view = state.views.find((each) => each.id === args.view);
    if (view === undefined) return fail(`There is no view "${args.view}".`);
    let picture: MediaRef | undefined;
    let cleaned: string[] = [];
    if (args.picture !== undefined) {
      if (/^\s*[a-z][a-z0-9+.-]+:/i.test(args.picture)) {
        return fail(
          `"${args.picture}" is an address: Visual Anything never fetches anything for Claude. Name an image file inside the project folder, or leave the picture to the person's Fetch the preview.`,
        );
      }
      if (program.keepPictureFile === undefined) {
        return fail('Not added: this Visual Anything cannot keep pictures for Claude.');
      }
      const kept = await program.keepPictureFile(args.picture);
      if (kept.type === 'media/refused') return fail(`Not added: ${kept.message} (${kept.code})`);
      if (isVideoFormat(kept.media.format)) {
        return fail(`Not added: "${args.picture}" is a video; a link card's picture is an image.`);
      }
      picture = kept.media;
      cleaned = kept.removed;
    }
    const width = args.width ?? LINK_CARD_SIZE.width;
    const height =
      args.height ??
      LINK_CARD_SIZE.height + (picture === undefined ? 0 : linkPictureGrowth(width, picture));
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
          kind: 'link',
          ...at,
          width,
          height,
          url: address.url,
          title: args.title,
          ...(args.description === undefined ? {} : { description: args.description }),
          ...(picture === undefined ? {} : { picture }),
        },
      },
      (answer) => ({
        shape: answer.created[0],
        url: address.url,
        host: linkHost(address.url),
        placed: { ...at, width, height },
        ...(picture === undefined ? {} : { picture: `media/${mediaFileName(picture)}` }),
        ...(cleaned.length > 0 ? { cleaned } : {}),
        preview:
          'not fetched: Visual Anything fetches nothing for Claude. The person can fetch the page’s own title, description and image with "Fetch the preview" in the card’s inspector.',
      }),
    );
  },
});

export const LINK_CARD_TOOLS: readonly Tool[] = [addLinkCard];
