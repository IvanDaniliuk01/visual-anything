/**
 * Where a frame loads from (ADR 0107): `http://<label>.localhost:<port>/<nonce>/frame/<id>/<hash>`,
 * with a fresh random label for each frame, so that each is a site of its own and a frame that loops
 * never slows the next one; the port and the session's nonce, which is not the token, come once a
 * connection from the program's `explorables/listening`.
 */
import { explorableFrameAddress } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** How long a frame's label is: within the core's 16 to 32. */
const LABEL_LENGTH = 24;
const LABEL_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A fresh label of 24 lowercase letters and digits, from the browser's random numbers. */
export function frameLabel(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = defaultRandom,
): string {
  let label = '';
  while (label.length < LABEL_LENGTH) {
    for (const byte of random(new Uint8Array(LABEL_LENGTH))) {
      // 252 is the largest multiple of 36 below 256: the letters stay equally likely.
      if (byte < 252 && label.length < LABEL_LENGTH) label += LABEL_LETTERS[byte % 36];
    }
  }
  return label;
}

function defaultRandom(bytes: Uint8Array<ArrayBuffer>): Uint8Array {
  return crypto.getRandomValues(bytes);
}

/** The program's explorables' listener, as `explorables/listening` named it. */
export interface FrameListener {
  port: number;
  nonce: string;
}

/** A new frame's address, under a fresh label. */
export function newFrameAddress(listener: FrameListener, explorable: Id, hash: string): string {
  return explorableFrameAddress({
    label: frameLabel(),
    port: listener.port,
    nonce: listener.nonce,
    explorable,
    hash,
  });
}
