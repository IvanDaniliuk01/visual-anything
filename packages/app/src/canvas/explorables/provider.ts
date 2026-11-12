/**
 * A canvas's side of explorables' stills (ADR 0107, A10.3): it gives the explorable layer each
 * explorable's face and the still of each spot, and asks the tab's stills for those missing while
 * the canvas rests. A spot's still is keyed by `stillKey`: the frame's inputs, the data the spot
 * gives, which holds the theme, the language, the parameters (their defaults on the canvas) and its
 * size, and the bucket. The key and data of a spot are worked out once for each set of inputs, not
 * each frame; a spot keeps showing the still it showed last until its new one arrives.
 */
import {
  explorableData,
  stillKey,
  type ExplorableDataInput,
  type ProjectSnapshot,
  type VaData,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { ExplorableFace } from '../../explorables/card-layout';
import type { ExplorableStills, KeptStill } from '../../explorables/stills';
import type { StillJob } from '../../explorables/still-queue';
import type { ExplorableProvider, StillPicture, StillSpot } from './layer';

/** What a canvas's stills are worked out from. */
export interface CanvasExplorablesInput {
  project: ProjectSnapshot;
  faces: ReadonlyMap<Id, ExplorableFace>;
  theme: 'light' | 'dark';
  language: 'en' | 'es';
  /** The computed, live and simulated values of an element, as everything else reads them. */
  sources: NonNullable<ExplorableDataInput['sources']>;
}

interface Keyed {
  key: string;
  data: VaData;
  hash: string;
}

/** What a spot's key was last worked out from, kept on the spot the layer reuses each frame. */
interface LastKeyed {
  input: CanvasExplorablesInput;
  explorable: Id;
  element: Id | undefined;
  width: number;
  height: number;
  bucket: number;
  keyed: Keyed;
}

export class CanvasExplorables implements ExplorableProvider {
  readonly #stills: ExplorableStills | undefined;
  #input: CanvasExplorablesInput | undefined;
  /** The key and data of each spot at a size and bucket, for the inputs given last. */
  readonly #keyed = new Map<string, Keyed>();
  /** The key each spot object was last given, so that a frame that changes nothing builds nothing. */
  readonly #last = new WeakMap<object, LastKeyed>();
  /** The still each spot showed last, by spot. */
  readonly #shown = new Map<string, { explorable: Id; still: StillPicture }>();
  #wants: StillJob<KeptStill>[] = [];
  #pending = false;

  /** Whether it asks for stills and keeps showing the last one: not for an image drawn off screen. */
  readonly #asks: boolean;

  constructor(stills: ExplorableStills | undefined, asks = true) {
    this.#stills = stills;
    this.#asks = asks;
  }

  forImage(theme: 'light' | 'dark'): CanvasExplorables {
    const image = new CanvasExplorables(this.#stills, false);
    if (this.#input) image.update({ ...this.#input, theme });
    return image;
  }

  /** New inputs: keys are worked out again as spots ask. */
  update(input: CanvasExplorablesInput): void {
    this.#input = input;
    this.#keyed.clear();
  }

  face(explorable: Id): ExplorableFace | undefined {
    return this.#input?.faces.get(explorable);
  }

  still(spot: Readonly<StillSpot>, settled: boolean): StillPicture | undefined {
    const input = this.#input;
    const stills = this.#stills;
    const face = input?.faces.get(spot.explorable);
    if (!input || !stills || !face?.runs || face.hash === undefined) {
      this.#shown.delete(spot.spot);
      return undefined;
    }
    const keyed = this.#keyOf(input, spot, face.hash);
    const kept = stills.queue.result(keyed.key);
    if (kept?.ok && kept.picture !== undefined && !this.#asks) {
      return { key: kept.key, picture: kept.picture, width: kept.width, height: kept.height };
    }
    if (!this.#asks) return undefined;
    if (kept?.ok && kept.picture !== undefined) {
      const shown = this.#shown.get(spot.spot);
      if (shown?.explorable === spot.explorable && shown.still.key === kept.key) return shown.still;
      const still: StillPicture = {
        key: kept.key,
        picture: kept.picture,
        width: kept.width,
        height: kept.height,
      };
      this.#shown.set(spot.spot, { explorable: spot.explorable, still });
      return still;
    }
    if (
      kept === undefined &&
      settled &&
      stills.queue.running !== keyed.key &&
      !this.#wants.some((each) => each.key === keyed.key)
    ) {
      const job = stills.job({
        key: keyed.key,
        explorable: spot.explorable,
        hash: keyed.hash,
        data: keyed.data,
        width: spot.bucket,
        distance: spot.distance,
      });
      if (job) this.#wants.push(job);
    }
    const shown = this.#shown.get(spot.spot);
    return shown?.explorable === spot.explorable ? shown.still : undefined;
  }

  flush(settled: boolean): void {
    const stills = this.#stills;
    if (!stills || !this.#asks) return;
    if (!settled) {
      // Nothing new starts while the camera moves: what waited is asked for again at rest.
      if (this.#pending) stills.queue.want([]);
      this.#pending = false;
      this.#wants = [];
      return;
    }
    if (this.#wants.length === 0) return;
    stills.queue.want(this.#wants);
    this.#pending = true;
    this.#wants = [];
  }

  #keyOf(input: CanvasExplorablesInput, spot: Readonly<StillSpot>, hash: string): Keyed {
    const last = this.#last.get(spot);
    if (
      last &&
      last.input === input &&
      last.explorable === spot.explorable &&
      last.element === spot.element &&
      last.width === spot.width &&
      last.height === spot.height &&
      last.bucket === spot.bucket &&
      last.keyed.hash === hash
    ) {
      return last.keyed;
    }
    const signature = `${spot.explorable}\u0000${spot.element ?? ''}\u0000${spot.width}\u0000${spot.height}\u0000${spot.bucket}\u0000${hash}`;
    let keyed = this.#keyed.get(signature);
    if (!keyed) {
      const data = explorableData(input.project, {
        explorable: spot.explorable,
        ...(spot.element === undefined ? {} : { element: spot.element }),
        theme: input.theme,
        language: input.language,
        size: { width: spot.width, height: spot.height },
        sources: input.sources,
      });
      keyed = { key: stillKey(hash, data, spot.bucket), data, hash };
      this.#keyed.set(signature, keyed);
    }
    this.#last.set(spot, {
      input,
      explorable: spot.explorable,
      element: spot.element,
      width: spot.width,
      height: spot.height,
      bucket: spot.bucket,
      keyed,
    });
    return keyed;
  }
}
