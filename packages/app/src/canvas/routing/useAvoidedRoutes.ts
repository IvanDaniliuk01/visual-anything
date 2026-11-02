/**
 * The canvas's routes around shapes (ADR 0039's clarification of 2026-10-26), kept incremental: each
 * line's route is routed in the routing worker once, kept for the line as the scene keeps it, and
 * routed again only when its ends move, which makes the scene a new line, or when a shape changes its
 * place, its size or its name plate in the region its route depends on. Until a route comes, a line
 * keeps its stand-in route, or the route it had while a change around it is routed again; the lines
 * nearest the middle of the screen come first. A change that touches no route, as a live value does,
 * leaves what is being routed to go on.
 *
 * Right after a layout, lines keep ELK's routes until what they pass moves (ADR 0080, `keptRoutes`),
 * and the lines routed keep apart from those and from each other. Once every route asked for has
 * come, the worker spreads the lines drawn into channels (`channels.ts`); a line whose route changes
 * after is drawn as routed until the next pass.
 */
import type { ResolvedDrawing } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useRef, useState } from 'react';
import { BASE_DRAWING } from '../drawing';
import type { Point, Rect } from '../geometry';
import { drawingOfScene, type ElementShape, type RelationLine, type Scene } from '../scene';
import { alongKeptRoute, withKeptRoutes, type KeptRoutes } from '../layout/keptRoutes';
import { CLEARANCE, type Avoided } from './avoid';
import {
  avoidBatchOf,
  channelBatchOf,
  existingLinesOf,
  namePlateOf,
  routedFlagsOf,
  routedLinesOf,
  withAvoidedRoutes,
  withChannelled,
  type Channelled,
} from './avoided';
import { AvoidRunnerContext, sharedAvoidRunner, type AvoidRunner } from './avoidRunner';

/** How often the canvas is told of routes that came, in milliseconds, after the first. */
export const TELL_EVERY = 120;

/** A line's route around shapes, and the box of its corridor, which changes are compared with. */
interface Known {
  avoided: Avoided;
  box: Rect;
}

/** The routes around shapes of the scenes of one canvas, and the requests for those they lack. */
export class RoutesAround {
  private readonly results = new WeakMap<RelationLine, Known>();
  /**
   * Each view's lines that lack a route and are not asked for: new ones, those a change made stale,
   * and those a request for another view stopped before they came.
   */
  private readonly lacking = new Map<Id, Set<RelationLine>>();
  /** Lines whose route a change around them may have made wrong: drawn as they were until routed again. */
  private readonly stale = new WeakSet<RelationLine>();
  /** Each view's last scene, which the next is compared with. */
  private readonly bases = new Map<Id, Scene>();
  /** The view asked for, its lines asked for and not answered yet, and what stops asking. */
  private asked: { view: Id; lines: Set<RelationLine>; stop: () => void } | undefined;
  private composed:
    | {
        base: Scene;
        version: number;
        kept: KeptRoutes | undefined;
        avoided: Scene;
        drawn: Scene;
        scene: Scene;
      }
    | undefined;
  private version = 0;
  /** Each view's routes from the last channel pass, by relation, and the scene it was asked for. */
  private readonly channelled = new Map<Id, { asked: Scene; routes: Channelled }>();
  /** The channel pass asked for: its view and scene, and what stops it. */
  private channelling: { view: Id; drawn: Scene; stop: () => void } | undefined;
  /** The scene the next channel pass is to be asked for, once routing settles. */
  private wanted: { view: Id; drawn: Scene; base: Scene; kept: KeptRoutes | undefined } | undefined;
  private channelVersion = 0;
  /** The lines whose routes came since the scene was last composed. */
  private came = new Set<RelationLine>();
  /** When the canvas was last told of new routes, and whether it is to be told again. */
  private told = -Infinity;
  private telling: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly runner: AvoidRunner | undefined,
    private readonly changed: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * The scene with the routes known so far for its lines. A change of the view's scene marks the
   * routes it may have made wrong.
   */
  compose(viewId: Id, scene: Scene, kept?: KeptRoutes): Scene {
    if (!this.runner) return withKeptRoutes(scene, kept);
    const before = this.bases.get(viewId);
    if (before !== scene) {
      this.bases.set(viewId, scene);
      if (before) this.invalidate(viewId, before, scene);
      this.findLacking(viewId, before, scene);
    }
    const last = this.composed;
    const version = this.version + this.channelVersion * 0x100000;
    if (last?.base === scene && last.version === version && last.kept === kept) return last.scene;
    let drawn: Scene;
    let avoidedNow = last?.avoided ?? scene;
    if (last?.base === scene && last.version % 0x100000 === this.version && last.kept === kept) {
      drawn = last.drawn;
    } else {
      const previous = last && {
        base: last.base,
        drawn: last.avoided.relations,
        changed: this.came,
      };
      const avoided = withAvoidedRoutes(
        scene,
        (line) => this.results.get(line)?.avoided.route,
        previous,
      );
      this.came = new Set();
      drawn = withKeptRoutes(avoided, kept);
      avoidedNow = avoided;
    }
    const channelled = this.channelled.get(viewId);
    const composed = channelled ? withChannelled(drawn, channelled.routes) : drawn;
    this.composed = { base: scene, version, kept, avoided: avoidedNow, drawn, scene: composed };
    // Once routing settles, the lines drawn are spread into channels.
    if (channelled?.asked !== drawn && this.channelling?.drawn !== drawn) {
      this.wanted = { view: viewId, drawn, base: scene, kept };
      if (!this.asked || this.asked.lines.size === 0) queueMicrotask(() => this.spread());
    }
    return composed;
  }

  /** Asks for the channel pass over the scene wanted, when no route is being asked for. */
  private spread(): void {
    const { runner } = this;
    const wanted = this.wanted;
    if (!runner?.channels || !wanted) return;
    if (this.asked && this.asked.lines.size > 0) return;
    this.wanted = undefined;
    const batch = channelBatchOf(wanted.drawn, wanted.base, (line) =>
      alongKeptRoute(wanted.kept, line),
    );
    if (!batch) {
      this.channelled.delete(wanted.view);
      return;
    }
    this.channelling?.stop();
    const asked: { view: Id; drawn: Scene; stop: () => void } = {
      view: wanted.view,
      drawn: wanted.drawn,
      stop: () => undefined,
    };
    asked.stop = runner.channels(batch.input, (output) => {
      if (this.channelling === asked) this.channelling = undefined;
      const routes = new Map<string, { from: readonly Point[]; to: Point[] }>();
      batch.lines.forEach((line, index) => {
        if (batch.input.movable[index] !== 1) return;
        const start = output.starts[index] as number;
        const end = output.starts[index + 1] as number;
        const to: Point[] = [];
        for (let at = start; at < end; at++) {
          to.push({ x: output.points[2 * at] as number, y: output.points[2 * at + 1] as number });
        }
        routes.set(line.relation, { from: line.route, to });
      });
      const before = this.channelled.get(wanted.view);
      this.channelled.set(wanted.view, { asked: wanted.drawn, routes });
      // The canvas is told only when the pass moved a line, or one it moved before.
      const moved = [...routes.values()].some(({ from, to }) => !sameRoute(from, to));
      if (!moved && !before) return;
      this.channelVersion += 1;
      this.tell();
    });
    this.channelling = asked;
  }

  /**
   * Asks for the routes the view's scene, as last composed, lacks, with those asked for before and
   * not answered yet, nearest `center` first; says whether it asked. While nothing is lacking but
   * what is asked for, what is being routed goes on.
   */
  request(viewId: Id, scene: Scene, center: Point | undefined): boolean {
    const { runner } = this;
    if (!runner) return false;
    const lacking = this.lacking.get(viewId);
    if (lacking === undefined || lacking.size === 0) return false;
    this.lacking.delete(viewId);
    const asked = this.asked;
    this.asked = undefined;
    if (asked) {
      asked.stop();
      // What another view was waiting for, it lacks again, for when it is shown again.
      if (asked.view === viewId) for (const line of asked.lines) lacking.add(line);
      else if (asked.lines.size > 0) this.lackingOf(asked.view, asked.lines);
    }
    const batch = avoidBatchOf(scene, lacking);
    if (batch.lines.length === 0) return false;
    // The lines drawn already, as last composed, which those routed now keep apart from.
    const drawn = this.composed?.base === scene ? this.composed.drawn : scene;
    const existing = existingLinesOf(
      drawn,
      scene,
      new Set(batch.drawn.map((line) => line.relation)),
    );
    this.ask(runner, viewId, batch, center, existing);
    return true;
  }

  private ask(
    runner: AvoidRunner,
    view: Id,
    batch: ReturnType<typeof avoidBatchOf>,
    center: Point | undefined,
    existing: ReturnType<typeof existingLinesOf>,
  ): void {
    const asked: { view: Id; lines: Set<RelationLine>; stop: () => void } = {
      view,
      lines: new Set(batch.drawn),
      stop: () => undefined,
    };
    asked.stop = runner.route(
      batch.shapes,
      batch.lines,
      center,
      (results) => {
        for (const { line, avoided } of results) {
          const drawn = batch.drawn[line];
          if (!drawn) continue;
          this.results.set(drawn, { avoided, box: corridorBox(avoided.route ?? flatOf(drawn)) });
          this.stale.delete(drawn);
          asked.lines.delete(drawn);
          this.came.add(drawn);
        }
        this.version += 1;
        this.tell();
      },
      existing,
    );
    this.asked = asked;
  }

  /** Notes lines a view lacks routes for. */
  private lackingOf(view: Id, lines: Iterable<RelationLine>): void {
    let lacking = this.lacking.get(view);
    if (!lacking) {
      lacking = new Set();
      this.lacking.set(view, lacking);
    }
    for (const line of lines) lacking.add(line);
  }

  /**
   * Notes the routed lines of a scene that lack a route: those that are new since the view's last
   * scene, at the place they hold; and every one, for the view's first.
   */
  private findLacking(view: Id, before: Scene | undefined, scene: Scene): void {
    const flags = routedFlagsOf(scene);
    const { relations } = scene;
    const was = before?.relations;
    const found: RelationLine[] = [];
    for (let at = 0; at < relations.length; at++) {
      if (flags[at] !== 1) continue;
      const line = relations[at] as RelationLine;
      if (was !== undefined && was[at] === line) continue;
      if (!this.results.has(line)) found.push(line);
    }
    if (found.length > 0) this.lackingOf(view, found);
  }

  /** Stops what is being routed. */
  dispose(): void {
    this.asked?.stop();
    this.asked = undefined;
    this.channelling?.stop();
    this.channelling = undefined;
    this.wanted = undefined;
    clearTimeout(this.telling);
    this.telling = undefined;
  }

  /**
   * Tells the canvas of new routes: at once the first time, and then at most every `TELL_EVERY`
   * milliseconds, so that a large view's routes come in a few redrawings rather than one a chunk.
   */
  private tell(): void {
    if (this.telling !== undefined) return;
    const wait = this.told + TELL_EVERY - this.now();
    const now = () => {
      this.telling = undefined;
      this.told = this.now();
      this.changed();
    };
    if (wait <= 0) now();
    else this.telling = setTimeout(now, wait);
  }

  /**
   * Marks the routes a shape that changed may have made wrong: those it now stands across, or stood
   * beside, as their corridor says. A shape that holds an end counts by its name plate alone, and
   * one inside an end not at all; a line that gave up stays as it is.
   */
  private invalidate(view: Id, before: Scene, after: Scene): void {
    const changes = shapeChanges(before.shapes, after.shapes, drawingOfScene(after));
    if (changes.length === 0) return;
    const stale: RelationLine[] = [];
    for (const line of routedLinesOf(after)) {
      const known = this.results.get(line);
      if (!known || known.avoided.gaveUp) continue;
      for (const change of changes) {
        if (!meets(known.box, change.box)) continue;
        if (!touches(change, line, known.avoided.route ?? flatOf(line))) continue;
        if (!this.stale.has(line)) {
          this.stale.add(line);
          stale.push(line);
        }
        break;
      }
    }
    if (stale.length > 0) this.lackingOf(view, stale);
  }
}

/** A shape that stands otherwise than it did: where it was and is, and its name plates then and now. */
export interface ShapeChange {
  key: string;
  rects: Rect[];
  plates: Rect[];
  /** The rectangle holding all of them. */
  box: Rect;
}

/** How far beside a route a shape counts as shaping it: a shape it goes around, a clearance away. */
const CORRIDOR = CLEARANCE * 1.5;

/** Whether a change may make a line's route wrong: see `RoutesAround.invalidate`. */
function touches(change: ShapeChange, line: RelationLine, route: Float64Array): boolean {
  const ends = line.ends;
  if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') return false;
  const { from, to } = { from: ends.from.key, to: ends.to.key };
  if (from === change.key || to === change.key) return false;
  // Inside an end: what an end holds never stands in its way.
  if (within(change.key, from) || within(change.key, to)) return false;
  // Holding an end: only its name plate stands in the way of what leaves it.
  const rects = within(from, change.key) || within(to, change.key) ? change.plates : change.rects;
  return rects.some((rect) => corridorMeets(route, rect));
}

/** Whether the shape with key `inner` sits inside the one with key `outer`, at any depth. */
function within(inner: string, outer: string): boolean {
  return (
    inner.length > outer.length && inner.charCodeAt(outer.length) === 47 && inner.startsWith(outer)
  );
}

const boxes = new WeakMap<Float64Array, Rect>();

/** The rectangle holding a route's corridor. */
function corridorBox(route: Float64Array): Rect {
  let box = boxes.get(route);
  if (!box) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let at = 0; at + 1 < route.length; at += 2) {
      left = Math.min(left, route[at] as number);
      right = Math.max(right, route[at] as number);
      top = Math.min(top, route[at + 1] as number);
      bottom = Math.max(bottom, route[at + 1] as number);
    }
    box = {
      x: left - CORRIDOR,
      y: top - CORRIDOR,
      width: right - left + 2 * CORRIDOR,
      height: bottom - top + 2 * CORRIDOR,
    };
    boxes.set(route, box);
  }
  return box;
}

function sameRoute(a: readonly Point[], b: readonly Point[]): boolean {
  return (
    a.length === b.length &&
    a.every((point, at) => point.x === (b[at] as Point).x && point.y === (b[at] as Point).y)
  );
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function meets(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const flats = new WeakMap<RelationLine, Float64Array>();

function flatOf(line: RelationLine): Float64Array {
  let flat = flats.get(line);
  if (!flat) {
    flat = Float64Array.from(line.route.flatMap(({ x, y }) => [x, y]));
    flats.set(line, flat);
  }
  return flat;
}

/** Whether `rect` comes within the corridor of a route: a segment grown by `CORRIDOR` each way. */
function corridorMeets(route: Float64Array, rect: Rect): boolean {
  for (let at = 2; at + 1 < route.length; at += 2) {
    const x0 = Math.min(route[at - 2] as number, route[at] as number) - CORRIDOR;
    const x1 = Math.max(route[at - 2] as number, route[at] as number) + CORRIDOR;
    const y0 = Math.min(route[at - 1] as number, route[at + 1] as number) - CORRIDOR;
    const y1 = Math.max(route[at - 1] as number, route[at + 1] as number) + CORRIDOR;
    if (rect.x < x1 && rect.x + rect.width > x0 && rect.y < y1 && rect.y + rect.height > y0) {
      return true;
    }
  }
  return false;
}

/** Whether a shape stands where it did as routes go around it: its place, size and name plate. */
function sameGeometry(was: ElementShape, now: ElementShape): boolean {
  if (was === now) return true;
  const rect = (shape: ElementShape) => shape.plate ?? shape.rect;
  const a = rect(was);
  const b = rect(now);
  if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) return false;
  if (!was.holdsContents && !now.holdsContents) return true;
  // A container's name plate is its name and detail.
  return (
    was.holdsContents === now.holdsContents &&
    was.name === now.name &&
    (was.detail ?? was.componentName) === (now.detail ?? now.componentName) &&
    was.image === now.image
  );
}

/**
 * The shapes that stand otherwise between two lists: moved, resized, with another name plate, added
 * or taken away, each with where it was and is. None for the same list, nor for shapes that changed
 * only what routes do not go around, as a detail or a color. Name plates are measured in `drawing`,
 * the one the shapes after are drawn with.
 */
export function shapeChanges(
  before: readonly ElementShape[],
  after: readonly ElementShape[],
  drawing: ResolvedDrawing = BASE_DRAWING,
): ShapeChange[] {
  if (before === after) return [];
  const changes: ShapeChange[] = [];
  if (before.length === after.length) {
    let same = true;
    for (let at = 0; at < after.length && same; at++) {
      const was = before[at] as ElementShape;
      const now = after[at] as ElementShape;
      if (was.key !== now.key) same = false;
      else if (!sameGeometry(was, now)) changes.push(changeOf(now.key, [was, now], drawing));
    }
    if (same) return changes;
  }
  const was = new Map(before.map((shape) => [shape.key, shape]));
  const keys = new Set<string>();
  const found: ShapeChange[] = [];
  for (const shape of after) {
    keys.add(shape.key);
    const old = was.get(shape.key);
    if (old && sameGeometry(old, shape)) continue;
    found.push(changeOf(shape.key, old ? [old, shape] : [shape], drawing));
  }
  for (const shape of before) {
    if (!keys.has(shape.key)) found.push(changeOf(shape.key, [shape], drawing));
  }
  return found;
}

function changeOf(key: string, shapes: ElementShape[], drawing: ResolvedDrawing): ShapeChange {
  const rects = shapes.map((shape) => shape.plate ?? shape.rect);
  let plates = shapes.flatMap((shape) => namePlateOf(shape, drawing) ?? []);
  // A container that grew or shrank around a plate that stayed changes nothing for what it holds.
  const [was, now] = plates;
  if (plates.length === 2 && was && now && sameRect(was, now)) plates = [];
  const all = [...rects, ...plates];
  const left = Math.min(...all.map((rect) => rect.x));
  const top = Math.min(...all.map((rect) => rect.y));
  const right = Math.max(...all.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...all.map((rect) => rect.y + rect.height));
  return {
    key,
    rects,
    plates,
    box: { x: left, y: top, width: right - left, height: bottom - top },
  };
}

/**
 * A scene of the open view with its automatic lines routed around the shapes in their way, as far
 * as the routing worker has routed them; the scene itself where there is no worker, and nothing for
 * no scene, as while a layout's move is drawn. `center` says where the middle of the canvas is in
 * the scene, so that the lines there come first.
 */
export function useAvoidedRoutes(
  scene: Scene | undefined,
  viewId: Id,
  center: () => Point | undefined,
  kept?: KeptRoutes,
): Scene | undefined {
  const given = useContext(AvoidRunnerContext);
  const [, setVersion] = useState(0);
  const [routes] = useState(
    () =>
      new RoutesAround(given === null ? sharedAvoidRunner() : given, () =>
        setVersion((version) => version + 1),
      ),
  );
  const composed = scene ? routes.compose(viewId, scene, kept) : undefined;
  const centerRef = useRef(center);
  useEffect(() => {
    centerRef.current = center;
  });
  useEffect(() => {
    if (scene) routes.request(viewId, scene, centerRef.current());
  }, [routes, viewId, scene]);
  useEffect(() => () => routes.dispose(), [routes]);
  return composed;
}
