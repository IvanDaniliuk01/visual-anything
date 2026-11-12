/**
 * The canvas's explorables (ADR 0107, A10.3): what an explorable's shape draws, an element's shape
 * whose appearance shows one, on its plate, and an explorable shape loose on the canvas. Each draws
 * its still once the tab has one, and its card, drawn from data, until then.
 *
 * - **Stills** come from the canvas's provider, which the canvas area gives it: while the canvas
 *   rests, the layer says which spots near the screen need one and at which bucket (256, 512 or
 *   1,024 pixels wide, as large as the spot shows); the provider asks the tab's hidden frame for them,
 *   one at a time, and keeps them by their key. A still's texture is made by the canvas's image store,
 *   as a solid's picture is, at most one a frame, nearest the middle first; a spot shows the still it
 *   last showed until the new one is made, so that a change of data never flashes its card.
 * - **Cards** are painted once for a spot, its face and the theme, and again only when one changes.
 * - **Levels of detail.** An element's explorable shows from the scale drawings show (ADR 0055), as
 *   its plate does; a loose one always, as pictures do.
 * - **No work per frame** beyond a pass over the spots: no spot, text or texture is made in a frame
 *   unless something it shows changed.
 */
import type { Id } from '@visual-anything/schema';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { StillBucket } from '@visual-anything/core';
import { stillBucket } from '@visual-anything/core';
import { DIMMED_ALPHA } from '../colors';
import type { Rect } from '../geometry';
import { solidPictureSerial } from '../image-serials';
import type { ImageStore } from '../images';
import { picturesOf, type Scene } from '../scene';
import { IMAGE_SCALES } from '../shape-images';
import {
  EXPLORABLE_CARD_COLORS,
  cardColor,
  cardTextColor,
  explorableCardLayout,
  type ExplorableCardColors,
  type ExplorableFace,
} from '../../explorables/card-layout';
import { EmphasisLabel } from '../emphasisLabels';

/** The name the layer's textures are kept under in the image store. */
export const EXPLORABLE_LAYER = 'explorable-layer';

/** A place an explorable shows on the canvas, and the still it needs there. */
export interface StillSpot {
  /** A shape's key, or a loose explorable shape's id. */
  spot: string;
  explorable: Id;
  element?: Id;
  /** Its size in canvas units, rounded: the size the page lays out at. */
  width: number;
  height: number;
  bucket: StillBucket;
  /** How far it is from the middle of the screen, in canvas units. */
  distance: number;
}

/** A still to draw: the picture the tab decoded, by the key it is kept by. */
export interface StillPicture {
  key: string;
  picture: unknown;
  width: number;
  height: number;
}

/** What the layer asks of the canvas area. */
export interface ExplorableProvider {
  /** What a card of an explorable says, and whether stills of it may be taken. */
  face(explorable: Id): ExplorableFace | undefined;
  /**
   * The still to draw at a spot now, at its bucket, or the nearest the tab keeps for it; undefined to
   * draw its card. While `settled`, a still missing is asked for.
   */
  still(spot: Readonly<StillSpot>, settled: boolean): StillPicture | undefined;
  /** Called once a frame, after every spot was asked for: the provider sends what it needs. */
  flush(settled: boolean): void;
  /**
   * The same faces and the stills kept for another theme, for an image drawn off screen in it, as
   * Claude's capture in the other theme draws one: it asks for nothing, and shows no other still.
   */
  forImage?(theme: 'light' | 'dark'): ExplorableProvider;
}

/** What a frame tells the layer of the camera. */
export interface ExplorableView {
  scale: number;
  shown: Rect;
  resolution: number;
  settled: boolean;
}

interface Entry {
  ask: StillSpot;
  rect: Rect;
  free: boolean;
  node: Container;
  box: Graphics;
  texts?: Container;
  sprite?: Sprite;
  /** What its card was painted from, to paint it again only when that changes. */
  painted?: { face: ExplorableFace | undefined; colors: ExplorableCardColors; rect: Rect };
  /** The texture key it shows. */
  shown?: string;
  /** The still it shows, once its own texture is made: then a frame asks the store nothing. */
  exact?: string;
  dim: boolean;
}

export class ExplorableLayer {
  readonly container = new Container();
  readonly #store: () => ImageStore<Texture, unknown>;
  readonly #requestRender: () => void;
  readonly #entries = new Map<string, Entry>();
  #provider: ExplorableProvider | undefined;
  #colors: ExplorableCardColors = EXPLORABLE_CARD_COLORS.light;
  /** The texture keys used in the last frame, kept for the store; one list, reused. */
  readonly #keys: string[] = [];
  /** What the frame reaches, one rectangle, reused. */
  readonly #reach: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(store: () => ImageStore<Texture, unknown>, requestRender: () => void) {
    this.#store = store;
    this.#requestRender = requestRender;
  }

  /** What gives the layer faces and stills, if anything. */
  get provider(): ExplorableProvider | undefined {
    return this.#provider;
  }

  /** What the canvas area gives the layer: faces and stills. */
  setProvider(provider: ExplorableProvider | undefined): void {
    this.#provider = provider;
    this.repaint();
  }

  /** The faces or the stills changed: cards are painted again where their face changed. */
  repaint(): void {
    for (const entry of this.#entries.values()) this.#paint(entry);
    this.#requestRender();
  }

  /**
   * The spots of a scene: its element shapes that show an explorable, and its explorable shapes;
   * those `hidden` hides are left out, those `dimmed` dims drawn faded.
   */
  setScene(
    scene: Scene | undefined,
    hidden: { shapes: ReadonlySet<string>; free: ReadonlySet<Id> },
    dimmed: { shapes: ReadonlySet<string>; free: ReadonlySet<Id> },
  ): void {
    const seen = new Set<string>();
    if (scene) {
      for (const shape of scene.shapes) {
        const shown = shape.explorable;
        if (!shown || hidden.shapes.has(shape.key)) continue;
        seen.add(shape.key);
        this.#take(
          shape.key,
          shown.id,
          shape.element,
          shown.rect,
          false,
          dimmed.shapes.has(shape.key),
        );
      }
      for (const picture of picturesOf(scene)) {
        const shown = picture.explorable;
        if (!shown || hidden.free.has(picture.id)) continue;
        seen.add(picture.id);
        this.#take(
          picture.id,
          shown.id,
          shown.element,
          picture.rect,
          true,
          dimmed.free.has(picture.id),
        );
      }
    }
    for (const [spot, entry] of this.#entries) {
      if (seen.has(spot)) continue;
      this.#entries.delete(spot);
      entry.node.destroy({ children: true });
    }
    this.#requestRender();
  }

  #take(
    spot: string,
    explorable: Id,
    element: Id | undefined,
    rect: Rect,
    free: boolean,
    dim: boolean,
  ): void {
    let entry = this.#entries.get(spot);
    if (!entry || entry.ask.explorable !== explorable) {
      if (entry) entry.node.destroy({ children: true });
      const node = new Container();
      const box = new Graphics();
      node.addChild(box);
      this.container.addChild(node);
      entry = {
        ask: { spot, explorable, width: 0, height: 0, bucket: 256, distance: 0 },
        rect,
        free,
        node,
        box,
        dim,
      };
      this.#entries.set(spot, entry);
    }
    if (element === undefined) delete entry.ask.element;
    else entry.ask.element = element;
    entry.ask.width = Math.max(1, Math.round(rect.width));
    entry.ask.height = Math.max(1, Math.round(rect.height));
    const moved = !sameRect(entry.rect, rect);
    entry.rect = rect;
    entry.free = free;
    entry.dim = dim;
    entry.node.alpha = dim ? DIMMED_ALPHA : 1;
    if (moved || entry.painted === undefined) this.#paint(entry);
    if (entry.sprite) placeSprite(entry.sprite, rect);
  }

  /** The theme the canvas shows, whose colors cards are drawn in. */
  setTheme(dark: boolean): void {
    const colors = EXPLORABLE_CARD_COLORS[dark ? 'dark' : 'light'];
    if (colors === this.#colors) return;
    this.#colors = colors;
    this.repaint();
  }

  /** Moves the loose explorables being dragged by a distance, faded as dragged shapes are. */
  setDrag(ids: ReadonlySet<Id>, delta: { x: number; y: number }): void {
    for (const entry of this.#entries.values()) {
      const dragged = entry.free && ids.has(entry.ask.spot);
      entry.node.position.set(dragged ? delta.x : 0, dragged ? delta.y : 0);
      entry.node.alpha = (entry.dim ? DIMMED_ALPHA : 1) * (dragged ? 0.85 : 1);
    }
    this.#requestRender();
  }

  /** Where a spot is drawn, in canvas units: a loose shape's rectangle, an element's plate. */
  rectOf(spot: string): Rect | undefined {
    return this.#entries.get(spot)?.rect;
  }

  /**
   * Draws a frame: the still of each spot near the screen, or its card. Answers whether it waits
   * for a texture the store makes in a later frame.
   */
  frame(view: ExplorableView): boolean {
    const provider = this.#provider;
    const store = this.#store();
    const { shown } = view;
    const reach = this.#reach;
    const margin = Math.max(shown.width, shown.height) * 0.25;
    reach.x = shown.x - margin;
    reach.y = shown.y - margin;
    reach.width = shown.width + 2 * margin;
    reach.height = shown.height + 2 * margin;
    const middleX = shown.x + shown.width / 2;
    const middleY = shown.y + shown.height / 2;
    const drawings = view.scale >= IMAGE_SCALES.drawingsFrom;
    let waiting = false;
    this.#keys.length = 0;
    for (const entry of this.#entries.values()) {
      // Drawn wherever it is, so that an image of the canvas holds it; asked for only near the screen.
      const visible = entry.free || drawings;
      entry.node.visible = visible;
      if (!visible || !provider || !overlaps(entry.rect, reach)) continue;
      const { rect, ask } = entry;
      ask.bucket = stillBucket(rect.width * view.scale * view.resolution);
      ask.distance = Math.hypot(
        rect.x + rect.width / 2 - middleX,
        rect.y + rect.height / 2 - middleY,
      );
      const still = provider.still(ask, view.settled);
      if (!still) {
        if (entry.sprite) {
          entry.sprite.destroy();
          entry.sprite = undefined;
          entry.shown = undefined;
          entry.exact = undefined;
          if (entry.texts) entry.texts.visible = true;
          this.#paint(entry);
        }
        continue;
      }
      if (entry.exact === still.key && entry.shown !== undefined) {
        this.#keys.push(entry.shown);
        continue;
      }
      const made = store.readyTexture({
        serial: solidPictureSerial(`explorable ${still.key}`),
        group: `explorable ${ask.spot}`,
        picture: still.picture,
        width: still.width,
        height: still.height,
        distance: ask.distance,
        tile: EXPLORABLE_LAYER,
      });
      if (!made) {
        waiting = true;
        continue;
      }
      if (!made.exact) waiting = true;
      this.#keys.push(made.key);
      entry.exact = made.exact ? still.key : undefined;
      if (entry.shown !== made.key) {
        entry.shown = made.key;
        if (!entry.sprite) {
          entry.sprite = new Sprite(made.texture);
          entry.node.addChild(entry.sprite);
        } else {
          entry.sprite.texture = made.texture;
        }
        placeSprite(entry.sprite, rect);
        // The card goes under the still; only its frame shows round its edge.
        if (entry.texts) entry.texts.visible = false;
      }
    }
    store.use(EXPLORABLE_LAYER, this.#keys);
    provider?.flush(view.settled);
    return waiting;
  }

  /** Lets go of every texture, as when the store let every texture go. */
  reset(): void {
    for (const entry of this.#entries.values()) {
      entry.sprite?.destroy();
      entry.sprite = undefined;
      entry.shown = undefined;
      entry.exact = undefined;
      if (entry.texts) entry.texts.visible = true;
    }
  }

  destroy(): void {
    this.#entries.clear();
    this.container.destroy({ children: true });
  }

  /** Paints a spot's card, when its face, its place or the theme changed since it was painted. */
  #paint(entry: Entry): void {
    const face = this.#provider?.face(entry.ask.explorable);
    const painted = entry.painted;
    if (
      painted &&
      painted.face === face &&
      painted.colors === this.#colors &&
      sameRect(painted.rect, entry.rect)
    ) {
      return;
    }
    entry.painted = { face, colors: this.#colors, rect: entry.rect };
    const colors = this.#colors;
    const { rect, box } = entry;
    // The one card every place draws (`card-layout.ts`).
    const layout = explorableCardLayout(rect, face ?? { name: entry.ask.explorable });
    box.clear();
    box.roundRect(rect.x, rect.y, rect.width, rect.height, layout.radius).fill(colors.fill);
    box.rect(layout.band.x, layout.band.y, layout.band.width, layout.band.height).fill(colors.band);
    box.roundRect(rect.x, rect.y, rect.width, rect.height, layout.radius).stroke({
      color: colors.border,
      width: 1,
    });
    entry.texts?.destroy({ children: true });
    const texts = new Container();
    for (const text of layout.texts) {
      const tint = cardTextColor(colors, text.role);
      if (text.rich) {
        // A description with Math or emphasis, typeset as a detail is (ADR 0106).
        const label = new EmphasisLabel(text.rich.laid);
        label.position.set(text.x, text.rich.y);
        label.paint(cardColor(tint));
        texts.addChild(label);
        continue;
      }
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
        written.tint = tint;
        texts.addChild(written);
      }
    }
    texts.visible = entry.sprite === undefined;
    entry.texts = texts;
    entry.node.addChildAt(texts, 1);
  }

  /** The spots the layer draws, for tests. */
  get spots(): readonly string[] {
    return [...this.#entries.keys()];
  }

  /** Whether a spot shows its still now, for tests. */
  showsStill(spot: string): boolean {
    return this.#entries.get(spot)?.shown !== undefined;
  }
}

function placeSprite(sprite: Sprite, rect: Rect): void {
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width;
  sprite.height = rect.height;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
