/**
 * Which tiles the canvas draws element shapes in, and which tiles it can keep from the last time.
 *
 * A shape goes in the tile of its band and of the cell its middle falls in, and of whether it is
 * dimmed: dimmed shapes are drawn faintly, in tiles of their own. Shapes in one band never overlap, so
 * the order of the tiles of a band, and of the shapes in one, is invisible, and a tile's signature
 * does not depend on it. Shapes in bands beyond the last are drawn in runs of consecutive shapes in
 * drawing order that share a cell and whether they are dimmed, above every band, and their order
 * counts.
 */
import { centerOf, type Point } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';

/** How many bands have tiles of their own. */
export const MAX_BANDS = 32;
/** How many shapes beyond the bands one tile draws, at most. */
export const MAX_RUN = 64;
/** The size of a cell, in scene units. */
export const TILE = 1024;

export interface PlannedTile {
  /** `shapes ${band} ${cell}`, ` dim` after it when dimmed, or `shapes over ${first shape's key}` beyond the bands. */
  key: string;
  /** 0 to MAX_BANDS - 1, or MAX_BANDS beyond them. */
  band: number;
  cell: string;
  /** Whether its shapes are dimmed, drawn faintly. */
  dim: boolean;
  /** What the tile draws: equal signatures draw alike, dimmed or not. */
  signature: string;
  /** In a band, by key; beyond the bands, in drawing order. */
  shapes: ElementShape[];
  /** The drawing rank of its first shape, which orders the tiles beyond the bands. */
  rank: number;
}

/** What to do with the tiles drawn before to draw the planned ones. */
export interface TilePlan {
  /** Tiles drawn before that draw what they drew, under the same key. */
  keep: string[];
  /** Tiles drawn before that draw what a planned tile draws, under another key or band. */
  move: { from: string; to: string }[];
  /** Planned tiles that no tile drawn before draws. */
  make: PlannedTile[];
  /** Tiles drawn before that no planned tile needs. */
  drop: string[];
}

const NONE: ReadonlySet<string> = new Set();

/** The cell a point falls in. */
export function cellOf(point: Point): string {
  return `${Math.floor(point.x / TILE)},${Math.floor(point.y / TILE)}`;
}

/** The key of the tile of a band and a cell, dimmed or not. */
export function bandTileKey(band: number, cell: string, dim: boolean): string {
  return dim ? `shapes ${band} ${cell} dim` : `shapes ${band} ${cell}`;
}

const signatures = new WeakMap<ElementShape, string>();

/** Everything about a shape that its drawing shows. */
export function shapeSignature(shape: ElementShape): string {
  let signature = signatures.get(shape);
  if (signature === undefined) {
    const { rect } = shape;
    signature = [
      shape.key,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      shape.kind,
      shape.fill,
      shape.stroke,
      shape.name,
      shape.componentName,
      shape.holdsContents ? 1 : 0,
      shape.collapsed?.contents ?? -1,
    ].join(' ');
    signatures.set(shape, signature);
  }
  return signature;
}

/** The tiles that draw the scene's element shapes, those in `hidden` left out. */
export function plannedTiles(
  indexed: IndexedScene,
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string> = NONE,
): PlannedTile[] {
  const { scene, drawing, bands } = indexed;
  const inBands = new Map<string, PlannedTile>();
  const beyond: PlannedTile[] = [];
  let run: PlannedTile | undefined;
  drawing.forEach((at, rank) => {
    const shape = scene.shapes[at] as ElementShape;
    if (hidden.has(shape.key)) return;
    const band = bands[at] as number;
    const cell = cellOf(centerOf(shape.rect));
    const dim = dimmed.has(shape.key);
    if (band < MAX_BANDS) {
      const key = bandTileKey(band, cell, dim);
      const tile = inBands.get(key);
      if (tile) tile.shapes.push(shape);
      else inBands.set(key, { key, band, cell, dim, signature: '', shapes: [shape], rank });
      return;
    }
    if (run && run.cell === cell && run.dim === dim && run.shapes.length < MAX_RUN) {
      run.shapes.push(shape);
      return;
    }
    run = {
      key: `shapes over ${shape.key}`,
      band: MAX_BANDS,
      cell,
      dim,
      signature: '',
      shapes: [shape],
      rank,
    };
    beyond.push(run);
  });
  for (const tile of inBands.values()) tile.shapes.sort(byKey);
  const planned = [...inBands.values(), ...beyond];
  for (const tile of planned) tile.signature = tile.shapes.map(shapeSignature).join('|');
  return planned;
}

/** The key of the tile in a band a shape goes in, by its index; none while it is hidden. */
export function bandTileKeyOf(
  indexed: IndexedScene,
  at: number,
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string>,
): string | undefined {
  const shape = indexed.scene.shapes[at] as ElementShape;
  if (hidden.has(shape.key)) return undefined;
  return bandTileKey(
    indexed.bands[at] as number,
    cellOf(centerOf(shape.rect)),
    dimmed.has(shape.key),
  );
}

/** A tile in a band as drawn before: what it holds. */
export interface BandTile {
  key: string;
  band: number;
  cell: string;
  shapes: readonly ElementShape[];
}

/**
 * The tiles in bands to plan again when some shapes changed, moved, or were hidden, shown, dimmed or
 * brightened: those the shapes left and those they now go in, each with the shapes it held that did
 * not change, and the changed ones that now go in it. `before` holds those tiles as drawn before,
 * where they were; `changed` holds the indexes of the shapes in the scene, all of them in bands
 * before and now.
 */
export function replannedTiles(
  indexed: IndexedScene,
  before: ReadonlyMap<string, BandTile>,
  changed: readonly number[],
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string>,
): PlannedTile[] {
  const { scene, bands, rankOf } = indexed;
  const leaving = new Set<string>();
  const arriving = new Map<string, ElementShape[]>();
  const places = new Map<string, { band: number; cell: string; dim: boolean }>();
  for (const at of changed) {
    const shape = scene.shapes[at] as ElementShape;
    leaving.add(shape.key);
    if (hidden.has(shape.key)) continue;
    const band = bands[at] as number;
    const cell = cellOf(centerOf(shape.rect));
    const dim = dimmed.has(shape.key);
    const key = bandTileKey(band, cell, dim);
    places.set(key, { band, cell, dim });
    const list = arriving.get(key);
    if (list) list.push(shape);
    else arriving.set(key, [shape]);
  }
  const keys = new Set([...before.keys(), ...arriving.keys()]);
  const planned: PlannedTile[] = [];
  for (const key of keys) {
    const was = before.get(key);
    const shapes = [
      ...(was?.shapes.filter((shape) => !leaving.has(shape.key)) ?? []),
      ...(arriving.get(key) ?? []),
    ];
    if (shapes.length === 0) continue;
    shapes.sort(byKey);
    const place = places.get(key) ?? {
      band: was?.band ?? 0,
      cell: was?.cell ?? '',
      dim: key.endsWith(' dim'),
    };
    let rank = Infinity;
    for (const shape of shapes) {
      const at = indexed.indexOfKey.get(shape.key);
      if (at !== undefined) rank = Math.min(rank, rankOf[at] as number);
    }
    planned.push({
      key,
      ...place,
      signature: shapes.map(shapeSignature).join('|'),
      shapes,
      rank: rank === Infinity ? 0 : rank,
    });
  }
  return planned;
}

function byKey(a: ElementShape, b: ElementShape): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Matches the planned tiles with the tiles drawn before: a tile is kept when its key comes back with
 * the same signature, and moved to a planned tile of its cell that draws the same; the planned tiles
 * left over are made and the tiles left over dropped.
 */
export function planTiles(
  previous: ReadonlyMap<string, { cell: string; signature: string }>,
  planned: readonly PlannedTile[],
): TilePlan {
  const plan: TilePlan = { keep: [], move: [], make: [], drop: [] };
  const kept = new Set<string>();
  const waiting: PlannedTile[] = [];
  for (const tile of planned) {
    if (previous.get(tile.key)?.signature === tile.signature) {
      plan.keep.push(tile.key);
      kept.add(tile.key);
    } else {
      waiting.push(tile);
    }
  }
  const spares = new Map<string, string[]>();
  for (const [key, { cell, signature }] of previous) {
    if (kept.has(key)) continue;
    const match = `${cell}|${signature}`;
    const same = spares.get(match);
    if (same) same.push(key);
    else spares.set(match, [key]);
  }
  for (const tile of waiting) {
    const spare = spares.get(`${tile.cell}|${tile.signature}`)?.pop();
    if (spare === undefined) plan.make.push(tile);
    else plan.move.push({ from: spare, to: tile.key });
  }
  for (const keys of spares.values()) plan.drop.push(...keys);
  return plan;
}
