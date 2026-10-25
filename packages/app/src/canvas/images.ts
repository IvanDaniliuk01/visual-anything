/**
 * The image store: the textures the canvas draws images with, made only by decoding each cleaned image
 * as a picture, never as markup in the page, and kept within a frame budget and a GPU budget.
 *
 * - **Serials.** Each cleaned image's content gets a serial, kept across reloads, so that equal
 *   content keeps its textures and tiles when the whole project is sent again.
 * - **Keys.** A texture is made for a serial, a bucket (16 to 512 device pixels, from the size on
 *   screen) and whether it is a silhouette, rasterized once in white and tinted on the GPU. No key
 *   holds a colour, so a theme switch rasterizes nothing.
 * - **Atlas.** Buckets of 64 pixels or less share 2048² atlas pages, with 4-pixel gutters whose edges
 *   are extruded and no mipmaps; larger ones get textures of their own, mipmapped. A page keeps its
 *   pixels on the CPU, and a frame uploads only the rows of the cells drawn into since the last one.
 * - **Work per frame.** An SVG's cost is unknown until its first rasterization, which happens only
 *   while the camera rests, at the 32 bucket, timed; one that takes over 16 ms is broken for the
 *   session. During motion, an SVG is rasterized only at a bucket whose cost is known and that fits the
 *   frame. At most one SVG rasterization and two bitmap decodes a frame, nearest the middle of the
 *   screen first, and no new work once the frame has spent 8 ms.
 * - **Lifetime.** Tiles say which textures their image drawing uses. A tile out of the settled reach
 *   for 3 seconds gives them up. Only textures that no tile uses are evicted, oldest use first, while
 *   the estimate of GPU memory is over 64 MiB.
 *
 * The renderer wires it in (wave 2): see `docs/designs/components.md` §5.7.
 */
import type { CleanedImage } from '@visual-anything/core';
import { BufferImageSource, CanvasSource, Rectangle, Texture } from 'pixi.js';
import { imageSerial, pruneImageSerials } from './image-serials';

/** The sizes textures are made at, in device pixels along the picture's longer side. */
export const BUCKETS = [16, 32, 64, 128, 256, 512] as const;

/** A size a texture is made at. */
export type Bucket = (typeof BUCKETS)[number];

/** The limits the store keeps. */
export const IMAGE_LIMITS = {
  /** SVG rasterizations a frame. */
  svgRasterizations: 1,
  /** SVG pictures a frame starts loading. */
  svgLoads: 1,
  /** Bitmap decodes a frame starts. */
  bitmapDecodes: 2,
  /** Decoded bitmaps a frame turns into textures. */
  bitmapUploads: 2,
  /** Of those, how many may be textures of their own, larger than the atlas takes. */
  largeUploads: 1,
  /** Tiles a frame asks to rebuild their image drawings. */
  tileRebuilds: 4,
  /** No new image work once the frame has spent this many milliseconds. */
  workAfter: 8,
  /** During motion, an SVG is rasterized only while the frame's time plus its cost stays under this. */
  motionBudget: 10,
  /** An SVG whose first rasterization takes longer, in milliseconds, is broken for the session. */
  slowFirst: 16,
  /** The bucket an SVG is first rasterized at, to learn what it costs. */
  firstBucket: 32 as Bucket,
  /** A tile out of the settled reach for this many milliseconds gives up its textures. */
  outOfReach: 3000,
  /** The estimate of GPU memory past which textures no tile uses are evicted, in bytes. */
  gpuBudget: 64 * 1024 * 1024,
  /** The side of an atlas page, in pixels. */
  atlasPage: 2048,
  /** The gutter around each picture in an atlas page, in pixels. */
  gutter: 4,
  /** The largest bucket kept in atlas pages. */
  atlasBucket: 64 as Bucket,
} as const;

/** How much more memory mipmaps take. */
const MIPMAPS = 1.33;

// --- Serials -------------------------------------------------------------------------------------

// Kept apart, in a module without PixiJS, so that the scene can name pictures by them.
export { imageSerial, pruneImageSerials } from './image-serials';

// --- Buckets and keys ----------------------------------------------------------------------------

/**
 * The bucket for a picture shown this large along its longer side, in device pixels: the nearest one,
 * by ratio, so that the texture is within 1.5 times the size on screen, ties going to the larger. An
 * 18-unit icon at scale 0.45 on a 1× screen is about 8 pixels, and takes the 16 bucket.
 */
export function bucketFor(devicePixels: number): Bucket {
  let best: Bucket = BUCKETS[0];
  for (const bucket of BUCKETS) {
    if (Math.abs(Math.log2(devicePixels / bucket)) <= Math.abs(Math.log2(devicePixels / best))) {
      best = bucket;
    }
  }
  return best;
}

/**
 * The bucket for a picture shown this large once the camera rests: the smallest one at least as large,
 * so that it is never drawn larger than its texture, as resting text is sharpened.
 */
export function sharpBucketFor(devicePixels: number): Bucket {
  for (const bucket of BUCKETS) if (devicePixels <= bucket) return bucket;
  return 512;
}

/** The key of a texture: a serial, a bucket and whether it is a silhouette. */
export function textureKey(serial: number, bucket: Bucket, silhouette: boolean): string {
  return `${serial}:${bucket}:${silhouette ? 's' : 'c'}`;
}

/** The size, in pixels, a picture of this width and height takes in a bucket, its proportions kept. */
export function sizeIn(
  bucket: Bucket,
  width: number,
  height: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  return {
    width: Math.max(1, Math.round((bucket * width) / long)),
    height: Math.max(1, Math.round((bucket * height) / long)),
  };
}

// --- The atlas -----------------------------------------------------------------------------------

/** Where a picture sits in an atlas page: its place, inside its gutter. */
export interface Slot {
  page: number;
  /** The picture's left edge, inside the gutter. */
  x: number;
  y: number;
  /** The cell's side, gutters included. */
  cell: number;
}

/**
 * Places pictures of the atlas buckets in pages, row by row: each row holds cells of one size, a
 * bucket plus a gutter on each side, and freed cells are used again.
 */
export class AtlasLayout {
  readonly #pages = new Map<
    number,
    { rows: { y: number; cell: number; next: number }[]; height: number; used: number }
  >();
  readonly #free = new Map<number, Slot[]>();
  #lastPage = 0;

  /** Places a picture of a bucket. */
  place(bucket: Bucket): { slot: Slot; newPage: boolean } {
    const { atlasPage: side, gutter } = IMAGE_LIMITS;
    const cell = bucket + 2 * gutter;
    const reused = this.#free.get(cell)?.pop();
    if (reused) {
      const page = this.#pages.get(reused.page);
      if (page) page.used += 1;
      return { slot: reused, newPage: false };
    }
    for (const [number, page] of this.#pages) {
      const row = page.rows.find((each) => each.cell === cell && each.next + cell <= side);
      if (row) {
        const slot = { page: number, x: row.next + gutter, y: row.y + gutter, cell };
        row.next += cell;
        page.used += 1;
        return { slot, newPage: false };
      }
      if (page.height + cell <= side) {
        page.rows.push({ y: page.height, cell, next: cell });
        const slot = { page: number, x: gutter, y: page.height + gutter, cell };
        page.height += cell;
        page.used += 1;
        return { slot, newPage: false };
      }
    }
    const number = ++this.#lastPage;
    this.#pages.set(number, { rows: [{ y: 0, cell, next: cell }], height: cell, used: 1 });
    return { slot: { page: number, x: gutter, y: gutter, cell }, newPage: true };
  }

  /** Frees a slot; says whether its page is now empty, and so gone. */
  free(slot: Slot): boolean {
    const page = this.#pages.get(slot.page);
    if (!page) return false;
    page.used -= 1;
    if (page.used > 0) {
      const list = this.#free.get(slot.cell) ?? [];
      list.push(slot);
      this.#free.set(slot.cell, list);
      return false;
    }
    this.#pages.delete(slot.page);
    for (const [cell, list] of this.#free) {
      this.#free.set(
        cell,
        list.filter((each) => each.page !== slot.page),
      );
    }
    return true;
  }

  /** How many pages are open. */
  get pages(): number {
    return this.#pages.size;
  }
}

// --- The platform --------------------------------------------------------------------------------

/** What the store needs from the browser and the GPU; tests give it a fake. */
export interface ImagePlatform<T, P> {
  /** The time, in milliseconds. */
  now(): number;
  /** A bitmap's bytes from its base64. */
  bytesOf(base64: string): Uint8Array;
  /** Starts decoding a bitmap off the main thread, at a size. */
  decodeBitmap(bytes: Uint8Array, type: string, width: number, height: number): Promise<P>;
  /** Starts loading cleaned SVG text as a picture at a size, never attached to the document. */
  loadSvg(svg: string, width: number, height: number): Promise<P>;
  /** Draws a picture into a texture of its own, mipmapped; white where a silhouette. */
  texture(picture: P, width: number, height: number, silhouette: boolean): T;
  /** Draws a picture into an atlas page's slot, its edges extruded into the gutter, and gives the slot's texture. */
  atlasTexture(slot: Slot, picture: P, width: number, height: number, silhouette: boolean): T;
  /** Uploads the atlas pages drawn into since it was last called. */
  flush(): void;
  /** Lets a texture go; `own` when its source is its own, not an atlas page. */
  destroyTexture(texture: T, own: boolean): void;
  /** Lets an atlas page go. */
  destroyPage(page: number): void;
  /** Lets a picture go once it is drawn, as `ImageBitmap.close()` does. */
  releasePicture(picture: P): void;
}

// --- The store -----------------------------------------------------------------------------------

/** A picture the renderer would draw, and where. */
export interface ImageRequest {
  image: CleanedImage;
  /** The size the picture takes on screen along its longer side, in device pixels. */
  devicePixels: number;
  /**
   * Whether the camera has rested (`SETTLE_AFTER`), so the picture is drawn sharp, at a bucket at
   * least its size on screen; while it moves, the nearest bucket does.
   */
  sharp?: boolean;
  /** Whether it is drawn as a silhouette, tinted on the GPU. */
  silhouette: boolean;
  /** How far its middle is from the middle of the screen: nearer is drawn first. */
  distance: number;
  /** The tile whose image drawing shows it, which is rebuilt when a better texture is ready. */
  tile: string;
}

/** A texture to draw a picture with. */
export interface ImageTexture<T> {
  texture: T;
  key: string;
  bucket: Bucket;
  /** Whether it is the bucket asked for, rather than a stand-in from another bucket. */
  exact: boolean;
}

/** What the renderer gives the store each frame. */
export interface ImageFrame {
  /** The time the frame has spent before its image work, in milliseconds. */
  spent: number;
  /** Whether the camera moves. */
  moving: boolean;
}

interface Made<T> {
  key: string;
  serial: number;
  bucket: Bucket;
  silhouette: boolean;
  texture: T;
  slot?: Slot;
  bytes: number;
  lastUse: number;
}

interface Wanted<P> {
  key: string;
  image: CleanedImage;
  serial: number;
  bucket: Bucket;
  silhouette: boolean;
  distance: number;
  tiles: Set<string>;
  /** Since when none of its tiles is within the settled reach. */
  outSince?: number;
  state: 'new' | 'loading' | 'ready';
  picture?: P;
}

/** The textures the canvas draws images with. */
export class ImageStore<T = Texture, P = CanvasImageSource> {
  readonly #platform: ImagePlatform<T, P>;
  readonly #made = new Map<string, Made<T>>();
  readonly #wanted = new Map<string, Wanted<P>>();
  /** Costs of rasterizing each SVG, by serial, then bucket, in milliseconds. */
  readonly #costs = new Map<number, Map<Bucket, number>>();
  readonly #broken = new Set<number>();
  readonly #uses = new Map<string, Set<string>>();
  readonly #usedBy = new Map<string, Set<string>>();
  readonly #outSince = new Map<string, number>();
  readonly #rebuild: string[] = [];
  #atlas = new AtlasLayout();
  #pageBytes = 0;
  #textureBytes = 0;
  readonly #onArrive: (() => void) | undefined;
  #more = false;

  /**
   * `onArrive` is called when a picture finishes loading or decoding, or fails to, off the frame: the
   * canvas then draws a frame to make its texture.
   */
  constructor(platform: ImagePlatform<T, P>, onArrive?: () => void) {
    this.#platform = platform;
    this.#onArrive = onArrive;
  }

  /**
   * Whether the last frame left work it could have done but for its limits, so that the next frame
   * should come soon; work that waits for the camera to rest, or for a picture to load, does not count.
   */
  get more(): boolean {
    return this.#more;
  }

  /**
   * The texture to draw a picture with now: the one of its bucket, or a stand-in of another bucket of
   * the same picture while that one is made; `undefined` to draw the placeholder. It asks for the one
   * of its bucket when missing.
   */
  texture(request: ImageRequest): ImageTexture<T> | undefined {
    const serial = imageSerial(request.image);
    if (this.#broken.has(serial)) return undefined;
    const bucket = request.sharp
      ? sharpBucketFor(request.devicePixels)
      : bucketFor(request.devicePixels);
    const key = textureKey(serial, bucket, request.silhouette);
    const made = this.#made.get(key);
    if (made) return { texture: made.texture, key, bucket, exact: true };
    this.#want(request, serial, bucket, key);
    if (request.image.kind === 'svg' && !this.#costs.has(serial)) {
      // Its cost is learned at the first bucket, while the camera rests.
      const first = IMAGE_LIMITS.firstBucket;
      this.#want(request, serial, first, textureKey(serial, first, request.silhouette));
    } else if (request.image.kind === 'svg') {
      // Too costly to draw at once: one bucket larger than it has, whose cost is then measured.
      const step = this.#stepToward(serial, bucket, request.silhouette);
      if (step !== undefined) {
        this.#want(request, serial, step, textureKey(serial, step, request.silhouette));
      }
    }
    const standIn = this.#standIn(serial, bucket, request.silhouette);
    return standIn
      ? { texture: standIn.texture, key: standIn.key, bucket: standIn.bucket, exact: false }
      : undefined;
  }

  /** Whether a picture can never be drawn this session: an SVG too slow to draw, or a bitmap that does not decode. */
  isBroken(image: CleanedImage): boolean {
    return this.#broken.has(imageSerial(image));
  }

  /** Records the textures a tile's image drawing uses, in place of what it used before. */
  use(tile: string, keys: Iterable<string>): void {
    this.release(tile);
    const now = this.#platform.now();
    const set = new Set<string>();
    for (const key of keys) {
      const made = this.#made.get(key);
      if (!made) continue;
      set.add(key);
      made.lastUse = now;
      const users = this.#usedBy.get(key) ?? new Set<string>();
      users.add(tile);
      this.#usedBy.set(key, users);
    }
    if (set.size > 0) this.#uses.set(tile, set);
  }

  /** A tile gives up the textures its image drawing used, as when it goes. */
  release(tile: string): void {
    const keys = this.#uses.get(tile);
    if (!keys) return;
    this.#uses.delete(tile);
    this.#outSince.delete(tile);
    for (const key of keys) {
      const users = this.#usedBy.get(key);
      users?.delete(tile);
      if (users?.size === 0) this.#usedBy.delete(key);
    }
  }

  /**
   * Notes which tiles are within the settled reach; the renderer calls it each frame. A tile that
   * uses textures and stays out of it for 3 seconds gives them up; those tiles are returned, so the
   * renderer drops their image drawings and asks again when they come back. A picture asked for only
   * by tiles out of reach for as long is forgotten, as one panned past.
   */
  settle(inReach: ReadonlySet<string>): string[] {
    const now = this.#platform.now();
    const dropped: string[] = [];
    for (const [key, wanted] of this.#wanted) {
      if ([...wanted.tiles].some((tile) => inReach.has(tile))) {
        delete wanted.outSince;
        continue;
      }
      wanted.outSince ??= now;
      if (now - wanted.outSince < IMAGE_LIMITS.outOfReach) continue;
      if (wanted.picture !== undefined) this.#platform.releasePicture(wanted.picture);
      this.#wanted.delete(key);
    }
    for (const tile of [...this.#uses.keys()]) {
      if (inReach.has(tile)) {
        this.#outSince.delete(tile);
        continue;
      }
      const since = this.#outSince.get(tile);
      if (since === undefined) this.#outSince.set(tile, now);
      else if (now - since >= IMAGE_LIMITS.outOfReach) {
        this.release(tile);
        dropped.push(tile);
      }
    }
    return dropped;
  }

  /**
   * Does the image work a frame allows, and gives the tiles to rebuild their image drawings now, at
   * most four, nearest the textures that became ready first.
   */
  frame(frame: ImageFrame): string[] {
    const platform = this.#platform;
    const start = platform.now();
    const spent = () => frame.spent + platform.now() - start;
    const nearest = [...this.#wanted.values()].sort((a, b) => a.distance - b.distance);

    let decodes = 0;
    let uploads = 0;
    let largeUploads = 0;
    let loads = 0;
    let rasterized = 0;
    let more = false;
    for (const wanted of nearest) {
      if (spent() >= IMAGE_LIMITS.workAfter) {
        more = true;
        break;
      }
      if (this.#broken.has(wanted.serial)) {
        this.#wanted.delete(wanted.key);
        continue;
      }
      if (wanted.image.kind === 'bitmap') {
        if (wanted.state === 'new') {
          if (decodes < IMAGE_LIMITS.bitmapDecodes) {
            decodes += 1;
            this.#decode(wanted);
          } else more = true;
        } else if (wanted.state === 'ready') {
          const large = wanted.bucket > IMAGE_LIMITS.atlasBucket;
          if (
            uploads < IMAGE_LIMITS.bitmapUploads &&
            (!large || largeUploads < IMAGE_LIMITS.largeUploads)
          ) {
            uploads += 1;
            if (large) largeUploads += 1;
            this.#make(wanted);
          } else more = true;
        }
        continue;
      }
      if (!this.#mayRasterize(wanted, frame.moving, spent())) continue;
      if (wanted.state === 'new') {
        if (loads < IMAGE_LIMITS.svgLoads) {
          loads += 1;
          this.#load(wanted);
        } else more = true;
      } else if (wanted.state === 'ready') {
        if (rasterized < IMAGE_LIMITS.svgRasterizations) {
          rasterized += 1;
          this.#rasterize(wanted);
        } else more = true;
      }
    }
    this.#more = more || this.#rebuild.length > IMAGE_LIMITS.tileRebuilds;
    platform.flush();
    this.#evict();
    return this.#rebuild.splice(0, IMAGE_LIMITS.tileRebuilds);
  }

  /** Forgets the pictures a project no longer holds, as after a reload. */
  prune(images: Iterable<CleanedImage>): void {
    const list = [...images];
    pruneImageSerials(list);
    const present = new Set(list.map(imageSerial));
    for (const [key, wanted] of this.#wanted)
      if (!present.has(wanted.serial)) this.#wanted.delete(key);
    for (const made of [...this.#made.values()]) {
      if (!present.has(made.serial) && !this.#usedBy.has(made.key)) this.#drop(made);
    }
    for (const serial of this.#costs.keys()) if (!present.has(serial)) this.#costs.delete(serial);
  }

  /** The estimate of the GPU memory the store's textures take, in bytes. */
  get gpuBytes(): number {
    return this.#pageBytes + this.#textureBytes;
  }

  /** How many textures the store holds. */
  get size(): number {
    return this.#made.size;
  }

  /** Lets every texture and page go. */
  destroy(): void {
    for (const made of [...this.#made.values()]) this.#drop(made);
    for (const wanted of this.#wanted.values()) {
      if (wanted.picture !== undefined) this.#platform.releasePicture(wanted.picture);
    }
    this.#wanted.clear();
  }

  /**
   * Starts again from nothing: every texture and picture goes, and what it learned of each SVG's cost,
   * and that some pictures cannot be drawn, is forgotten. The tiles must draw their pictures again, as
   * the benchmark's cold runs do.
   */
  clear(): void {
    this.destroy();
    this.#costs.clear();
    this.#broken.clear();
    this.#uses.clear();
    this.#usedBy.clear();
    this.#outSince.clear();
    this.#rebuild.length = 0;
    this.#atlas = new AtlasLayout();
    this.#pageBytes = 0;
    this.#textureBytes = 0;
    this.#more = false;
  }

  #want(request: ImageRequest, serial: number, bucket: Bucket, key: string): void {
    if (this.#made.has(key)) return;
    const known = this.#wanted.get(key);
    if (known) {
      known.distance = Math.min(known.distance, request.distance);
      known.tiles.add(request.tile);
      return;
    }
    this.#wanted.set(key, {
      key,
      image: request.image,
      serial,
      bucket,
      silhouette: request.silhouette,
      distance: request.distance,
      tiles: new Set([request.tile]),
      state: 'new',
    });
  }

  #standIn(serial: number, bucket: Bucket, silhouette: boolean): Made<T> | undefined {
    let best: Made<T> | undefined;
    for (const each of BUCKETS) {
      const made = this.#made.get(textureKey(serial, each, silhouette));
      if (!made) continue;
      if (!best || Math.abs(Math.log2(each / bucket)) < Math.abs(Math.log2(best.bucket / bucket)))
        best = made;
    }
    return best;
  }

  /** The cost of rasterizing an SVG at a bucket, when it was rasterized at that bucket or a larger one. */
  #knownCost(serial: number, bucket: Bucket): number | undefined {
    const costs = this.#costs.get(serial);
    if (!costs) return undefined;
    for (const each of BUCKETS) {
      if (each < bucket) continue;
      const cost = costs.get(each);
      if (cost !== undefined) return cost;
    }
    return undefined;
  }

  /**
   * What rasterizing an SVG at a bucket should cost: what it cost at that bucket or a larger one, or
   * at a smaller one grown with the pixels, the side squared; the least of these.
   */
  #estimatedCost(serial: number, bucket: Bucket): number | undefined {
    const costs = this.#costs.get(serial);
    if (!costs) return undefined;
    let estimate: number | undefined;
    for (const [each, cost] of costs) {
      const grown = each >= bucket ? cost : cost * (bucket / each) ** 2;
      if (estimate === undefined || grown < estimate) estimate = grown;
    }
    return estimate;
  }

  /**
   * The bucket to rasterize an SVG at on the way to `bucket`, when `bucket` itself should take too
   * long from what is known: the one after the largest one made, if that one should not.
   */
  #stepToward(serial: number, bucket: Bucket, silhouette: boolean): Bucket | undefined {
    const fits = (each: Bucket) => {
      const estimate = this.#estimatedCost(serial, each);
      return estimate !== undefined && estimate <= IMAGE_LIMITS.slowFirst;
    };
    if (fits(bucket)) return undefined;
    let largest: Bucket | undefined;
    for (const each of BUCKETS) {
      if (each < bucket && this.#made.has(textureKey(serial, each, silhouette))) largest = each;
    }
    if (largest === undefined) return undefined;
    const step = BUCKETS[BUCKETS.indexOf(largest) + 1];
    return step !== undefined && step < bucket && fits(step) ? step : undefined;
  }

  #mayRasterize(wanted: Wanted<P>, moving: boolean, spent: number): boolean {
    if (!this.#costs.has(wanted.serial))
      return !moving && wanted.bucket === IMAGE_LIMITS.firstBucket;
    if (!moving) {
      // At rest too, a frame keeps to what a first rasterization may take: a picture whose larger
      // bucket would take longer stays drawn from a smaller one.
      const estimate = this.#estimatedCost(wanted.serial, wanted.bucket);
      return estimate !== undefined && spent + estimate <= IMAGE_LIMITS.slowFirst;
    }
    const cost = this.#knownCost(wanted.serial, wanted.bucket);
    return cost !== undefined && spent + cost < IMAGE_LIMITS.motionBudget;
  }

  #decode(wanted: Wanted<P>): void {
    if (wanted.image.kind !== 'bitmap') return;
    wanted.state = 'loading';
    const size = sizeIn(wanted.bucket, wanted.image.width, wanted.image.height);
    let bytes: Uint8Array;
    try {
      bytes = this.#platform.bytesOf(wanted.image.data);
    } catch {
      this.#break(wanted.serial);
      return;
    }
    this.#platform
      .decodeBitmap(bytes, `image/${wanted.image.format}`, size.width, size.height)
      .then((picture) => this.#arrived(wanted, picture))
      .catch(() => this.#failed(wanted.serial));
  }

  #load(wanted: Wanted<P>): void {
    if (wanted.image.kind !== 'svg') return;
    wanted.state = 'loading';
    const size = sizeIn(wanted.bucket, wanted.image.width, wanted.image.height);
    this.#platform
      .loadSvg(wanted.image.svg, size.width, size.height)
      .then((picture) => this.#arrived(wanted, picture))
      .catch(() => this.#failed(wanted.serial));
  }

  #arrived(wanted: Wanted<P>, picture: P): void {
    if (this.#wanted.get(wanted.key) !== wanted) {
      this.#platform.releasePicture(picture);
      return;
    }
    wanted.picture = picture;
    wanted.state = 'ready';
    this.#onArrive?.();
  }

  /** A picture that does not load or decode is broken for the session; its tiles draw again. */
  #failed(serial: number): void {
    this.#break(serial);
    this.#onArrive?.();
  }

  #rasterize(wanted: Wanted<P>): void {
    const first = !this.#costs.has(wanted.serial);
    const start = this.#platform.now();
    const made = this.#make(wanted);
    const cost = this.#platform.now() - start;
    const costs = this.#costs.get(wanted.serial) ?? new Map<Bucket, number>();
    costs.set(wanted.bucket, cost);
    this.#costs.set(wanted.serial, costs);
    if (first && cost > IMAGE_LIMITS.slowFirst) {
      if (made) this.#drop(made);
      this.#break(wanted.serial);
    }
  }

  /** Makes the texture a wanted picture becomes, and asks its tiles to rebuild. */
  #make(wanted: Wanted<P>): Made<T> | undefined {
    const picture = wanted.picture;
    this.#wanted.delete(wanted.key);
    if (picture === undefined) return undefined;
    const size = sizeIn(wanted.bucket, wanted.image.width, wanted.image.height);
    let made: Made<T>;
    if (wanted.bucket <= IMAGE_LIMITS.atlasBucket) {
      const { slot, newPage } = this.#atlas.place(wanted.bucket);
      if (newPage) this.#pageBytes += IMAGE_LIMITS.atlasPage * IMAGE_LIMITS.atlasPage * 4;
      const texture = this.#platform.atlasTexture(
        slot,
        picture,
        size.width,
        size.height,
        wanted.silhouette,
      );
      made = { ...this.#madeFrom(wanted), texture, slot, bytes: 0 };
    } else {
      const texture = this.#platform.texture(picture, size.width, size.height, wanted.silhouette);
      const bytes = Math.round(size.width * size.height * 4 * MIPMAPS);
      this.#textureBytes += bytes;
      made = { ...this.#madeFrom(wanted), texture, bytes };
    }
    this.#platform.releasePicture(picture);
    this.#made.set(made.key, made);
    for (const tile of wanted.tiles) if (!this.#rebuild.includes(tile)) this.#rebuild.push(tile);
    return made;
  }

  #madeFrom(wanted: Wanted<P>): Omit<Made<T>, 'texture' | 'slot' | 'bytes'> {
    return {
      key: wanted.key,
      serial: wanted.serial,
      bucket: wanted.bucket,
      silhouette: wanted.silhouette,
      lastUse: this.#platform.now(),
    };
  }

  #break(serial: number): void {
    this.#broken.add(serial);
    for (const [key, wanted] of this.#wanted) {
      if (wanted.serial !== serial) continue;
      if (wanted.picture !== undefined) this.#platform.releasePicture(wanted.picture);
      this.#wanted.delete(key);
      // Its tiles show the placeholder, drawn again without the stand-in.
      for (const tile of wanted.tiles) if (!this.#rebuild.includes(tile)) this.#rebuild.push(tile);
    }
    for (const made of [...this.#made.values()]) {
      if (made.serial === serial && !this.#usedBy.has(made.key)) this.#drop(made);
    }
  }

  /** Evicts textures that no tile uses, oldest use first, while the estimate is over the budget. */
  #evict(): void {
    if (this.gpuBytes <= IMAGE_LIMITS.gpuBudget) return;
    const unused = [...this.#made.values()]
      .filter((made) => !this.#usedBy.has(made.key))
      .sort((a, b) => a.lastUse - b.lastUse);
    for (const made of unused) {
      if (this.gpuBytes <= IMAGE_LIMITS.gpuBudget) break;
      this.#drop(made);
    }
  }

  #drop(made: Made<T>): void {
    this.#made.delete(made.key);
    if (made.slot) {
      this.#platform.destroyTexture(made.texture, false);
      if (this.#atlas.free(made.slot)) {
        this.#platform.destroyPage(made.slot.page);
        this.#pageBytes -= IMAGE_LIMITS.atlasPage * IMAGE_LIMITS.atlasPage * 4;
      }
    } else {
      this.#platform.destroyTexture(made.texture, true);
      this.#textureBytes -= made.bytes;
    }
  }
}

// --- The browser ---------------------------------------------------------------------------------

/** Cleaned SVG text with the size to draw it at, on its outermost element, which cleaning left bare. */
export function svgAtSize(svg: string, width: number, height: number): string {
  return svg.replace(/^<svg /, `<svg height="${height}" width="${width}" `);
}

/** What loading an SVG picture uses, which tests replace. */
export interface SvgLoading {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createImage(): HTMLImageElement;
}

const browserLoading: SvgLoading = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createImage: () => new Image(),
};

/**
 * Loads cleaned SVG text as a picture: a Blob, an object URL, a detached image that decodes it, then
 * the URL revoked. A picture drawn as an image runs no script and loads nothing, and the image is
 * never attached to the document.
 */
export async function loadSvgPicture(
  svg: string,
  width: number,
  height: number,
  loading: SvgLoading = browserLoading,
): Promise<HTMLImageElement> {
  const blob = new Blob([svgAtSize(svg, width, height)], { type: 'image/svg+xml' });
  const url = loading.createObjectURL(blob);
  try {
    const image = loading.createImage();
    image.decoding = 'async';
    image.width = width;
    image.height = height;
    image.src = url;
    await image.decode();
    return image;
  } finally {
    loading.revokeObjectURL(url);
  }
}

/** The part of a 2D context that extruding edges uses. */
export interface EdgeContext {
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/**
 * Copies a picture's outer pixels outwards into its gutter, on each side and corner, so that the GPU
 * never samples a neighbour's pixels at the picture's edge.
 */
export function extrudeEdges(
  context: EdgeContext,
  canvas: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  gutter: number,
): void {
  const right = x + width - 1;
  const bottom = y + height - 1;
  context.drawImage(canvas, x, y, width, 1, x, y - gutter, width, gutter);
  context.drawImage(canvas, x, bottom, width, 1, x, bottom + 1, width, gutter);
  context.drawImage(canvas, x, y, 1, height, x - gutter, y, gutter, height);
  context.drawImage(canvas, right, y, 1, height, right + 1, y, gutter, height);
  context.drawImage(canvas, x, y, 1, 1, x - gutter, y - gutter, gutter, gutter);
  context.drawImage(canvas, right, y, 1, 1, right + 1, y - gutter, gutter, gutter);
  context.drawImage(canvas, x, bottom, 1, 1, x - gutter, bottom + 1, gutter, gutter);
  context.drawImage(canvas, right, bottom, 1, 1, right + 1, bottom + 1, gutter, gutter);
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function newCanvas(
  width: number,
  height: number,
  settings?: CanvasRenderingContext2DSettings,
): { canvas: Canvas; context: Context } {
  const offscreen =
    typeof OffscreenCanvas === 'undefined' ? undefined : new OffscreenCanvas(width, height);
  const element = offscreen
    ? undefined
    : Object.assign(document.createElement('canvas'), { width, height });
  const context = offscreen
    ? offscreen.getContext('2d', settings)
    : element?.getContext('2d', settings);
  const canvas = offscreen ?? element;
  if (!context || !canvas) throw new Error('This browser draws no 2D canvas.');
  return { canvas, context };
}

/** Draws a picture in a rectangle; as a silhouette, it becomes white where it is drawn, only there. */
function drawPicture(
  context: Context,
  picture: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  silhouette: boolean,
): void {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.clearRect(x, y, width, height);
  context.drawImage(picture, x, y, width, height);
  if (silhouette) {
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, width, height);
  }
  context.restore();
}

/** Bytes from base64, natively where the browser can. */
function bytesFromBase64(base64: string): Uint8Array {
  const native = (Uint8Array as unknown as { fromBase64?: (text: string) => Uint8Array })
    .fromBase64;
  if (native) return native(base64);
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/**
 * An atlas page's pixels, kept apart from the GPU so that a frame uploads only the rows drawn into
 * since the one before: a whole 2048² page is 16 MiB to upload, the rows of a cell about half a MiB.
 */
export class AtlasPage {
  readonly data: Uint8Array<ArrayBuffer>;
  #from = Infinity;
  #to = -Infinity;

  constructor(readonly side: number) {
    this.data = new Uint8Array(side * side * 4);
  }

  /** Copies the RGBA pixels of a square cell, `cell` texels a side, with its top left at (x, y). */
  put(pixels: Uint8ClampedArray | Uint8Array, cell: number, x: number, y: number): void {
    const rowBytes = cell * 4;
    for (let row = 0; row < cell; row++) {
      this.data.set(
        pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
        ((y + row) * this.side + x) * 4,
      );
    }
    this.#from = Math.min(this.#from, y);
    this.#to = Math.max(this.#to, y + cell);
  }

  /** The texels of the rows drawn into since it was last asked, then none until more are drawn. */
  takeDirty(): { start: number; end: number } | undefined {
    if (this.#to <= this.#from) return undefined;
    const range = { start: this.#from * this.side, end: this.#to * this.side };
    this.#from = Infinity;
    this.#to = -Infinity;
    return range;
  }
}

/** The store's platform in the browser: PixiJS textures from canvases, pictures decoded off the main thread. */
export function browserImagePlatform(): ImagePlatform<Texture, CanvasImageSource> {
  const { atlasPage: side, gutter } = IMAGE_LIMITS;
  const pages = new Map<number, { pixels: AtlasPage; source: BufferImageSource }>();
  // Where a cell is drawn before its pixels are copied into its page, read back often and so kept
  // on the CPU.
  const most = IMAGE_LIMITS.atlasBucket + 2 * gutter;
  let scratch: { canvas: Canvas; context: Context } | undefined;
  const scratchOf = () => (scratch ??= newCanvas(most, most, { willReadFrequently: true }));
  const pageOf = (number: number) => {
    let page = pages.get(number);
    if (!page) {
      const pixels = new AtlasPage(side);
      // The bucket follows the size on screen within 2×, so atlas pages need no mipmaps.
      const source = new BufferImageSource({
        resource: pixels.data,
        width: side,
        height: side,
        format: 'rgba8unorm',
        scaleMode: 'linear',
        autoGenerateMipmaps: false,
      });
      page = { pixels, source };
      pages.set(number, page);
    }
    return page;
  };
  return {
    now: () => performance.now(),
    bytesOf: bytesFromBase64,
    decodeBitmap: (bytes, type, width, height) =>
      createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
      }),
    loadSvg: (svg, width, height) => loadSvgPicture(svg, width, height),
    texture: (picture, width, height, silhouette) => {
      const { canvas, context } = newCanvas(width, height);
      drawPicture(context, picture, 0, 0, width, height, silhouette);
      const source = new CanvasSource({
        resource: canvas,
        scaleMode: 'linear',
        autoGenerateMipmaps: true,
        mipmapFilter: 'linear',
      });
      return new Texture({ source });
    },
    atlasTexture: (slot, picture, width, height, silhouette) => {
      const page = pageOf(slot.page);
      const { canvas, context } = scratchOf();
      context.clearRect(0, 0, slot.cell, slot.cell);
      drawPicture(context, picture, gutter, gutter, width, height, silhouette);
      extrudeEdges(context, canvas, gutter, gutter, width, height, gutter);
      const cell = context.getImageData(0, 0, slot.cell, slot.cell);
      page.pixels.put(cell.data, slot.cell, slot.x - gutter, slot.y - gutter);
      return new Texture({
        source: page.source,
        frame: new Rectangle(slot.x, slot.y, width, height),
      });
    },
    flush: () => {
      for (const page of pages.values()) {
        const dirty = page.pixels.takeDirty();
        if (dirty) page.source.update(dirty.start, dirty.end);
      }
    },
    destroyTexture: (texture, own) => texture.destroy(own),
    destroyPage: (number) => {
      pages.get(number)?.source.destroy();
      pages.delete(number);
    },
    releasePicture: (picture) => {
      if (typeof ImageBitmap !== 'undefined' && picture instanceof ImageBitmap) picture.close();
    },
  };
}
