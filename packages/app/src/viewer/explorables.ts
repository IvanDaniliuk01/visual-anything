/**
 * What the read-only page's canvas draws of explorables (ADR 0107): nothing of an explorable runs in
 * a page (ADR 0041), so each place that shows one draws the still the page holds of it there, in the
 * theme shown, or else its card, the one every place draws, from the core's card (`explorableCard`):
 * outside the app, it says that it runs only in Visual Anything. Each still is decoded once, the
 * first time its place is drawn, and drawn from the next frame.
 */
import { explorableCard, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { explorableCardTexts, type ExplorableFace } from '../explorables/card-layout';
import type { ExplorableProvider, StillPicture, StillSpot } from '../canvas/explorables/layer';
import type { Translator } from '../i18n';
import type { PageStill } from './data';

/** What the page's explorables are drawn from: the project, the view and the theme shown. */
export interface PageExplorablesInput {
  project: ProjectSnapshot;
  view: Id;
  theme: 'light' | 'dark';
  t: Translator;
}

/** Decodes a still's PNG for the canvas; none where nothing decodes, as in tests. */
export type DecodeStill = (png: Uint8Array) => Promise<unknown>;

const decodeInPage: DecodeStill = (png) =>
  typeof createImageBitmap === 'function'
    ? createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    : Promise.resolve(undefined);

export class PageExplorables implements ExplorableProvider {
  #input: PageExplorablesInput | undefined;
  readonly #faces = new Map<Id, ExplorableFace>();
  /** The stills the page holds, by view, place and theme. */
  readonly #stills = new Map<string, PageStill>();
  /** Each still decoded, by the same key; null while it decodes, or when it did not. */
  readonly #decoded = new Map<string, unknown>();
  readonly #decode: DecodeStill;
  /** Called when a still was decoded, so that the canvas draws it. */
  #onChange: () => void = () => {};

  constructor(stills: readonly PageStill[] = [], decode: DecodeStill = decodeInPage) {
    for (const still of stills) this.#stills.set(keyOf(still.view, still.spot, still.theme), still);
    this.#decode = decode;
  }

  /** Tells `listener` when a still was decoded; answers what stops it. */
  listen(listener: () => void): () => void {
    this.#onChange = listener;
    return () => {
      if (this.#onChange === listener) this.#onChange = () => {};
    };
  }

  /** New inputs: cards are said again in the language read in. */
  update(input: PageExplorablesInput): void {
    this.#input = input;
    this.#faces.clear();
  }

  face(explorable: Id): ExplorableFace | undefined {
    const input = this.#input;
    if (!input) return undefined;
    let face = this.#faces.get(explorable);
    if (!face) {
      const card = explorableCard(input.project, explorable);
      face = { ...explorableCardTexts(input.t, card), runs: false };
      this.#faces.set(explorable, face);
    }
    return face;
  }

  still(spot: Readonly<StillSpot>): StillPicture | undefined {
    const input = this.#input;
    if (!input) return undefined;
    const key = keyOf(input.view, spot.spot, input.theme);
    const held = this.#stills.get(key);
    if (!held || held.explorable !== spot.explorable) return undefined;
    if (this.#decoded.has(key)) {
      const picture = this.#decoded.get(key);
      return picture === null || picture === undefined
        ? undefined
        : { key: `page ${key}`, picture, width: held.width, height: held.height };
    }
    this.#decoded.set(key, null);
    this.#decode(held.png).then(
      (picture) => {
        this.#decoded.set(key, picture ?? null);
        if (picture !== undefined && picture !== null) this.#onChange();
      },
      () => this.#decoded.set(key, null),
    );
    return undefined;
  }

  flush(): void {}
}

function keyOf(view: Id, spot: string, theme: 'light' | 'dark'): string {
  return `${view}\n${spot}\n${theme}`;
}
