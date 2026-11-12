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
 * - A link card (ADR 0098, stage 3) is drawn here too, as a card around its picture, with its title,
 *   description and host written from its data (`cardLayout`); its picture is fetched and decoded as
 *   any picture's, at the size its band shows it.
 * - A video (ADR 0098, stage 2) shows its poster with a play mark, or, without one, a dark box with a
 *   play mark and its name. It plays muted and in a loop once asked (`toggle`, `setPlaying`), from
 *   its file fetched then, its texture updated each frame while it plays; at most four play at once.
 */
import {
  CanvasSource,
  Container,
  Graphics,
  ImageSource,
  Sprite,
  Text,
  Texture,
  VideoSource,
  type TextureSource,
} from 'pixi.js';
import { MEDIA_TYPES, parseGif, type GifDocument } from '@visual-anything/core';
import type { Id, MediaRef } from '@visual-anything/schema';
import type { Rect } from '../geometry';
import { loadSvgPicture, newCanvas } from '../images';
import { CARD_COLORS, cardLayout, type CardColors, type CardLayout } from '../links/card';
import { stillOf, type PictureShape } from '../scene';
import { playMark } from './mark';
import { GifPlayer, pictureBucket, textureSize, type MediaFiles } from './media';

/** A picture decoded at one size: still, or a GIF that plays. */
export type DecodedPicture =
  | { kind: 'still'; texture: Texture }
  | { kind: 'gif'; texture: Texture; player: GifPlayer; draw: (rgba: Uint8ClampedArray) => void };

/** A video playing: its texture, updated from its frame each frame, and how it stops. */
export interface PlayingVideo {
  texture: Texture;
  /** Takes the frame the video shows now into its texture. */
  update(): void;
  /** Stops it and lets its texture and its file's address go. */
  stop(): void;
}

/** What the layer needs from the browser and the GPU; tests give it a fake. */
export interface PicturePlatform {
  /** Plays a video's file, muted and in a loop (ADR 0098, stage 2). */
  play?: (bytes: Uint8Array, media: MediaRef) => Promise<PlayingVideo>;
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
  /** The fetching and decoding under way, once started. */
  loaded?: Promise<void>;
  distance: number;
}

interface Entry {
  shape: PictureShape;
  node: Container;
  box: Graphics;
  /** A video's play mark, over its poster while it does not play. */
  mark?: Graphics;
  /** A link card's layout, made again whenever its shape changes. */
  card?: CardLayout;
  label?: Container;
  sprite?: Sprite;
  /** The source the sprite shows, and the one asked for that will replace it. */
  shown?: Source;
  wanted?: Source;
  dim: boolean;
}

/** How many pictures decode at once. */
const DECODING_AT_ONCE = 2;

/** How many videos play at once; the one started first stops for another. */
export const PLAYING_AT_ONCE = 4;

/** A video asked to play: while its file comes, then playing. */
interface Playing {
  media: MediaRef;
  video?: PlayingVideo;
  stopped: boolean;
}

export class PictureLayer {
  readonly container = new Container();
  readonly #files: () => MediaFiles | undefined;
  readonly #platform: PicturePlatform;
  readonly #requestRender: () => void;
  readonly #reducedMotion: () => boolean;
  readonly #onPlaying: (ids: ReadonlySet<Id>) => void;
  readonly #entries = new Map<Id, Entry>();
  readonly #sources = new Map<string, Source>();
  #colors = LIGHT;
  #cardColors: CardColors = CARD_COLORS.light;
  #hovered: Id | undefined;
  #decoding = 0;
  #timer = false;
  #shapes: readonly PictureShape[] = [];
  /** The videos asked to play, by picture, the one asked first first. */
  readonly #playing = new Map<Id, Playing>();
  /**
   * The videos a step asks to play (ADR 0098, stage 4): played whenever they are drawn, until the step
   * asks for others or the person stops one.
   */
  #asked: ReadonlySet<Id> = new Set();

  constructor(options: {
    files: () => MediaFiles | undefined;
    platform?: PicturePlatform;
    requestRender: () => void;
    reducedMotion?: () => boolean;
    /** Told which videos play whenever that changes. */
    onPlaying?: (ids: ReadonlySet<Id>) => void;
  }) {
    this.#onPlaying = options.onPlaying ?? (() => {});
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
      if (
        entry &&
        (entry.shape.media?.hash !== shape.media?.hash ||
          stillOf(entry.shape)?.hash !== stillOf(shape)?.hash)
      ) {
        this.#drop(entry);
        entry = undefined;
      }
      const playing = this.#playing.get(shape.id);
      if (playing && playing.media.hash !== shape.media?.hash) this.#stop(shape.id);
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
      if (moved || (shape.link && !entry.card)) entry.card = cardOf(shape);
      entry.dim = dimmed.has(shape.id);
      entry.node.alpha = entry.dim ? 0.3 : 1;
      this.container.setChildIndex(entry.node, Math.min(at, this.container.children.length - 1));
      if (moved || (shape.link ? !entry.label : !entry.sprite)) this.#paint(entry);
    });
    for (const [id, entry] of this.#entries) if (!seen.has(id)) this.#drop(entry);
    for (const id of [...this.#playing.keys()]) if (!seen.has(id)) this.#stop(id);
    // A video a step asks for plays once it is drawn: in a view just shown, or no longer hidden.
    this.#playAsked();
    this.#requestRender();
  }

  /** Whether a video plays, or is about to once its file comes. */
  isPlaying(id: Id): boolean {
    return this.#playing.has(id);
  }

  /** Plays a video that does not play, and stops one that does (ADR 0098, stage 2). */
  toggle(id: Id): void {
    if (this.#playing.has(id)) {
      // The person stopped it: the step that asked for it no longer starts it again.
      this.#forget(id);
      this.#stop(id);
    } else this.#play(id);
  }

  /**
   * Plays these videos whenever they are drawn, and stops those the step before asked for that these
   * leave out: the hook a scenario or tour step uses to show its videos playing (ADR 0098, stage 4).
   * A video the person started plays on.
   */
  setPlaying(ids: ReadonlySet<Id>): void {
    for (const id of this.#asked) if (!ids.has(id)) this.#stop(id);
    this.#asked = new Set(ids);
    this.#playAsked();
  }

  #playAsked(): void {
    for (const id of this.#asked) if (!this.#playing.has(id)) this.#play(id);
  }

  #forget(id: Id): void {
    if (!this.#asked.has(id)) return;
    const asked = new Set(this.#asked);
    asked.delete(id);
    this.#asked = asked;
  }

  #play(id: Id): void {
    const entry = this.#entries.get(id);
    const files = this.#files();
    const play = this.#platform.play;
    if (!entry?.shape.video || files === undefined || play === undefined) return;
    if (!this.#playable(entry.shape)) return;
    const { media } = entry.shape;
    if (media === undefined) return;
    while (this.#playing.size >= PLAYING_AT_ONCE) {
      const first = this.#playing.keys().next().value as Id;
      this.#stop(first);
    }
    const playing: Playing = { media, stopped: false };
    this.#playing.set(id, playing);
    this.#paint(entry);
    this.#onPlaying(new Set(this.#playing.keys()));
    void files(media.hash)
      .then((bytes) => (bytes === undefined || playing.stopped ? undefined : play(bytes, media)))
      .then(
        (video) => {
          if (playing.stopped || this.#playing.get(id) !== playing) {
            video?.stop();
            return;
          }
          if (video === undefined) {
            this.#forget(id);
            this.#stop(id);
            return;
          }
          playing.video = video;
          const now = this.#entries.get(id);
          if (now) this.#paint(now);
        },
        () => {
          if (this.#playing.get(id) !== playing) return;
          this.#forget(id);
          this.#stop(id);
        },
      )
      .finally(() => this.#requestRender());
  }

  #stop(id: Id): void {
    const playing = this.#playing.get(id);
    if (!playing) return;
    playing.stopped = true;
    this.#playing.delete(id);
    // Back to its poster before the video's texture goes.
    const video = playing.video;
    playing.video = undefined;
    const entry = this.#entries.get(id);
    if (entry) this.#paint(entry);
    video?.stop();
    this.#onPlaying(new Set(this.#playing.keys()));
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
    this.#cardColors = CARD_COLORS[dark ? 'dark' : 'light'];
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
    for (const playing of this.#playing.values()) {
      if (playing.video) {
        playing.video.update();
        made = true;
      }
    }
    for (const entry of this.#entries.values()) {
      const rect = shownRect(entry);
      if (rect === undefined || !overlaps(rect, near)) continue;
      const still = stillOf(entry.shape);
      // A video without a poster has no image to show while still.
      if (still === undefined) continue;
      const pixels = Math.max(rect.width, rect.height) * view.scale * view.resolution;
      const bucket = pictureBucket(pixels, view.settled, still);
      const current = entry.wanted ?? entry.shown;
      if (current === undefined || (bucket > current.bucket && current.state !== 'missing')) {
        const source = this.#source(still, bucket);
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
    for (const id of [...this.#playing.keys()]) this.#stop(id);
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
    const waiting = [...this.#sources.values()]
      .filter((source) => source.state === 'waiting')
      .sort((a, b) => a.distance - b.distance);
    for (const source of waiting) {
      if (this.#decoding >= DECODING_AT_ONCE) return;
      void this.#load(source);
    }
  }

  /** Fetches and decodes a source's file; it is then ready, or missing. */
  #load(source: Source): Promise<void> {
    const files = this.#files();
    if (files === undefined) {
      source.state = 'missing';
      return Promise.resolve();
    }
    source.state = 'loading';
    this.#decoding += 1;
    const { width, height } = textureSize(source.media, source.bucket);
    const loaded = (source.loaded = files(source.media.hash)
      .then((bytes) =>
        bytes === undefined ? undefined : this.#platform.decode(bytes, source.media, width, height),
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
      }));
    return loaded;
  }

  /**
   * Readies every picture for an image drawn at so many pixels a canvas unit, the PNG export's
   * (ADR 0098): each decoded at that size, past the frame's budget, and each GIF at its first frame.
   */
  async readyForImage(pixelsPerUnit: number): Promise<void> {
    const loading: Promise<void>[] = [];
    for (const entry of this.#entries.values()) {
      const rect = shownRect(entry);
      const media = stillOf(entry.shape);
      if (media === undefined || rect === undefined) continue;
      const bucket = pictureBucket(Math.max(rect.width, rect.height) * pixelsPerUnit, true, media);
      const shown = entry.shown;
      if (shown && (shown.state === 'missing' || shown.bucket >= bucket)) continue;
      const source = this.#source(media, bucket);
      entry.wanted = source;
      if (source.state === 'waiting') loading.push(this.#load(source));
      else if (source.loaded) loading.push(source.loaded);
    }
    await Promise.all(loading);
    for (const entry of this.#entries.values()) {
      const state = entry.wanted?.state;
      if (state === 'ready' || state === 'missing') this.#show(entry);
      const decoded = entry.shown?.decoded;
      if (decoded?.kind === 'gif') decoded.draw(decoded.player.first(this.#platform.now()));
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

  /**
   * Draws a picture as its source allows: its texture, or a gray box, with its name when missing; a
   * video playing as its frames, and one still with a play mark.
   */
  #paint(entry: Entry): void {
    if (entry.shape.link) {
      this.#paintCard(entry);
      return;
    }
    const { rect, name } = entry.shape;
    const { box, node } = entry;
    const playing = this.#playing.get(entry.shape.id);
    const texture = playing?.video?.texture ?? entry.shown?.decoded?.texture;
    const missing = entry.shown?.state === 'missing';
    const bare = entry.shape.video === true && stillOf(entry.shape) === undefined;
    box.clear();
    entry.label?.destroy();
    entry.label = undefined;
    entry.mark?.destroy();
    entry.mark = undefined;
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
      if (entry.shape.video && !playing?.video) this.#markPlay(entry);
      return;
    }
    entry.sprite?.destroy();
    entry.sprite = undefined;
    const colors = this.#colors;
    if (bare) {
      // A video without a poster: a dark box, its play mark, and its name.
      box.rect(rect.x, rect.y, rect.width, rect.height).fill(0x18181b).stroke({
        color: colors.border,
        width: 1,
      });
      if (!playing?.video) this.#markPlay(entry);
      const size = Math.max(4, Math.min(14, rect.height / 6, rect.width / 10));
      const label = new Text({
        text: name,
        x: rect.x + size * 0.6,
        y: rect.y + size * 0.5,
        style: {
          fontFamily: 'Roboto, sans-serif',
          fontSize: size,
          fill: 0xffffff,
          wordWrap: true,
          wordWrapWidth: Math.max(1, rect.width - size * 1.2),
        },
      });
      label.tint = 0xe4e4e7;
      entry.label = label;
      node.addChild(label);
      return;
    }
    box.rect(rect.x, rect.y, rect.width, rect.height).fill(colors.box).stroke({
      color: colors.border,
      width: 1,
    });
    if (entry.shape.video && !missing) this.#markPlay(entry);
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

  /**
   * Draws a link card (ADR 0098, stage 3): its card, its picture in its band once decoded, and its
   * title, description and host, each line where `cardLayout` puts it.
   */
  #paintCard(entry: Entry): void {
    const { rect, link } = entry.shape;
    const layout = entry.card ?? cardOf(entry.shape);
    const { box, node } = entry;
    const colors = this.#cardColors;
    box.clear();
    entry.label?.destroy({ children: true });
    entry.label = undefined;
    if (layout === undefined || link === undefined) return;
    box.roundRect(rect.x, rect.y, rect.width, rect.height, layout.radius).fill(hex(colors.fill));
    if (layout.band) {
      const { band } = layout;
      // The band's top corners follow the card's; its bottom is straight.
      box.roundRect(band.x, band.y, band.width, band.height, layout.radius).fill(hex(colors.band));
      const straight = Math.min(layout.radius, band.height);
      box
        .rect(band.x, band.y + band.height - straight, band.width, straight)
        .fill(hex(colors.band));
    }
    box.roundRect(rect.x, rect.y, rect.width, rect.height, layout.radius).stroke({
      color: hex(colors.border),
      width: 1,
    });
    const texture = entry.shown?.decoded?.texture;
    if (texture && layout.picture) {
      if (!entry.sprite) {
        entry.sprite = new Sprite(texture);
        node.addChild(entry.sprite);
      } else if (entry.sprite.texture !== texture) {
        entry.sprite.texture = texture;
      }
      entry.sprite.position.set(layout.picture.x, layout.picture.y);
      entry.sprite.width = layout.picture.width;
      entry.sprite.height = layout.picture.height;
    } else {
      entry.sprite?.destroy();
      entry.sprite = undefined;
    }
    const label = new Container();
    for (const text of layout.texts) {
      const tint =
        text.role === 'title'
          ? colors.title
          : text.role === 'description'
            ? colors.description
            : colors.link;
      for (const line of text.text.lines) {
        const written = new Text({
          text: line.text,
          x: text.x,
          // Pixi places a text by its top, about an ascent above its baseline.
          y: line.baseline - text.size * 0.93,
          resolution: 3,
          style: {
            fontFamily: 'Roboto, sans-serif',
            fontSize: text.size,
            fontWeight: text.bold ? '700' : '400',
            fill: 0xffffff,
          },
        });
        written.tint = hex(tint);
        label.addChild(written);
      }
    }
    entry.label = label;
    node.addChild(label);
  }

  /** A link card's layout, for pointing: where its address line is (ADR 0098, stage 3). */
  cardLayout(id: Id): CardLayout | undefined {
    return this.#entries.get(id)?.card;
  }

  /** Whether a video's file is there to play, as far as is known before asking for it. */
  #playable(shape: PictureShape): boolean {
    if (shape.media === undefined) return false;
    return this.#files()?.holds?.(shape.media.hash) ?? true;
  }

  /** A video's play mark in its middle: a dark disc with a white triangle (`playMark`). */
  #markPlay(entry: Entry): void {
    if (!this.#playable(entry.shape)) return;
    const mark = new Graphics();
    const { disc, triangle } = playMark(entry.shape.rect);
    mark.circle(disc.x, disc.y, disc.radius).fill({ color: 0x000000, alpha: 0.55 });
    mark.poly(triangle).fill(0xffffff);
    entry.mark = mark;
    entry.node.addChild(mark);
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

/** A link card's layout; none for a picture. */
function cardOf(shape: PictureShape): CardLayout | undefined {
  return shape.link ? cardLayout(shape.rect, shape.link, shape.media) : undefined;
}

/**
 * Where an entry's picture shows: a picture's whole rectangle, or a link card's picture in its band;
 * none for a card without one or without room for it.
 */
function shownRect(entry: Entry): Rect | undefined {
  return entry.shape.link ? entry.card?.picture : entry.shape.rect;
}

/** A color written as #rrggbb, as a number. */
function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
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
    play: playVideo,
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

/**
 * Plays a video's file muted and in a loop from a `blob:` address (ADR 0098, stage 2), as a texture
 * the layer updates each frame; the address goes when it stops.
 */
async function playVideo(bytes: Uint8Array, media: MediaRef): Promise<PlayingVideo> {
  const address = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MEDIA_TYPES[media.format] }),
  );
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = address;
  const stop = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(address);
  };
  try {
    await video.play();
  } catch (error) {
    stop();
    throw error;
  }
  const source = new VideoSource({
    resource: video,
    autoLoad: false,
    autoPlay: false,
    width: video.videoWidth || media.width,
    height: video.videoHeight || media.height,
    scaleMode: 'linear',
  });
  source.autoUpdate = false;
  const texture = new Texture({ source });
  return {
    texture,
    update: () => source.update(),
    stop: () => {
      stop();
      texture.destroy(true);
    },
  };
}

function canvasTexture(canvas: HTMLCanvasElement | OffscreenCanvas): Texture {
  const source: TextureSource = new CanvasSource({
    resource: canvas,
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
