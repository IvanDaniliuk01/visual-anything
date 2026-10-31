/**
 * Solids' pictures on the canvas (ADR 0075), between the solid client, which has the solid worker draw
 * them off the page's thread, and the image store, which makes their textures within its budgets:
 *
 * - **Asking.** Each frame, the canvas says which solids show and how large, and how far each is from
 *   the middle of the screen; the client asks the worker for those nearest the middle first. While
 *   the camera moves, a picture already kept in some size is not asked for in another: it is asked
 *   once the camera rests. None is asked for while the canvas is zoomed out past every picture's scale,
 *   since nothing then shows one.
 * - **Textures.** A picture the client keeps is made a texture by the image store, at most one a
 *   frame, those nearest the middle first: in an atlas page when it is 256 pixels or fewer on its
 *   longer side, as a texture of its own otherwise. Until its own is made, another size of the same
 *   picture stands in; until any is, its shape draws its placeholder.
 * - **Themes.** Pictures are the same in both themes: no key holds a color, and the shape's fill shows
 *   behind their transparent background, drawn under them.
 */
import type { ImageStore, ImageTexture } from '../images';
import { solidAskFor, type SolidClient, type SolidPicture, type SolidPictureAsk } from '../../solids/client';
import { solidPictureKey, type ShapeSolid } from '../shape-solids';

/** How a frame sees the canvas, as far as pictures go. */
export interface SolidPictureView {
  /** Device pixels to a canvas unit. */
  pixelsPerUnit: number;
  /** Whether the camera rests. */
  settled: boolean;
  /** The middle of the screen, in canvas units. */
  middle: { x: number; y: number };
}

/** A picture to draw, and the part buffer that comes with it, if any. */
export interface SolidTexture<T> extends ImageTexture<T> {
  picture: SolidPicture;
}

/** The pictures of the solids a canvas draws, and the textures they are drawn with. */
export class SolidPictures<T, P = unknown> {
  /** What this frame asked for, by key and bucket; sent when it differs from what was sent. */
  #asks = new Map<string, SolidPictureAsk>();
  /** What faces asked for, kept until it arrives: they paint again only once a texture is made. */
  readonly #standing = new Map<string, SolidPictureAsk>();
  #sent = '';
  readonly #unsubscribe: (() => void) | undefined;

  constructor(
    readonly client: SolidClient | undefined,
    readonly store: ImageStore<T, P>,
    onArrive: () => void = () => {},
  ) {
    this.#unsubscribe = client?.subscribe(() => onArrive());
  }

  /** Whether solids can be drawn at all: a client that the build did not find without a worker. */
  get available(): boolean {
    return this.client !== undefined && !this.client.unavailable;
  }

  /** The picture kept for a shape's solid at this many device pixels, or the nearest kept; none yet. */
  pictureOf(
    shape: { solid?: ShapeSolid },
    pixels: number,
  ): { picture: SolidPicture; exact: boolean } | undefined {
    const key = solidPictureKey(shape);
    if (key === undefined || !this.available) return undefined;
    return this.client?.picture(key, pixels);
  }

  /**
   * Notes that a shape's solid shows this frame, `pixels` device pixels on its longer side and
   * `distance` from the middle of the screen. With `standing`, as for a face, it stays asked for until
   * its picture arrives.
   */
  want(
    shape: { solid?: ShapeSolid },
    pixels: number,
    distance: number,
    settled: boolean,
    standing = false,
  ): void {
    if (!this.available) return;
    const ask = solidAskFor(shape, pixels, distance);
    if (!ask) return;
    const kept = this.client?.picture(ask.key, pixels);
    if (kept?.exact) {
      this.#standing.delete(ask.key);
      return;
    }
    // While the camera moves, a picture kept in another size shows until it rests.
    if (kept && !settled) return;
    const known = this.#asks.get(ask.key);
    if (!known || known.distance > distance || known.pixels < pixels) this.#asks.set(ask.key, ask);
    if (standing) this.#standing.set(ask.key, ask);
  }

  /** Sends what the frame asked for, when it changed since it was last sent. */
  flush(): void {
    if (!this.available) {
      this.#asks.clear();
      return;
    }
    for (const [key, ask] of this.#standing) {
      if (this.client?.picture(key, ask.pixels)?.exact) this.#standing.delete(key);
      else if (!this.#asks.has(key)) this.#asks.set(key, ask);
    }
    const asks = [...this.#asks.values()].sort((a, b) => a.distance - b.distance);
    this.#asks = new Map();
    const sent = asks.map((ask) => `${ask.key}@${Math.round(ask.pixels)}`).join('\n');
    if (sent === this.#sent) return;
    this.#sent = sent;
    this.client?.ask(asks);
  }

  /**
   * The texture to draw a shape's solid with now, `pixels` device pixels on its longer side, for the
   * tile `tile`; none to draw its placeholder. It asks for what is missing.
   */
  texture(
    shape: { solid?: ShapeSolid },
    pixels: number,
    distance: number,
    tile: string,
    settled: boolean,
  ): SolidTexture<T> | undefined {
    const key = solidPictureKey(shape);
    if (key === undefined || !this.available) return undefined;
    this.want(shape, pixels, distance, settled);
    const kept = this.client?.picture(key, pixels);
    if (!kept) return undefined;
    const { picture } = kept;
    const made = this.store.readyTexture({
      serial: picture.serial,
      group: key,
      picture: picture.bitmap as unknown as P,
      width: picture.width,
      height: picture.height,
      distance,
      tile,
    });
    if (!made) return undefined;
    return { ...made, exact: made.exact && kept.exact, picture };
  }

  /**
   * What a shape's picture is drawn from now, for the key of its tile's drawing: the picture kept for
   * it at this size, and whether its texture is made, so that a tile draws again when either changes.
   */
  stateOf(shape: { solid?: ShapeSolid }, pixels: number): string {
    const kept = this.pictureOf(shape, pixels);
    return kept ? `${kept.picture.serial}${kept.exact ? '' : '~'}` : '-';
  }

  /** Stops following the client; the client itself is the app's, which disposes of it. */
  dispose(): void {
    this.#unsubscribe?.();
  }
}
