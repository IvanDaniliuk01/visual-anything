/**
 * The canvas's travelers (ADR 0110): the pictures relations' appearances send along their lines,
 * drawn above the relations' tiles in a group of their own, so that what moves is redrawn without
 * them (ADR 0045).
 *
 * - Sprites come from a pool that only grows, at most {@link MOST_TRAVELERS} of them; a frame moves
 *   the ones it needs and hides the rest, and allocates nothing while the camera stays.
 * - Only lines on screen carry travelers, and a frame is asked for only while one that moves is on
 *   screen. Standing still, the layer draws again only when the camera, the lines or its textures
 *   change.
 * - Each picture is drawn in its own colors, never tinted, its larger side the traveler's size in
 *   pixels on screen at any zoom, at its line's opacity, fainter where the emphasis dims its line.
 * - Textures come from the canvas's image store (`TravelerTextures`), the same as shapes' pictures,
 *   kept for as long as the layer draws with them.
 */
import type { CleanedImage } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { Container, Sprite, type Texture } from 'pixi.js';
import { DIMMED_ALPHA } from './colors';
import { boundsOf, type Rect } from './geometry';
import type { RelationLine } from './scene';
import { meets } from './spatial';
import {
  MOST_TRAVELERS,
  carriesAt,
  chooseLines,
  eachTraveler,
  headsLeft,
  measureRoute,
  travelerCount,
  type Candidate,
  type LineTraveler,
  type MeasuredRoute,
  type Place,
  type TravelerMode,
} from './travelers';

/** The name the layer asks the image store for its textures under. */
export const TRAVELER_PICTURES = 'travelers';

/** A texture to draw a traveler's picture with: the one asked for, or a stand-in meanwhile. */
export interface TravelerTexture<T> {
  texture: T;
  key: string;
  exact: boolean;
}

/** Where the layer's textures come from. */
export interface TravelerTextures<T> {
  /** The texture of a picture this many device pixels along its larger side; none yet, or ever. */
  texture(picture: CleanedImage, devicePixels: number): TravelerTexture<T> | undefined;
  /** Whether a picture can never be drawn, so that nothing waits for it. */
  broken(picture: CleanedImage): boolean;
  /** The textures the layer draws with now, which the store keeps while it does. */
  use(keys: readonly string[]): void;
}

/** How the canvas is seen this frame. */
export interface TravelerView {
  /** When, in milliseconds, on the clock every frame reads. */
  now: number;
  scale: number;
  /** What the screen shows, in canvas units. */
  shown: Rect;
  /** Device pixels to a screen pixel. */
  resolution: number;
  /** Whether motion is reduced: travelers then stand still. */
  reduced: boolean;
}

/** A line that carries travelers, measured once. */
interface Entry {
  key: Id;
  traveler: LineTraveler;
  route: MeasuredRoute;
  bounds: Rect;
  count: number;
  alpha: number;
  /** Its picture and size among the layer's looks. */
  look: number;
}

/** A picture at a size, and the texture it is drawn with this frame. */
interface Look<T> {
  picture: CleanedImage;
  size: number;
  texture: T | undefined;
  key: string | undefined;
}

/** What a still drawing was drawn for, so that a frame with nothing changed draws nothing. */
interface DrawnFor {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
  entries: readonly Entry[];
  textures: number;
}

/** A traveler as drawn: for the tests. */
export interface DrawnTraveler {
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
  alpha: number;
  width: number;
  height: number;
}

const measured = new WeakMap<readonly unknown[], MeasuredRoute>();

/** A line's route measured, once for each route. */
function measuredOf(line: RelationLine): MeasuredRoute {
  let route = measured.get(line.route);
  if (!route) {
    route = measureRoute(line.route);
    measured.set(line.route, route);
  }
  return route;
}

export class TravelerLayer<T extends Texture = Texture> {
  readonly container = new Container({ isRenderGroup: true });
  private readonly sprites: Sprite[] = [];
  private shownCount = 0;
  private entries: Entry[] = [];
  private looks: Look<T>[] = [];
  private mode: TravelerMode = 'moving';
  private linesFrom:
    | {
        lines: readonly RelationLine[];
        hidden: ReadonlySet<Id>;
        dimmed: ReadonlySet<Id>;
      }
    | undefined;
  private drawnFor: DrawnFor | undefined;
  /** The lines that keep their travelers, for the camera they were chosen for. */
  private chosen: number[] = [];
  private chosenFor: Omit<DrawnFor, 'textures'> | undefined;
  /** The textures used, by key, last told to the store. */
  private used: string[] = [];
  /** Counts the changes of the textures used, which a still drawing is drawn again for. */
  private texturesUsed = 0;
  /** The line, look and texture being placed, while a line's travelers are visited. */
  private placingEntry: Entry | undefined;
  private placingLook: Look<T> | undefined;
  private placingTexture: T | undefined;
  private reach: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** How many sprites this frame has placed. */
  private placed = 0;
  private scale = 1;
  private readonly place: Place = { x: 0, y: 0, angle: 0 };
  private readonly visit = (place: Place) => this.placeOne(place);

  constructor(
    private readonly textures: TravelerTextures<T>,
    private readonly most = MOST_TRAVELERS,
  ) {}

  /**
   * The lines drawn from now on, but for those the emphasis or a drag takes out (`hidden`); those it
   * dims carry fainter travelers. The same lists change nothing.
   */
  setLines(lines: readonly RelationLine[], hidden: ReadonlySet<Id>, dimmed: ReadonlySet<Id>): void {
    const from = this.linesFrom;
    if (from?.lines === lines && from.hidden === hidden && from.dimmed === dimmed) return;
    this.linesFrom = { lines, hidden, dimmed };
    const entries: Entry[] = [];
    const looks: Look<T>[] = [];
    const lookOf = new Map<CleanedImage, Map<number, number>>();
    for (const line of lines) {
      const traveler = line.traveler;
      if (!traveler || hidden.has(line.relation)) continue;
      const route = measuredOf(line);
      if (!(route.length > 0)) continue;
      const sizes = lookOf.get(traveler.picture) ?? new Map<number, number>();
      lookOf.set(traveler.picture, sizes);
      let look = sizes.get(traveler.size);
      if (look === undefined) {
        look = looks.length;
        sizes.set(traveler.size, look);
        looks.push({
          picture: traveler.picture,
          size: traveler.size,
          texture: undefined,
          key: undefined,
        });
      }
      entries.push({
        key: line.relation,
        traveler,
        route,
        bounds: boundsOf([], line.route) ?? { x: 0, y: 0, width: 0, height: 0 },
        count: travelerCount(route.length, traveler),
        alpha: (line.opacity ?? 1) * (dimmed.has(line.relation) ? DIMMED_ALPHA : 1),
        look,
      });
    }
    this.entries = entries;
    this.looks = looks;
    this.drawnFor = undefined;
    this.chosenFor = undefined;
  }

  /** Whether the view's travelers move, stand still or are hidden. */
  setMode(mode: TravelerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.drawnFor = undefined;
  }

  /** The pictures the layer draws, once each, which the image store keeps. */
  get pictures(): CleanedImage[] {
    return [...new Set(this.looks.map((look) => look.picture))];
  }

  /** Whether any line drawn carries a traveler, whatever the mode. */
  get carriesAny(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Places the travelers on screen for this frame, and says whether it wants another: while one that
   * moves is on screen, or while a texture it draws is not made yet.
   */
  frame(view: TravelerView): boolean {
    if (this.mode === 'hidden' || this.entries.length === 0) {
      this.hideFrom(0);
      this.release();
      this.drawnFor = undefined;
      return false;
    }
    const moving = this.mode === 'moving' && !view.reduced;
    const waiting = this.textureLooks(view.resolution);
    const { scale, shown } = view;
    const drawn = this.drawnFor;
    if (
      !moving &&
      drawn !== undefined &&
      drawn.entries === this.entries &&
      drawn.textures === this.texturesUsed &&
      sameCamera(drawn, scale, shown)
    ) {
      return waiting;
    }
    const placed = this.draw(scale, shown, moving ? view.now / 1000 : undefined);
    this.drawnFor = moving
      ? undefined
      : { ...cameraOf(scale, shown), entries: this.entries, textures: this.texturesUsed };
    return (moving && placed > 0) || waiting;
  }

  /**
   * Draws the travelers within `frame` standing still, sized as a screen at `scale` would show
   * them, with textures for `resolution` image pixels to a screen pixel, as an image draws them;
   * the next frame draws them as the screen shows them again.
   */
  drawStill(frame: Rect, scale: number, resolution: number): void {
    this.invalidate();
    if (this.mode === 'hidden' || this.entries.length === 0) {
      this.hideFrom(0);
      return;
    }
    this.textureLooks(resolution);
    this.draw(scale, frame, undefined);
    this.chosenFor = undefined;
  }

  /** Makes the next frame place the travelers again, as after an image drew them its own way. */
  invalidate(): void {
    this.drawnFor = undefined;
    this.chosenFor = undefined;
  }

  /** The travelers drawn now, in canvas units and radians: for the tests. */
  get drawn(): DrawnTraveler[] {
    return this.sprites.slice(0, this.shownCount).map((sprite) => {
      const texture = sprite.texture;
      return {
        x: sprite.x,
        y: sprite.y,
        rotation: sprite.rotation,
        mirrored: sprite.scale.y < 0,
        alpha: sprite.alpha,
        width: Math.abs(sprite.scale.x) * texture.width,
        height: Math.abs(sprite.scale.y) * texture.height,
      };
    });
  }

  destroy(): void {
    this.release();
    this.container.destroy({ children: true });
    this.sprites.length = 0;
  }

  /**
   * Asks for each look's texture at its size on this screen; says whether one is not made yet, and
   * tells the store the textures used when they changed.
   */
  private textureLooks(resolution: number): boolean {
    let waiting = false;
    let changed = false;
    let at = 0;
    for (const look of this.looks) {
      const made = this.textures.texture(look.picture, look.size * resolution);
      look.texture = made?.texture;
      look.key = made?.key;
      if (!made?.exact && !this.textures.broken(look.picture)) waiting = true;
      if (made) {
        if (this.used[at] !== made.key) changed = true;
        at += 1;
      }
    }
    if (changed || at !== this.used.length) {
      const keys: string[] = [];
      for (const look of this.looks) if (look.key !== undefined) keys.push(look.key);
      this.used = keys;
      this.textures.use(keys);
      this.texturesUsed += 1;
    }
    return waiting;
  }

  /** Gives up the textures used. */
  private release(): void {
    if (this.used.length === 0) return;
    this.used = [];
    this.textures.use([]);
  }

  /** Places the travelers of the lines chosen, `seconds` into their travel or still; how many. */
  private draw(scale: number, shown: Rect, seconds: number | undefined): number {
    this.scale = scale;
    this.placed = 0;
    let largest = 0;
    for (const look of this.looks) largest = Math.max(largest, look.size);
    // Grown by the largest traveler, so that one half on screen shows; written in place, as every frame.
    const by = largest / scale;
    const reach = this.reach;
    reach.x = shown.x - by;
    reach.y = shown.y - by;
    reach.width = shown.width + 2 * by;
    reach.height = shown.height + 2 * by;
    for (const index of this.choose(scale, shown, this.reach)) {
      const entry = this.entries[index] as Entry;
      const look = this.looks[entry.look] as Look<T>;
      if (look.texture === undefined) continue;
      this.placingEntry = entry;
      this.placingLook = look;
      this.placingTexture = look.texture;
      eachTraveler(entry.route, entry.traveler, seconds, this.place, this.visit);
    }
    this.placingEntry = undefined;
    this.placingLook = undefined;
    this.placingTexture = undefined;
    const placed = this.placed;
    this.hideFrom(placed);
    return placed;
  }

  /** Shows one traveler at `place`, if it is on screen and the frame has room for it. */
  private placeOne(place: Place): void {
    const entry = this.placingEntry;
    const look = this.placingLook;
    const texture = this.placingTexture;
    if (!entry || !look || !texture || this.placed >= this.most) return;
    const reach = this.reach;
    if (
      place.x < reach.x ||
      place.y < reach.y ||
      place.x > reach.x + reach.width ||
      place.y > reach.y + reach.height
    ) {
      return;
    }
    let sprite = this.sprites[this.placed];
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    } else if (sprite.texture !== texture) sprite.texture = texture;
    const long = Math.max(look.picture.width, look.picture.height);
    const side = look.size / this.scale;
    const across = long > 0 ? (side * look.picture.width) / long : side;
    const down = long > 0 ? (side * look.picture.height) / long : side;
    const sx = across / Math.max(1, texture.width);
    const sy = down / Math.max(1, texture.height);
    sprite.position.set(place.x, place.y);
    sprite.rotation = place.angle;
    sprite.scale.set(sx, headsLeft(place.angle) ? -sy : sy);
    if (sprite.alpha !== entry.alpha) sprite.alpha = entry.alpha;
    if (!sprite.visible) sprite.visible = true;
    this.placed += 1;
  }

  /** Hides the sprites from `from` on that showed, and notes how many show. */
  private hideFrom(from: number): void {
    for (let at = from; at < this.shownCount && at < this.sprites.length; at++) {
      const sprite = this.sprites[at] as Sprite;
      if (sprite.visible) sprite.visible = false;
    }
    this.shownCount = from;
  }

  /**
   * The lines that carry travelers on screen this frame, those nearest the screen's middle when they
   * carry more than the frame draws; worked out again only when the camera or the lines change.
   */
  private choose(scale: number, shown: Rect, reach: Rect): readonly number[] {
    const was = this.chosenFor;
    if (was !== undefined && was.entries === this.entries && sameCamera(was, scale, shown)) {
      return this.chosen;
    }
    const near: number[] = [];
    let total = 0;
    this.entries.forEach((entry, index) => {
      if (!meets(entry.bounds, reach)) return;
      if (!carriesAt(entry.route.length, entry.traveler.size, scale)) return;
      near.push(index);
      total += entry.count;
    });
    if (total > this.most) {
      const candidates: Candidate[] = near.map((index) => this.entries[index] as Entry);
      const middle = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
      this.chosen = chooseLines(candidates, middle, this.most).map((at) => near[at] as number);
    } else this.chosen = near;
    this.chosenFor = { ...cameraOf(scale, shown), entries: this.entries };
    return this.chosen;
  }
}

function cameraOf(scale: number, shown: Rect): Omit<DrawnFor, 'entries' | 'textures'> {
  return { scale, x: shown.x, y: shown.y, width: shown.width, height: shown.height };
}

function sameCamera(
  was: Omit<DrawnFor, 'entries' | 'textures'>,
  scale: number,
  shown: Rect,
): boolean {
  return (
    was.scale === scale &&
    was.x === shown.x &&
    was.y === shown.y &&
    was.width === shown.width &&
    was.height === shown.height
  );
}
