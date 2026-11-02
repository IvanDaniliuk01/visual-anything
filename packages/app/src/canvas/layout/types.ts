/**
 * What the layout worker is given and what it gives back. The input is taken from the scene the canvas
 * draws, so that layout works with exactly the sizes and the containment the canvas shows; the result
 * is where the shapes layout may move go, relative to their containers, which the app stores with
 * `set-positions`, unpinned (ADR-0009, ADR-0015).
 */
import type { Id } from '@visual-anything/schema';
import type { Point, Rect, Size } from '../geometry';

/** A named place on the border of a shape where relations attach, as an appearance sets it. */
export interface LayoutConnectionPoint {
  name: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  /** Where it sits along its side, from 0 at the side's left or top end to 1 at the other. */
  at: number;
}

/** One anchored shape of the view. */
export interface LayoutShape {
  /** The shape's key in the scene. */
  key: string;
  element: Id;
  /** The index of the shape it sits in; -1 when it sits directly in World. */
  parent: number;
  /** Whether layout may move it: otherwise layout keeps it where it is, as it keeps pinned shapes. */
  free: boolean;
  /**
   * On a shape layout keeps that has a stored position and is not pinned: layout may move it aside,
   * right or down, so that a container beside it that grows with what layout placed in it covers
   * nothing. A pinned shape never moves.
   */
  aside?: true;
  /**
   * Where it sits now, relative to its container's shape, or to the canvas when directly in World:
   * the box layout spaces it by, `tagLeft` left of its rectangle for a shape with a name tag.
   */
  x: number;
  y: number;
  /** Its size now, as layout spaces it: with the room its name tag takes beside and under it. */
  width: number;
  height: number;
  /**
   * On a shape that writes its name in a name tag (ADR 0066's clarification of 2026-10-27): how far
   * the box layout spaces it by reaches left of its rectangle, a multiple of `LAYOUT_STEP`, which
   * layout adds back to where it puts the box, so that the shape lands on the step.
   */
  tagLeft?: number;
  /** The size the view stores for it, which a shape that holds contents grows beyond to hold them. */
  storedWidth?: number;
  storedHeight?: number;
  /**
   * On a container that is expanding (ADR 0080, section 4): the size it was drawn at while collapsed.
   * The shapes beside it move aside from that size to the one it takes around its contents, and it
   * may grow toward the free room in its container.
   */
  grewFrom?: Size;
  /** For a shape that holds contents: the size its appearance gives it, before it grows to hold them. */
  baseWidth?: number;
  baseHeight?: number;
  /** Where relations attach to it; absent when they attach anywhere on its border. */
  points?: readonly LayoutConnectionPoint[];
  /**
   * On a row (ADR 0023): the middle of its row, from the top of the shape that draws it, where the
   * relations that end on it attach beside that shape. A row never moves.
   */
  rowAt?: number;
  /** On a shape that draws its contents as rows: the middle of its header, where its own relations attach. */
  headerAt?: number;
  /**
   * On an anchored part (ADR 0067): its inner point, from the top left of its drawing with parts,
   * where the relations that end on it attach on the drawing's side nearest it. Its place is its
   * part's, so it never moves.
   */
  partAt?: { x: number; y: number };
  /**
   * On a drawing with parts (ADR 0067): where its picture ends, from its top. Its contents that are
   * not anchored parts are arranged below it.
   */
  pictureBottom?: number;
  /**
   * On a container whose face gives it a header taller than the canvas's own (ADR 0083): how tall,
   * from its top. Its contents are laid out under it.
   */
  header?: number;
}

/** Where a relation's end is fixed on its shape's border, chosen by hand in the view (ADR 0039). */
export interface LayoutPort {
  side: LayoutConnectionPoint['side'];
  at: number;
}

/** A drawn relation between two shapes, by their indexes. */
export interface LayoutRelation {
  relation: Id;
  from: number;
  to: number;
  /** Where the view routes its ends by hand: ELK takes them as fixed ports. */
  fromPort?: LayoutPort;
  toPort?: LayoutPort;
}

/** Everything one layout works from. */
export interface LayoutInput {
  /** Containers before their contents, as the scene lists them. */
  shapes: LayoutShape[];
  relations: LayoutRelation[];
  /** What else sits directly in World and must not be covered: notes and arrows. */
  obstacles: Rect[];
  /**
   * Present when layout arranges the view, or a container's contents, in one ELK run while they fit
   * `WHOLE_SHAPES` and `WHOLE_RELATIONS` (ADR 0080, section 1); absent, as for new shapes, it
   * arranges each container on its own.
   */
  onePass?: true;
  /**
   * The room containers leave around their contents, the drawing defaults' `containers.padding`
   * (ADR 0086); absent, `CONTENTS_ORIGIN`'s.
   */
  padding?: number;
}

/** Where one shape that layout moved goes. */
export interface LaidOutShape {
  /** The key of the shape it was laid out as; every copy of its container shares the position. */
  key: string;
  element: Id;
  /** The container its shape sits in; absent directly in World. */
  container?: Id;
  /** Relative to its container's shape, or to the canvas; multiples of `LAYOUT_STEP`. */
  x: number;
  y: number;
  /** Present on a shape layout kept but moved aside, to make room for a container that grew. */
  aside?: true;
}

/**
 * The route ELK gave a relation's line in one pass over the view, relative to World and carried by
 * the rounding of its ends' places (ADR 0080, section 2): drawn until a shape it passes, or one of
 * its ends, moves, and never stored.
 */
export interface LaidOutRoute {
  /** The line's relation, or its key for an aggregated relation, as `LayoutRelation.relation`. */
  relation: Id;
  points: Point[];
}

/** What one layout gives back. */
export interface LayoutResult {
  shapes: LaidOutShape[];
  /** The routes ELK gave, when it arranged the view in one pass. */
  routes?: LaidOutRoute[];
  stats: LayoutStats;
}

/** What one layout cost, for the timing checks. */
export interface LayoutStats {
  /** How many containers, World included, had their contents arranged. */
  levels: number;
  /** How many shapes were arranged. */
  shapes: number;
  /** How many relations ELK was given, after lifting them to the level where they meet. */
  relations: number;
  /**
   * How many relations, lifted, ELK was not given, at levels with more than `ELK_WORK_BUDGET`
   * allows: there, the pairs of shapes related by the most relations are kept.
   */
  leftOut: number;
  /** How many containers, World included, were packed in rows because ELK's time ran out. */
  packedForTime: number;
  /** How many times ELK ran, and for how long in all. */
  elkRuns: number;
  elkMs: number;
  /** How long the whole layout took in the worker. */
  totalMs: number;
  /** Present when ELK arranged the view in one pass (ADR 0080, section 1). */
  onePass?: true;
}

/** How far a layout has come: how many of the containers it arranges, World included, are done. */
export interface LayoutProgress {
  done: number;
  total: number;
}

/**
 * How much ELK may be given at one level, counted as its shapes times its relations beyond one per
 * shape. ELK's time grows with that product: on the benchmark's laptop, World with 80 shapes took
 * 0.8 s with 80 relations and 19 s with 401, and with 400 shapes 2.4 s with 400 relations and 104 s
 * with 800. Within this budget a level takes about a second; beyond it, the pairs related by the
 * most relations are kept.
 */
export const ELK_WORK_BUDGET = 4000;

/**
 * How long ELK may run in all for one layout, in milliseconds. The containers whose arrangement is
 * not done by then are packed in rows, which takes milliseconds, so a layout ends within about this
 * long, besides copying its input and result.
 */
export const ELK_TIME_LIMIT = 20_000;

/** Positions are multiples of this, inside each container. */
export const LAYOUT_STEP = 8;
/** Between shapes side by side in one layer of a layout, and between rows of shapes packed in rows. */
export const NODE_GAP = 40;
/** Between the layers of a layout, which follow the direction of its relations. */
export const LAYER_GAP = 80;
/** Between the shapes layout keeps and arranged shapes placed below them. */
export const GAP_BELOW = 40;
/** Between the shapes layout keeps and arranged shapes placed beside them. */
export const GAP_BESIDE = 80;
