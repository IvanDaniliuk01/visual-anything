/**
 * The live connection's messages about a link card's preview (ADR 0098, stage 3):
 *
 * - `link/fetch`, from an app, only when the person presses Fetch the preview: the address to read;
 * - `link/fetched`, from the program: what the page's preview holds, its picture already kept in
 *   `media/`, and notes on what it left out;
 * - `link/refused`, from the program: why there is no preview.
 *
 * Each reader checks a message strictly and answers it, or why it cannot be read.
 */
import type { MediaRef } from '@visual-anything/schema';
import { readMediaRef } from '../media/messages';
import { isVideoFormat } from '../media/clean';
import type { ProblemCode } from '../problems';
import { LINK_CAPS, checkLinkAddress } from './address';

export interface LinkFetchMessage {
  type: 'link/fetch';
  requestId: string;
  /** The card's address; only an `https:` one is fetched. */
  url: string;
}

/** What a page's preview brought: each part only when the page had it. */
export interface LinkPreview {
  title?: string;
  description?: string;
  /** The preview image, cleaned and kept in `media/`: an image, never a video. */
  picture?: MediaRef;
}

export interface LinkFetchedMessage {
  type: 'link/fetched';
  requestId: string;
  preview: LinkPreview;
  /** What was left out, and why, such as an image that could not be had. */
  notes: string[];
}

export interface LinkRefusedMessage {
  type: 'link/refused';
  requestId: string;
  code: ProblemCode;
  message: string;
}

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

const MAX_REQUEST_ID = 128;

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function requestIdOf(message: Record<string, unknown>): string | undefined {
  const { requestId } = message;
  return typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID
    ? requestId
    : undefined;
}

function onlyKeys(message: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(message).every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, most: number): value is string {
  return typeof value === 'string' && value !== '' && value.length <= most;
}

/** Reads `link/fetch`, from an app: an address a card may hold. */
export function readLinkFetch(message: Record<string, unknown>): Read<LinkFetchMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'url'])) {
    return fail('link/fetch holds only its id and an address.');
  }
  const checked = checkLinkAddress(message.url);
  if (!checked.ok) return fail(`The address to fetch ${checked.reason}.`);
  return { ok: true, value: { type: 'link/fetch', requestId, url: checked.url } };
}

/** Reads `link/fetched`, from the program. */
export function readLinkFetched(message: Record<string, unknown>): Read<LinkFetchedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'preview', 'notes'])) {
    return fail('link/fetched holds nothing else.');
  }
  const { preview, notes } = message;
  if (!isRecord(preview) || !onlyKeys(preview, ['title', 'description', 'picture'])) {
    return fail('A preview holds a title, a description and a picture, and nothing else.');
  }
  const { title, description, picture } = preview;
  if (title !== undefined && !isText(title, LINK_CAPS.title)) {
    return fail(`A preview's title is text of 1 to ${LINK_CAPS.title} characters.`);
  }
  if (description !== undefined && !isText(description, LINK_CAPS.description)) {
    return fail(`A preview's description is text of 1 to ${LINK_CAPS.description} characters.`);
  }
  const ref = picture === undefined ? undefined : readMediaRef(picture);
  if (picture !== undefined && (ref === undefined || isVideoFormat(ref.format))) {
    return fail("A preview's picture is an image of media/, named by its hash, format and sizes.");
  }
  if (
    !Array.isArray(notes) ||
    notes.length > 10 ||
    !notes.every((note) => typeof note === 'string' && note.length <= 1000)
  ) {
    return fail('A preview says what it left out, line by line.');
  }
  return {
    ok: true,
    value: {
      type: 'link/fetched',
      requestId,
      preview: {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(ref === undefined ? {} : { picture: ref }),
      },
      notes: [...(notes as string[])],
    },
  };
}

/** Reads `link/refused`, from the program. */
export function readLinkRefused(message: Record<string, unknown>): Read<LinkRefusedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'code', 'message'])) {
    return fail('link/refused holds nothing else.');
  }
  const { code, message: text } = message;
  if (!isText(code, 64) || !isText(text, 2000)) return fail('A refusal says its code and why.');
  return {
    ok: true,
    value: { type: 'link/refused', requestId, code: code as ProblemCode, message: text },
  };
}
