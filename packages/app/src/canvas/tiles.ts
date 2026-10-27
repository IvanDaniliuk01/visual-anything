/**
 * Which tiles the canvas draws element shapes and relations in, and which tiles it can keep from the
 * last time.
 *
 * A shape goes in the tile of its band and of the cell its middle falls in, and of whether it is
 * dimmed: dimmed shapes are drawn faintly, in tiles of their own. Shapes in one band never overlap, so
 * the order of the tiles of a band, and of the shapes in one, is invisible, and a tile's signature
 * does not depend on it. Shapes in bands beyond the last are drawn in runs of consecutive shapes in
 * drawing order that share a cell and whether they are dimmed, above every band, and their order
 * counts.
 *
 * A relation is cut where its route passes from one cell to another, and each piece goes in the tile
 * of its cell, and of whether the relation is dimmed, so that a tile spans about its cell however far
 * its relations reach, and the tiles off screen can be left out of the frame. Its arrowhead goes with
 * the cell of its tip, and its name with the cell of its middle. A route that would cross more cells
 * than a bounded number is left whole, in one tile.
 */
import { levelsKey } from '@visual-anything/core';
import type { Id, LevelOfDetail } from '@visual-anything/schema';
import {
  boundsOf,
  centerOf,
  distance,
  grow,
  untilArrowhead,
  type Point,
  type Rect,
} from './geometry';
import type { IndexedScene } from './hit';
import { outlineSignature } from './outlined';
import { curvePieces } from './routing/curves';
import type { CurveSpan } from './routing/hand';
import type { ElementShape, RelationLine } from './scene';
import { imageSignature } from './shape-images';
import { rectAround } from './spatial';

/** How many bands have tiles of their own. */
export const MAX_BANDS = 32;
/** How many shapes beyond the bands one tile draws, at most. */
export const MAX_RUN = 64;
/** The size of a cell, in scene units. */
export const TILE = 1024;

export interface PlannedTile {
  /**
   * `shapes ${band} ${cell}`, with ` lod=${levels}` after it for shapes that declare levels of detail
   * and ` dim` when dimmed, or `shapes over ${first shape's key}` beyond the bands.
   */
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
  /**
   * The levels of detail every one of its shapes declares (ADR 0055): a tile holds only shapes that
   * declare the same, so that all of them change level at once. Absent: the canvas's own steps.
   */
  levels?: readonly LevelOfDetail[];
}

/**
 * The levels of detail a shape's tile goes by, as a short key: none for the canvas's own steps. Rows
 * go by their container's levels in tiles of their own, since rows write their texts at its contents
 * level.
 */
export function levelGroupOf(shape: ElementShape): string {
  if (shape.levels === undefined) return '';
  return `${shape.row === undefined ? '' : 'r'}${levelsKey(shape.levels)}`;
}

/** The part of a relation's route that lies in one cell. */
export interface RoutePiece {
  line: RelationLine;
  cell: string;
  /** Its points in the route's order: where it comes into the cell, its bends there, where it leaves. */
  points: Point[];
  /** How far along the route it starts, so that its dashes go on where the piece before left off. */
  travelled: number;
  /** Whether it starts or ends at a bend of the route, past which it reaches to fill the bend's corner. */
  bendAtStart: boolean;
  bendAtEnd: boolean;
  /** Whether it is the route's last piece, which ends at the base of the arrowhead when there is one. */
  last: boolean;
  /** On a curved line, the spans of the curve this piece draws; `points` holds them flattened. */
  curve?: CurveSpan[];
}

/** The relations a tile draws: the pieces of their routes in its cell, their arrowheads and names. */
export interface RelationTile {
  /** `relations ${cell}`, ` dim` after it when dimmed. */
  key: string;
  cell: string;
  /** Whether its relations are dimmed, drawn faintly. */
  dim: boolean;
  /** What the tile draws: equal signatures draw alike, dimmed or not. */
  signature: string;
  pieces: RoutePiece[];
  /** The relations whose arrowhead's tip lies in the cell. */
  ends: RelationLine[];
  /** The relations whose middle lies in the cell, where their names go. */
  lines: RelationLine[];
  /** Every relation it draws something of, in the order given. */
  touching: RelationLine[];
  /** Where what it draws lies, names included. */
  bounds: Rect;
}

/** The room a relation's name takes around the middle of its route, at most. */
const NAME_ROOM = { width: 240, height: 40 };

/** The points a relation's line is drawn through: its route, up to the base of its arrowhead. */
export function drawnRoute(line: RelationLine): Point[] {
  return untilArrowhead(line.route, line.arrowhead);
}

/**
 * The most sides of cells one segment, and a whole route, may cross and still be cut. Positions come
 * from project files and from Claude, so a route can reach a billion units away: beyond these, it is
 * left whole in one tile rather than cut into a piece for each cell, so that the work stays bounded
 * whatever the coordinates.
 */
export const MAX_SEGMENT_CROSSINGS = 256;
export const MAX_ROUTE_CROSSINGS = 1024;

const piecesOfLines = new WeakMap<RelationLine, RoutePiece[]>();

/**
 * A relation's drawn route, cut where it passes from one cell to another; left whole, in the cell of
 * its middle, when it crosses too many cells or its points are not all numbers.
 */
export function routePieces(line: RelationLine): RoutePiece[] {
  const known = piecesOfLines.get(line);
  if (known) return known;
  const route = drawnRoute(line);
  const pieces =
    curvePieces(line, cellOf) ??
    (crossesFew(route) ? cutAtCells(line, route) : [whole(line, route)]);
  piecesOfLines.set(line, pieces);
  return pieces;
}

/**
 * Whether a relation's pieces each lie in their cell, give or take a line's width, an arrowhead and
 * half a piece of a curve: false for a route left whole, which one tile draws however far it reaches.
 */
export function cutAtItsCells(line: RelationLine): boolean {
  return crossesFew(drawnRoute(line));
}

/** Whether a route crosses few enough sides of cells to be cut, worked out without visiting them. */
function crossesFew(route: readonly Point[]): boolean {
  let total = 0;
  for (let each = 1; each < route.length; each++) {
    const from = route[each - 1] as Point;
    const to = route[each] as Point;
    const crossed =
      Math.abs(Math.floor(to.x / TILE) - Math.floor(from.x / TILE)) +
      Math.abs(Math.floor(to.y / TILE) - Math.floor(from.y / TILE));
    // Written so that a coordinate that is not a finite number never counts as few.
    if (!(crossed <= MAX_SEGMENT_CROSSINGS)) return false;
    total += crossed;
  }
  return total <= MAX_ROUTE_CROSSINGS;
}

/** A route as one piece, in the cell of its line's middle. */
function whole(line: RelationLine, route: Point[]): RoutePiece {
  return {
    line,
    cell: cellOf(line.middle),
    points: route,
    travelled: 0,
    bendAtStart: false,
    bendAtEnd: false,
    last: true,
  };
}

/** A route that crosses few cells, cut where it passes from one to another. */
function cutAtCells(line: RelationLine, route: readonly Point[]): RoutePiece[] {
  const pieces: RoutePiece[] = [];
  let piece: RoutePiece | undefined;
  let travelled = 0;
  for (let each = 1; each < route.length; each++) {
    const from = route[each - 1] as Point;
    const to = route[each] as Point;
    const length = distance(from, to);
    if (length === 0) continue;
    const cuts = cutsAlong(from, to);
    for (let at = 1; at < cuts.length; at++) {
      const start = cuts[at - 1] as Cut;
      const end = cuts[at] as Cut;
      const cell = cellOf({
        x: (start.point.x + end.point.x) / 2,
        y: (start.point.y + end.point.y) / 2,
      });
      // A piece starts or ends at a bend where a segment of the route, other than the first, starts.
      const atBend = at === 1 && each > 1;
      if (piece && piece.cell === cell && piece.points.at(-1) === start.point) {
        piece.points.push(end.point);
        continue;
      }
      if (piece) piece.bendAtEnd = atBend && piece.points.at(-1) === start.point;
      piece = {
        line,
        cell,
        points: [start.point, end.point],
        travelled: travelled + start.t * length,
        bendAtStart: atBend,
        bendAtEnd: false,
        last: false,
      };
      pieces.push(piece);
    }
    travelled += length;
  }
  if (piece) piece.last = true;
  return pieces;
}

interface Cut {
  /** How far along the segment, from 0 at its start to 1 at its end. */
  t: number;
  point: Point;
}

/**
 * Where a segment starts, crosses the sides of cells and ends, in order. A crossing lies exactly on
 * the side it crosses, so that the pieces on either side of it lie in their cells.
 */
function cutsAlong(from: Point, to: Point): Cut[] {
  const cuts: Cut[] = [];
  for (const axis of ['x', 'y'] as const) {
    const a = from[axis];
    const b = to[axis];
    if (a === b) continue;
    const high = Math.max(a, b);
    for (let side = (Math.floor(Math.min(a, b) / TILE) + 1) * TILE; side < high; side += TILE) {
      const t = (side - a) / (b - a);
      const other = axis === 'x' ? 'y' : 'x';
      const across = from[other] + (to[other] - from[other]) * t;
      cuts.push({ t, point: axis === 'x' ? { x: side, y: across } : { x: across, y: side } });
    }
  }
  cuts.sort((one, two) => one.t - two.t);
  // A segment through the corner of a cell crosses two sides at once.
  const distinct = cuts.filter((cut, at) => at === 0 || cut.t - (cuts[at - 1] as Cut).t > 1e-12);
  return [{ t: 0, point: from }, ...distinct, { t: 1, point: to }];
}

/** The key of the tile of relations of a cell, dimmed or not. */
export function relationTileKey(cell: string, dim: boolean): string {
  return dim ? `relations ${cell} dim` : `relations ${cell}`;
}

/** The keys of the tiles a relation draws something in, dimmed or not. */
export function relationTileKeysOf(line: RelationLine, dim: boolean): Set<string> {
  const keys = new Set(routePieces(line).map((piece) => relationTileKey(piece.cell, dim)));
  if (line.arrowhead) keys.add(relationTileKey(cellOf(line.arrowhead.tip), dim));
  keys.add(relationTileKey(cellOf(line.middle), dim));
  return keys;
}

/**
 * The tiles that draw these relations, those in `hidden` left out and those in `dimmed` in tiles of
 * their own; with `only`, just the tiles with those keys, from the relations given.
 */
export function relationTiles(
  lines: readonly RelationLine[],
  hidden: ReadonlySet<Id>,
  dimmed: ReadonlySet<Id> = NONE,
  only?: ReadonlySet<string>,
): RelationTile[] {
  /** What one line draws in one cell: its pieces there, its arrowhead, its name, and where. */
  interface Drawn {
    pieces: RoutePiece[];
    end: boolean;
    named: boolean;
    around: Rect[];
  }
  const cells = new Map<string, { cell: string; dim: boolean; drawn: Map<RelationLine, Drawn> }>();
  const drawnAt = (cell: string, line: RelationLine): Drawn | undefined => {
    const dim = dimmed.has(line.relation);
    const key = relationTileKey(cell, dim);
    if (only && !only.has(key)) return undefined;
    let group = cells.get(key);
    if (!group) {
      group = { cell, dim, drawn: new Map() };
      cells.set(key, group);
    }
    let drawn = group.drawn.get(line);
    if (!drawn) {
      drawn = { pieces: [], end: false, named: false, around: [] };
      group.drawn.set(line, drawn);
    }
    return drawn;
  };
  for (const line of lines) {
    if (hidden.has(line.relation)) continue;
    for (const piece of routePieces(line)) {
      const drawn = drawnAt(piece.cell, line);
      drawn?.pieces.push(piece);
      drawn?.around.push(grow(rectAround(piece.points), line.width));
    }
    if (line.arrowhead) {
      const { tip, left, right } = line.arrowhead;
      const drawn = drawnAt(cellOf(tip), line);
      if (drawn) {
        drawn.end = true;
        drawn.around.push(rectAround([tip, left, right]));
      }
    }
    const named = drawnAt(cellOf(line.middle), line);
    if (named) {
      named.named = true;
      named.around.push({
        x: line.middle.x - NAME_ROOM.width / 2,
        y: line.middle.y - NAME_ROOM.height / 2,
        ...NAME_ROOM,
      });
    }
  }
  const tiles: RelationTile[] = [];
  for (const [base, { cell, dim, drawn }] of cells) {
    // A cell's relations, in the order given, a chunk of them to a tile.
    const touching = [...drawn.keys()];
    for (let first = 0; first < touching.length; first += MAX_TILE_LINES) {
      const chunk = touching.slice(first, first + MAX_TILE_LINES);
      const tile: RelationTile = {
        key: chunkKey(base, first / MAX_TILE_LINES),
        cell,
        dim,
        signature: chunk.map(lineSignature).join('|'),
        pieces: [],
        ends: [],
        lines: [],
        touching: chunk,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      };
      const around: Rect[] = [];
      for (const line of chunk) {
        const what = drawn.get(line) as Drawn;
        tile.pieces.push(...what.pieces);
        if (what.end) tile.ends.push(line);
        if (what.named) tile.lines.push(line);
        around.push(...what.around);
      }
      tile.bounds = boundsOf(around) as Rect;
      tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * The most shapes one tile in a band draws, and the most relations one tile of relations draws: a
 * cell that holds more is drawn in several tiles, so that no tile costs a frame more than these. A
 * cell of the benchmark's view holds at most 25 shapes and about 220 relations, which these leave in
 * one tile each, since every tile more is drawn on its own; the crowded views share theirs out.
 */
export const MAX_TILE_SHAPES = 64;
export const MAX_TILE_LINES = 256;

/** The key of the chunk `index` of the tiles of a cell: the cell's key for the first. */
export function chunkKey(base: string, index: number): string {
  return index === 0 ? base : `${base} #${index}`;
}

/** The key of the tile a chunk is a part of: its cell's, band's and dimming's. */
export function chunkBase(key: string): string {
  const at = key.indexOf(' #');
  return at === -1 ? key : key.slice(0, at);
}

const lineSignatures = new WeakMap<RelationLine, string>();

/** Everything about a relation that its drawing shows. */
export function lineSignature(line: RelationLine): string {
  let signature = lineSignatures.get(line);
  if (signature === undefined) {
    signature = [
      line.relation,
      line.label ?? '',
      line.stroke,
      line.darkStroke ?? '',
      line.width,
      line.dash,
      line.arrowhead ? 1 : 0,
      ...line.route.flatMap((point) => [point.x, point.y]),
    ].join(' ');
    lineSignatures.set(line, signature);
  }
  return signature;
}

/** What to do with the tiles drawn before to draw the planned ones. */
export interface TilePlan<P = PlannedTile> {
  /** Tiles drawn before that draw what they drew, under the same key. */
  keep: string[];
  /** Tiles drawn before that draw what a planned tile draws, under another key or band. */
  move: { from: string; to: string }[];
  /** Planned tiles that no tile drawn before draws. */
  make: P[];
  /** Tiles drawn before that no planned tile needs. */
  drop: string[];
}

const NONE: ReadonlySet<string> = new Set();

/** The cell a point falls in. */
export function cellOf(point: Point): string {
  return `${Math.floor(point.x / TILE)},${Math.floor(point.y / TILE)}`;
}

/** The key of the tile of a band and a cell, dimmed or not, for a group of levels of detail. */
export function bandTileKey(band: number, cell: string, dim: boolean, levels = ''): string {
  const group = levels === '' ? '' : ` lod=${levels}`;
  return dim ? `shapes ${band} ${cell}${group} dim` : `shapes ${band} ${cell}${group}`;
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
      shape.dark?.fill ?? '',
      shape.dark?.stroke ?? '',
      shape.name,
      shape.componentName,
      shape.detail ?? '',
      shape.holdsContents ? 1 : 0,
      shape.collapsed?.contents ?? -1,
      // Rows and the shapes that draw them (ADR 0023).
      shape.rowCount ?? -1,
      shape.row ?? -1,
      shape.fitted ? `${shape.fitted.name}\u0000${shape.fitted.detail}` : '',
      imageSignature(shape),
      // The relations that leave the view, which its mark counts (ADR-0040).
      shape.leaving?.length ?? 0,
      // Whether its mark says it has destinations (ADR 0056).
      shape.destinations ?? 0,
      // Its own outline and the part it is drawn as (ADR 0066, ADR 0067).
      outlineSignature(shape),
    ].join(' ');
    signatures.set(shape, signature);
  }
  return signature;
}

const shapeCells = new WeakMap<readonly ElementShape[], readonly string[]>();

/** The cell each shape goes in, by its index in `shapes`: worked out once for each list of shapes. */
export function cellsOfShapes(shapes: readonly ElementShape[]): readonly string[] {
  let cells = shapeCells.get(shapes);
  if (!cells) {
    cells = shapes.map((shape) => cellOf(centerOf(shape.rect)));
    shapeCells.set(shapes, cells);
  }
  return cells;
}

/**
 * The tiles that draw the scene's element shapes, those in `hidden` left out; with `cells`, only the
 * tiles of those cells, exactly as they are among all of them.
 */
export function plannedTiles(
  indexed: IndexedScene,
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string> = NONE,
  cells?: ReadonlySet<string>,
): PlannedTile[] {
  const { scene, drawing, bands } = indexed;
  const cellOfShape = cellsOfShapes(scene.shapes);
  const inBands = new Map<string, PlannedTile>();
  const beyond: PlannedTile[] = [];
  let run: PlannedTile | undefined;
  drawing.forEach((at, rank) => {
    const band = bands[at] as number;
    const cell = cellOfShape[at] as string;
    // Shapes in bands of other cells are passed by at once: shapes beyond the bands of other cells
    // still end the run before them, as they do among all the tiles.
    if (cells && band < MAX_BANDS && !cells.has(cell)) return;
    const shape = scene.shapes[at] as ElementShape;
    if (hidden.has(shape.key)) return;
    const dim = dimmed.has(shape.key);
    const group = levelGroupOf(shape);
    const levels = shape.levels === undefined ? {} : { levels: shape.levels };
    if (band < MAX_BANDS) {
      const key = bandTileKey(band, cell, dim, group);
      const tile = inBands.get(key);
      if (tile) tile.shapes.push(shape);
      else
        inBands.set(key, { key, band, cell, dim, signature: '', shapes: [shape], rank, ...levels });
      return;
    }
    const first = run?.shapes[0];
    if (
      run &&
      first &&
      run.cell === cell &&
      run.dim === dim &&
      levelGroupOf(first) === group &&
      run.shapes.length < MAX_RUN
    ) {
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
      ...levels,
    };
    beyond.push(run);
  });
  const planned = [
    ...[...inBands.values()].flatMap(chunksOf),
    ...(cells ? beyond.filter((tile) => cells.has(tile.cell)) : beyond),
  ];
  for (const tile of planned) tile.signature = tile.shapes.map(shapeSignature).join('|');
  return planned;
}

/**
 * A cell's tile in a band, its shapes in key order, as chunks of `MAX_TILE_SHAPES` of them: the
 * first keeps the cell's key, each other the key of its chunk. Shapes in one band never overlap, so
 * how they are shared out is invisible; only the tiles beyond the bands are ordered by their rank.
 */
function chunksOf(tile: PlannedTile): PlannedTile[] {
  tile.shapes.sort(byKey);
  if (tile.shapes.length <= MAX_TILE_SHAPES) return [tile];
  const chunks: PlannedTile[] = [];
  for (let first = 0; first < tile.shapes.length; first += MAX_TILE_SHAPES) {
    chunks.push({
      ...tile,
      key: chunkKey(tile.key, first / MAX_TILE_SHAPES),
      shapes: tile.shapes.slice(first, first + MAX_TILE_SHAPES),
    });
  }
  return chunks;
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
    levelGroupOf(shape),
  );
}

/** A tile in a band as drawn before: what it holds. */
export interface BandTile {
  key: string;
  band: number;
  cell: string;
  shapes: readonly ElementShape[];
  levels?: readonly LevelOfDetail[];
}

/**
 * The tiles in bands to plan again when some shapes changed, moved, or were hidden, shown, dimmed or
 * brightened: those the shapes left and those they now go in, each with the shapes it held that did
 * not change, and the changed ones that now go in it, shared out again in chunks. `before` holds
 * those tiles as drawn before, where they were, every chunk of a cell with the others; `changed`
 * holds the indexes of the shapes in the scene, all of them in bands before and now. With
 * `include`, changed shapes that now go in a cell it leaves out go in no tile.
 */
export function replannedTiles(
  indexed: IndexedScene,
  before: ReadonlyMap<string, BandTile>,
  changed: readonly number[],
  hidden: ReadonlySet<string>,
  dimmed: ReadonlySet<string>,
  include?: (cell: string) => boolean,
): PlannedTile[] {
  const { scene, bands, rankOf } = indexed;
  const leaving = new Set<string>();
  const arriving = new Map<string, ElementShape[]>();
  const places = new Map<
    string,
    { band: number; cell: string; dim: boolean; levels?: readonly LevelOfDetail[] }
  >();
  for (const at of changed) {
    const shape = scene.shapes[at] as ElementShape;
    leaving.add(shape.key);
    if (hidden.has(shape.key)) continue;
    const band = bands[at] as number;
    const cell = cellOf(centerOf(shape.rect));
    if (include && !include(cell)) continue;
    const dim = dimmed.has(shape.key);
    const key = bandTileKey(band, cell, dim, levelGroupOf(shape));
    places.set(key, {
      band,
      cell,
      dim,
      ...(shape.levels === undefined ? {} : { levels: shape.levels }),
    });
    const list = arriving.get(key);
    if (list) list.push(shape);
    else arriving.set(key, [shape]);
  }
  // A cell's chunks together: what they held that stays, and what arrives.
  const held = new Map<string, { shapes: ElementShape[]; was: BandTile }>();
  for (const [key, was] of before) {
    const base = chunkBase(key);
    const kept = was.shapes.filter((shape) => !leaving.has(shape.key));
    const group = held.get(base);
    if (group) group.shapes.push(...kept);
    else held.set(base, { shapes: kept, was });
  }
  const bases = new Set([...held.keys(), ...arriving.keys()]);
  const planned: PlannedTile[] = [];
  for (const base of bases) {
    const group = held.get(base);
    const shapes = [...(group?.shapes ?? []), ...(arriving.get(base) ?? [])];
    if (shapes.length === 0) continue;
    const levels = group?.was.levels;
    const place = places.get(base) ?? {
      band: group?.was.band ?? 0,
      cell: group?.was.cell ?? '',
      dim: base.endsWith(' dim'),
      ...(levels === undefined ? {} : { levels }),
    };
    let rank = Infinity;
    for (const shape of shapes) {
      const at = indexed.indexOfKey.get(shape.key);
      if (at !== undefined) rank = Math.min(rank, rankOf[at] as number);
    }
    const tile: PlannedTile = {
      key: base,
      ...place,
      signature: '',
      shapes,
      rank: rank === Infinity ? 0 : rank,
    };
    for (const chunk of chunksOf(tile)) {
      chunk.signature = chunk.shapes.map(shapeSignature).join('|');
      planned.push(chunk);
    }
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
export function planTiles<P extends { key: string; cell: string; signature: string }>(
  previous: ReadonlyMap<string, { cell: string; signature: string }>,
  planned: readonly P[],
): TilePlan<P> {
  const plan: TilePlan<P> = { keep: [], move: [], make: [], drop: [] };
  const kept = new Set<string>();
  const waiting: P[] = [];
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
