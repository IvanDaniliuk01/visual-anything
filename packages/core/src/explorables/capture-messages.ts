/**
 * A still of an explorable for Claude (ADR 0107, A10.3), on the live connection, as a picture of a
 * view travels (ADR 0081): Claude's `capture_explorable` reaches the program, which sends
 * `explorable-capture/request` to every open app; the tab the person used last answers with
 * `explorable-capture/answer`, matched by the request's id: the still the explorable drew of itself
 * in the app's hidden frame, cleaned, with its console errors and whether it said `va.ready()`; or
 * why it took none. Every other tab passes it over, saying so. The program waits 20 s. Nothing
 * changes: no file, no history, no approval. Protocol 16 carries both.
 */
import type { ExplorableParameterValue, Id } from '@visual-anything/schema';
import { base64Length } from '../capture';
import { isId } from '../ids';
import {
  MAX_FRAME_ERROR,
  MAX_PARAMETERS,
  MAX_PARAMETER_TEXT,
  MAX_STILL_BYTES,
  PARAMETER_NAME,
  isParameterValue,
} from './messages';
import { isStillBucket } from './stills';
import { MAX_CONSOLE_ERRORS } from './types';

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What a still of an explorable is asked for. */
export interface ExplorableCaptureAsk {
  explorable: Id;
  /** The element whose data it reads, as an element that shows it gives its own; none when left out. */
  element?: Id;
  /** The values of its parameters, by name; those left out take their defaults. */
  parameters?: Record<string, ExplorableParameterValue>;
  /** The still's width, in pixels: one of the still buckets, 256, 512 or 1,024. */
  width: number;
  /** The theme it is drawn in; the tab's when left out. */
  theme?: 'light' | 'dark';
}

/** Asks the open apps for a still of an explorable; the tab the person used last answers. */
export interface ExplorableCaptureRequestMessage extends ExplorableCaptureAsk {
  type: 'explorable-capture/request';
  requestId: string;
}

/** A still an app took: a PNG in base64, cleaned by the core's bitmap reader. */
export interface ExplorableStill {
  png: string;
  width: number;
  height: number;
}

/** Why an app could not draw a still: not approved, stopped by its watchdog, or failed. */
export type ExplorableCaptureFailure = 'not-approved' | 'stopped' | 'failed';
export const EXPLORABLE_CAPTURE_FAILURES: readonly ExplorableCaptureFailure[] = [
  'not-approved',
  'stopped',
  'failed',
];

/** The longest reason a still could not be taken that an answer carries. */
export const MAX_EXPLORABLE_CAPTURE_WHY = 500;

/** The app's answer: exactly one of a still, a pass and a failure. */
export type ExplorableCaptureAnswerMessage = {
  type: 'explorable-capture/answer';
  requestId: string;
} & (
  | { still: ExplorableStill; errors: string[]; ready: boolean }
  | { passed: 'other-tab' }
  | { failed: ExplorableCaptureFailure; why?: string; errors?: string[] }
);

/**
 * What the program tells Claude: how many open apps were asked; the still and its console errors,
 * or why there is none: the app could not draw it (`failure`), or no app answered (`unanswered`),
 * `unsupported` when the program asks no app.
 */
export interface ExplorableCaptureReport {
  apps: number;
  still?: ExplorableStill;
  /** Its console errors, oldest first: at most 50, each at most 2,000 characters. */
  errors?: string[];
  /** Whether it said `va.ready()` before its still was taken. */
  ready?: boolean;
  failure?: { reason: ExplorableCaptureFailure; message?: string };
  unanswered?: 'passed' | 'timed-out' | 'gone' | 'unsupported';
  /** How long the program waited, in milliseconds. */
  waited?: number;
}

/** Base64 as PNG's bytes start: the signature `\x89PNG\r\n\x1a\n`. */
const PNG_START = 'iVBORw0KGgo';
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_REQUEST_ID = 100;

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

/** Reads what a still is asked for, keeping only what it holds. */
export function readExplorableCaptureAsk(
  message: Record<string, unknown>,
): Read<ExplorableCaptureAsk> {
  const { explorable, element, parameters, width, theme } = message;
  if (!isId(explorable)) return fail('A still names its explorable by id.');
  if (element !== undefined && !isId(element)) return fail('A still names its element by id.');
  if (!isStillBucket(width)) return fail('A still is 256, 512 or 1,024 pixels wide.');
  if (theme !== undefined && theme !== 'light' && theme !== 'dark') {
    return fail('A still is drawn in the light or the dark theme.');
  }
  let values: Record<string, ExplorableParameterValue> | undefined;
  if (parameters !== undefined) {
    if (!isRecord(parameters)) return fail('A still’s parameters are an object.');
    const names = Object.keys(parameters);
    if (names.length > MAX_PARAMETERS) {
      return fail(`A still sets at most ${MAX_PARAMETERS} parameters.`);
    }
    for (const name of names) {
      const value = parameters[name];
      if (!PARAMETER_NAME.test(name) || !isParameterValue(value)) {
        return fail(
          'A parameter is named as va.data names one, and is a number, a boolean or text.',
        );
      }
      if (typeof value === 'string' && value.length > MAX_PARAMETER_TEXT) {
        return fail(`A parameter's text is at most ${MAX_PARAMETER_TEXT} characters.`);
      }
    }
    values = Object.fromEntries(
      names.map((name) => [name, parameters[name] as ExplorableParameterValue]),
    );
  }
  return {
    ok: true,
    value: {
      explorable,
      ...(element === undefined ? {} : { element }),
      ...(values === undefined ? {} : { parameters: values }),
      width,
      ...(theme === undefined ? {} : { theme }),
    },
  };
}

/** Reads `explorable-capture/request`, from the program, strictly. */
export function readExplorableCaptureRequest(
  message: Record<string, unknown>,
): Read<ExplorableCaptureRequestMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  const keys = ['type', 'requestId', 'explorable', 'element', 'parameters', 'width', 'theme'];
  if (!onlyKeys(message, keys)) return fail('A still’s request holds only what a still asks.');
  const ask = readExplorableCaptureAsk(message);
  if (!ask.ok) return ask;
  return { ok: true, value: { type: 'explorable-capture/request', requestId, ...ask.value } };
}

/** Reads a still strictly: a PNG in base64 within its cap, at a still's width, at most 4 times as tall. */
export function readExplorableStill(value: unknown): Read<ExplorableStill> {
  if (!isRecord(value) || !onlyKeys(value, ['png', 'width', 'height'])) {
    return fail('A still holds its PNG, its width and its height.');
  }
  const { png, width, height } = value;
  if (typeof png !== 'string' || png.length > base64Length(MAX_STILL_BYTES)) {
    return fail(`A still is a PNG of at most ${MAX_STILL_BYTES} bytes, in base64.`);
  }
  if (png.length % 4 !== 0 || !png.startsWith(PNG_START) || !BASE64.test(png)) {
    return fail('A still is a PNG in base64.');
  }
  if (!isStillBucket(width)) return fail('A still is 256, 512 or 1,024 pixels wide.');
  if (!Number.isSafeInteger(height) || (height as number) < 1 || (height as number) > 4 * width) {
    return fail('A still is at most four times as tall as it is wide.');
  }
  return { ok: true, value: { png, width, height: height as number } };
}

/** Reads a frame's console errors as an answer carries them: at most 50, each cut to 2,000. */
function readErrors(value: unknown): Read<string[]> {
  if (
    !Array.isArray(value) ||
    value.length > MAX_CONSOLE_ERRORS ||
    !value.every((each) => typeof each === 'string' && each.length <= MAX_FRAME_ERROR)
  ) {
    return fail(
      `A still's console errors are at most ${MAX_CONSOLE_ERRORS} texts of at most ${MAX_FRAME_ERROR} characters.`,
    );
  }
  return { ok: true, value: [...(value as string[])] };
}

/** Reads `explorable-capture/answer`, from an app, strictly: exactly one of a still, a pass and a failure. */
export function readExplorableCaptureAnswer(
  message: Record<string, unknown>,
): Read<ExplorableCaptureAnswerMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  const { still, passed, failed, errors, ready, why } = message;
  const given = [still, passed, failed].filter((each) => each !== undefined).length;
  if (given !== 1) {
    return fail('A still’s answer gives a still, why the tab passed it over, or why it failed.');
  }
  const head = { type: 'explorable-capture/answer' as const, requestId };
  if (still !== undefined) {
    if (!onlyKeys(message, ['type', 'requestId', 'still', 'errors', 'ready'])) {
      return fail('A still’s answer holds its still, its console errors and whether it was ready.');
    }
    const read = readExplorableStill(still);
    if (!read.ok) return read;
    const listed = readErrors(errors);
    if (!listed.ok) return listed;
    if (typeof ready !== 'boolean') return fail('A still’s answer says whether it was ready.');
    return { ok: true, value: { ...head, still: read.value, errors: listed.value, ready } };
  }
  if (passed !== undefined) {
    if (passed !== 'other-tab' || !onlyKeys(message, ['type', 'requestId', 'passed'])) {
      return fail('A tab passes a still over as other-tab.');
    }
    return { ok: true, value: { ...head, passed } };
  }
  if (!onlyKeys(message, ['type', 'requestId', 'failed', 'why', 'errors'])) {
    return fail('A failed still’s answer holds why, and its console errors.');
  }
  if (!EXPLORABLE_CAPTURE_FAILURES.some((each) => each === failed)) {
    return fail(`A still fails as one of: ${EXPLORABLE_CAPTURE_FAILURES.join(', ')}.`);
  }
  if (why !== undefined && (typeof why !== 'string' || why.length > MAX_EXPLORABLE_CAPTURE_WHY)) {
    return fail(
      `Why a still failed is a text of at most ${MAX_EXPLORABLE_CAPTURE_WHY} characters.`,
    );
  }
  let kept: string[] | undefined;
  if (errors !== undefined) {
    const listed = readErrors(errors);
    if (!listed.ok) return listed;
    kept = listed.value;
  }
  return {
    ok: true,
    value: {
      ...head,
      failed: failed as ExplorableCaptureFailure,
      ...(why === undefined ? {} : { why }),
      ...(kept === undefined ? {} : { errors: kept }),
    },
  };
}
