/**
 * Which tiles the canvas draws element shapes in, and which tiles it can keep from the last time.
 *
 * A shape goes in the tile of its band and of the cell its middle falls in. Shapes in one band never
 * overlap, so the order of the tiles of a band, and of the shapes in one, is invisible, and a tile's
 * signature does not depend on it. Shapes in bands beyond the last are drawn in runs of consecutive
 * shapes in drawing order that share a cell, above every band, and their order counts.
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
  /** `shapes ${band} ${cell}`, or `shapes over ${first shape's key}` beyond the bands. */
  key: string;
  /** 0 to MAX_BANDS - 1, or MAX_BANDS beyond them. */
  band: number;
  cell: string;
  /** What the tile draws: equal signatures draw alike. */
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

/** The cell a point falls in. */
export function cellOf(point: Point): string {
  return `${Math.floor(point.x / TILE)},${Math.floor(point.y / TILE)}`;
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
    ].join(' ');
    signatures.set(shape, signature);
  }
  return signature;
}

/** The tiles that draw the scene's element shapes, those in `hidden` left out. */
export function plannedTiles(indexed: IndexedScene, hidden: ReadonlySet<string>): PlannedTile[] {
  const { scene, drawing, bands } = indexed;
  const inBands = new Map<string, PlannedTile>();
  const beyond: PlannedTile[] = [];
  let run: PlannedTile | undefined;
  drawing.forEach((at, rank) => {
    const shape = scene.shapes[at] as ElementShape;
    if (hidden.has(shape.key)) return;
    const band = bands[at] as number;
    const cell = cellOf(centerOf(shape.rect));
    if (band < MAX_BANDS) {
      const key = `shapes ${band} ${cell}`;
      const tile = inBands.get(key);
      if (tile) tile.shapes.push(shape);
      else inBands.set(key, { key, band, cell, signature: '', shapes: [shape], rank });
      return;
    }
    if (run && run.cell === cell && run.shapes.length < MAX_RUN) {
      run.shapes.push(shape);
      return;
    }
    run = {
      key: `shapes over ${shape.key}`,
      band: MAX_BANDS,
      cell,
      signature: '',
      shapes: [shape],
      rank,
    };
    beyond.push(run);
  });
  for (const tile of inBands.values()) {
    tile.shapes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  const planned = [...inBands.values(), ...beyond];
  for (const tile of planned) tile.signature = tile.shapes.map(shapeSignature).join('|');
  return planned;
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
