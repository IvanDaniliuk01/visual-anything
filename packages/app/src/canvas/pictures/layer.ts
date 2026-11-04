/**
 * The canvas's pictures (ADR 0098): free shapes that show a media file, drawn in a layer of their own
 * with the free shapes, above the anchored shapes, so that adding, moving or playing one never
 * rebuilds a tile.
 *
 * - A picture's file is asked for once it comes near the screen, and decoded off the frame into a
 *   texture no larger than it shows on screen, rounded up to the image store's buckets when the camera
 *   rests, and never past 2,048 pixels a side (`pictureBucket`). At most one texture is made a frame,
 *   nearest the middle of the screen first, and a sharper one replaces the one shown once it is made.
 * - A GIF plays while it is on screen, one frame composed at a time from its delays (`GifPlayer`).
 *   Under reduced motion (ADR 0077) it shows its first frame, and plays while the pointer is on it.
 * - While its file comes it is drawn as a gray box; a file that is missing, or no longer what cleaning
 *   writes, is drawn as a gray box with its name and a warning, never as an error.
 */
import {
  CanvasSource,
  Container,
  Graphics,
  ImageSource,
  Sprite,
  Text,
  Texture,
  type TextureSource,
} from 'pixi.js';
import { parseGif, type GifDocument } from '@visual-anything/core';
import type { Id, MediaRef } from '@visual-anything/schema';
import type { Rect } from '../geometry';
import { loadSvgPicture, newCanvas } from '../images';
import type { PictureShape } from '../scene';
import { GifPlayer, pictureBucket, textureSize, type MediaFiles } from './media';

/** A picture decoded at one size: still, or a GIF that plays. */
export type DecodedPicture =
  | { kind: 'still'; texture: Texture }
  | { kind: 'gif'; texture: Texture; player: GifPlayer; draw: (rgba: Uint8ClampedArray) => void };

/** What the layer needs from the browser and the GPU; tests give it a fake. */
export interface PicturePlatform {
  now(): number;
  /** Decodes a media file at a size, off the frame where the browser can. */
  decode(
    bytes: Uint8Array,
    media: MediaRef,
    width: number,
    height: number,
  ): Promise<DecodedPicture>;
  /** Asks for a frame at a time from now, in milliseconds, as a GIF's next frame is due. */
  later(ms: number, then: () => void): void;
}

/** The colors a missing picture is drawn in, by theme. */
export interface PictureColors {
  box: number;
  border: number;
  text: number;
  warning: number;
}

const LIGHT: PictureColors = { box: 0xe4e4e7, border: 0xa1a1aa, text: 0x3f3f46, warning: 0xb45309 };
const DARK: PictureColors = { box: 0x3f3f46, border: 0x71717a, text: 0xe4e4e7, warning: 0xfbbf24 };

/** What the layer is told of the camera each frame. */
export interface PictureView {
  scale: number;
  shown: Rect;
  resolution: number;
  settled: boolean;
}

interface Source {
  key: string;
  media: MediaRef;
  bucket: number;
  state: 'waiting' | 'loading' | 'ready' | 'missing';
  decoded?: DecodedPicture;
  distance: number;
}

interface Entry {
  shape: PictureShape;
  node: Container;
  box: Graphics;
  label?: Container;
  sprite?: Sprite;
  /** The source the sprite shows, and the one asked for that will replace it. */
  shown?: Source;
  wanted?: Source;
  dim: boolean;
}

/** How many pictures decode at once. */
const DECODING_AT_ONCE = 2;

export class PictureLayer {
  readonly container = new Container();
  readonly #files: () => MediaFiles | undefined;
  readonly #platform: PicturePlatform;
  readonly #requestRender: () => void;
  readonly #reducedMotion: () => boolean;
  readonly #entries = new Map<Id, Entry>();
  readonly #sources = new Map<string, Source>();
  #colors = LIGHT;
  #hovered: Id | undefined;
  #decoding = 0;
  #timer = false;
  #shapes: readonly PictureShape[] = [];

  constructor(options: {
    files: () => MediaFiles | undefined;
    platform?: PicturePlatform;
    requestRender: () => void;
    reducedMotion?: () => boolean;
  }) {
    this.#files = options.files;
    this.#platform = options.platform ?? browserPicturePlatform();
    this.#requestRender = options.requestRender;
    this.#reducedMotion = options.reducedMotion ?? (() => false);
  }

  /** The pictures to draw, without those hidden, those dimmed drawn faded. */
  setScene(
    pictures: readonly PictureShape[],
    hidden: ReadonlySet<Id> = new Set(),
    dimmed: ReadonlySet<Id> = new Set(),
  ): void {
    this.#shapes = pictures;
    const seen = new Set<Id>();
    pictures.forEach((shape, at) => {
      if (hidden.has(shape.id)) return;
      seen.add(shape.id);
      let entry = this.#entries.get(shape.id);
      if (entry && entry.shape.media.hash !== shape.media.hash) {
        this.#drop(entry);
        entry = undefined;
      }
      if (!entry) {
        const node = new Container();
        const box = new Graphics();
        node.addChild(box);
        entry = { shape, node, box, dim: false };
        this.#entries.set(shape.id, entry);
        this.container.addChild(node);
      }
      const moved = entry.shape !== shape;
      entry.shape = shape;
      entry.dim = dimmed.has(shape.id);
      entry.node.alpha = entry.dim ? 0.3 : 1;
      this.container.setChildIndex(entry.node, Math.min(at, this.container.children.length - 1));
      if (moved || !entry.sprite) this.#paint(entry);
    });
    for (const [id, entry] of this.#entries) if (!seen.has(id)) this.#drop(entry);
    this.#requestRender();
  }

  /** Moves the pictures being dragged by a distance, drawn faded as other dragged shapes are. */
  setDrag(ids: ReadonlySet<Id>, delta: { x: number; y: number }): void {
    for (const entry of this.#entries.values()) {
      const dragged = ids.has(entry.shape.id);
      entry.node.position.set(dragged ? delta.x : 0, dragged ? delta.y : 0);
      entry.node.alpha = (entry.dim ? 0.3 : 1) * (dragged && ids.size > 0 ? 0.85 : 1);
    }
    this.#requestRender();
  }

  /** The theme the canvas shows, whose grays a picture without its file is drawn in. */
  setTheme(dark: boolean): void {
    const colors = dark ? DARK : LIGHT;
    if (colors === this.#colors) return;
    this.#colors = colors;
    for (const entry of this.#entries.values()) this.#paint(entry);
  }

  /** The picture under the pointer: under reduced motion, a GIF plays only while it is there. */
  setHovered(id: Id | undefined): void {
    if (id === this.#hovered) return;
    this.#hovered = id;
    this.#requestRender();
  }

  /** Whether a picture's file could not be had, so it draws its name and a warning. */
  isMissing(id: Id): boolean {
    const entry = this.#entries.get(id);
    return entry?.wanted?.state === 'missing' || entry?.shown?.state === 'missing';
  }

  /**
   * Draws a frame: asks for and makes the textures near the screen, at most one a frame, and plays
   * the GIFs on screen. Answers whether it wants another frame soon.
   */
  frame(view: PictureView): boolean {
    const now = this.#platform.now();
    const near = grow(view.shown, Math.max(view.shown.width, view.shown.height) * 0.5);
    const middle = {
      x: view.shown.x + view.shown.width / 2,
      y: view.shown.y + view.shown.height / 2,
    };
    let made = false;
    let nextDue = Infinity;
    const ready: Entry[] = [];
    const advanced = new Set<DecodedPicture>();
    for (const entry of this.#entries.values()) {
      const { rect } = entry.shape;
      if (!overlaps(rect, near)) continue;
      const pixels = Math.max(rect.width, rect.height) * view.scale * view.resolution;
      const bucket = pictureBucket(pixels, view.settled, entry.shape.media);
      const current = entry.wanted ?? entry.shown;
      if (current === undefined || (bucket > current.bucket && current.state !== 'missing')) {
        const source = this.#source(entry.shape.media, bucket);
        source.distance = Math.hypot(
          rect.x + rect.width / 2 - middle.x,
          rect.y + rect.height / 2 - middle.y,
        );
        entry.wanted = source;
      }
      if (entry.wanted?.state === 'ready' || entry.wanted?.state === 'missing') ready.push(entry);
      // A GIF plays while on screen; under reduced motion only while the pointer is on it.
      const playing = entry.shown?.decoded;
      if (playing?.kind === 'gif' && !advanced.has(playing) && overlaps(rect, view.shown)) {
        const plays = !this.#reducedMotion() || this.#hovered === entry.shape.id;
        if (plays && playing.player.animated && !playing.player.done) {
          advanced.add(playing);
          const pixelsNow = playing.player.advance(now);
          if (pixelsNow) {
            playing.draw(pixelsNow);
            made = true;
          }
          nextDue = Math.min(nextDue, playing.player.due);
        }
      }
    }
    // A texture made this frame, nearest the middle first, replaces the one shown.
    ready.sort((a, b) => (a.wanted?.distance ?? 0) - (b.wanted?.distance ?? 0));
    const swap = ready[0];
    if (swap) {
      this.#show(swap);
      // Other pictures of the same source show it in the same frame: it costs nothing more.
      for (const each of ready.slice(1)) if (each.wanted === swap.shown) this.#show(each);
      made = true;
    }
    this.#startDecoding();
    if (nextDue < Infinity && !this.#timer) {
      this.#timer = true;
      this.#platform.later(Math.max(0, nextDue - now), () => {
        this.#timer = false;
        this.#requestRender();
      });
    }
    this.#release();
    return made || ready.length > 1;
  }

  /** Lets every picture and texture go. */
  destroy(): void {
    this.reset();
    this.container.destroy({ children: true });
  }

  /** Forgets every picture, as when another project opens. */
  reset(): void {
    for (const entry of [...this.#entries.values()]) this.#drop(entry);
    for (const source of this.#sources.values()) source.decoded?.texture.destroy(true);
    this.#sources.clear();
  }

  #source(media: MediaRef, bucket: number): Source {
    const key = `${media.hash}@${bucket}`;
    let source = this.#sources.get(key);
    if (!source) {
      source = { key, media, bucket, state: 'waiting', distance: Infinity };
      this.#sources.set(key, source);
    }
    return source;
  }

  #startDecoding(): void {
    const files = this.#files();
    const waiting = [...this.#sources.values()]
      .filter((source) => source.state === 'waiting')
      .sort((a, b) => a.distance - b.distance);
    for (const source of waiting) {
      if (this.#decoding >= DECODING_AT_ONCE) return;
      if (files === undefined) {
        source.state = 'missing';
        continue;
      }
      source.state = 'loading';
      this.#decoding += 1;
      const { width, height } = textureSize(source.media, source.bucket);
      void files(source.media.hash)
        .then((bytes) =>
          bytes === undefined
            ? undefined
            : this.#platform.decode(bytes, source.media, width, height),
        )
        .then(
          (decoded) => {
            if (this.#sources.get(source.key) !== source) {
              decoded?.texture.destroy(true);
              return;
            }
            if (decoded) {
              source.decoded = decoded;
              source.state = 'ready';
            } else {
              source.state = 'missing';
            }
          },
          () => {
            source.state = 'missing';
          },
        )
        .finally(() => {
          this.#decoding -= 1;
          this.#requestRender();
        });
    }
  }

  #show(entry: Entry): void {
    const source = entry.wanted;
    if (!source) return;
    entry.wanted = undefined;
    entry.shown = source;
    if (source.decoded?.kind === 'gif') {
      // A GIF starts at its first frame; under reduced motion it stays there until hovered.
      const { player, draw } = source.decoded;
      if (player.index < 0) draw(player.first(this.#platform.now()));
    }
    this.#paint(entry);
  }

  /** Draws a picture as its source allows: its texture, or a gray box, with its name when missing. */
  #paint(entry: Entry): void {
    const { rect, name } = entry.shape;
    const { box, node } = entry;
    const texture = entry.shown?.decoded?.texture;
    const missing = entry.shown?.state === 'missing';
    box.clear();
    entry.label?.destroy();
    entry.label = undefined;
    if (texture) {
      if (!entry.sprite) {
        entry.sprite = new Sprite(texture);
        node.addChild(entry.sprite);
      } else if (entry.sprite.texture !== texture) {
        entry.sprite.texture = texture;
      }
      entry.sprite.position.set(rect.x, rect.y);
      entry.sprite.width = rect.width;
      entry.sprite.height = rect.height;
      return;
    }
    entry.sprite?.destroy();
    entry.sprite = undefined;
    const colors = this.#colors;
    box.rect(rect.x, rect.y, rect.width, rect.height).fill(colors.box).stroke({
      color: colors.border,
      width: 1,
    });
    if (!missing) return;
    // A warning, and the picture's name, written as large as fits.
    const size = Math.max(4, Math.min(14, rect.height / 4, rect.width / 8));
    const left = rect.x + size * 0.6;
    const top = rect.y + size * 0.6;
    box
      .poly([left + size / 2, top, left + size, top + size, left, top + size])
      .fill(colors.warning);
    const label = new Text({
      text: name,
      x: left + size * 1.4,
      y: top - size * 0.1,
      style: {
        fontFamily: 'Roboto, sans-serif',
        fontSize: size,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: Math.max(1, rect.width - size * 2.2),
      },
    });
    label.tint = colors.text;
    entry.label = label;
    node.addChild(label);
  }

  #drop(entry: Entry): void {
    this.#entries.delete(entry.shape.id);
    entry.node.destroy({ children: true });
  }

  /** Lets go of the sources no picture shows or waits for. */
  #release(): void {
    const used = new Set<Source>();
    for (const entry of this.#entries.values()) {
      if (entry.shown) used.add(entry.shown);
      if (entry.wanted) used.add(entry.wanted);
    }
    for (const [key, source] of this.#sources) {
      if (used.has(source) || source.state === 'loading') continue;
      this.#sources.delete(key);
      source.decoded?.texture.destroy(true);
    }
  }

  /** The pictures the layer was last given, for tests. */
  get shapes(): readonly PictureShape[] {
    return this.#shapes;
  }
}

function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The browser's decoders: bitmaps off the main thread, SVGs as images, GIFs frame by frame. */
export function browserPicturePlatform(): PicturePlatform {
  return {
    now: () => performance.now(),
    later: (ms, then) => {
      setTimeout(then, ms);
    },
    decode: async (bytes, media, width, height) => {
      const owned = bytes as Uint8Array<ArrayBuffer>;
      if (media.format === 'gif') return decodeGif(parseGif(owned), width, height);
      if (media.format === 'svg') {
        const text = new TextDecoder().decode(owned);
        const image = await loadSvgPicture(text, width, height);
        const { canvas, context } = newCanvas(width, height);
        context.drawImage(image, 0, 0, width, height);
        return { kind: 'still', texture: canvasTexture(canvas) };
      }
      const type = media.format === 'jpeg' ? 'image/jpeg' : `image/${media.format}`;
      const bitmap = await createImageBitmap(new Blob([owned], { type }), {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
      });
      const source = new ImageSource({ resource: bitmap, scaleMode: 'linear' });
      return { kind: 'still', texture: new Texture({ source }) };
    },
  };
}

function canvasTexture(canvas: HTMLCanvasElement | OffscreenCanvas): Texture {
  const source: TextureSource = new CanvasSource({
    resource: canvas as HTMLCanvasElement,
    scaleMode: 'linear',
  });
  return new Texture({ source });
}

/** A GIF's texture at a size, drawn again from each frame the player composes. */
function decodeGif(document: GifDocument, width: number, height: number): DecodedPicture {
  const own = newCanvas(document.width, document.height);
  const shown = newCanvas(width, height);
  const texture = canvasTexture(shown.canvas);
  const image = own.context.createImageData(document.width, document.height);
  const draw = (rgba: Uint8ClampedArray) => {
    image.data.set(rgba);
    own.context.putImageData(image, 0, 0);
    shown.context.clearRect(0, 0, width, height);
    shown.context.drawImage(own.canvas, 0, 0, width, height);
    texture.source.update();
  };
  return { kind: 'gif', texture, player: new GifPlayer(document), draw };
}
