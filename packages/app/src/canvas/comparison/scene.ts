/**
 * One view of a comparison drawn (ADR 0070): the scene the canvas, the SVG writer and the PDF draw,
 * and the mark each shape, line and free shape takes in it.
 *
 * - **Before** draws the older version's view, marking what was removed, changed and moved.
 * - **After** draws the newer version's view, marking what was added, changed and moved.
 * - **Comparison** draws the newer version's view, with what was removed drawn at its older place,
 *   faintly and marked, and each moved shape's older place kept, for a dashed outline joined to the
 *   shape by a thin arrow.
 *
 * What is unchanged is drawn faintly, as the emphasis dims, unless the person turns that off; what
 * was removed is always faint, and a removed relation's line dashed. A collapsed container that hides
 * changes says how many, as an aggregated relation says how many relations it stands for.
 *
 * Pure: it reads the two versions, the view's states and the scenes the canvas builds, and changes
 * none of them, so that what draws it and what writes it agree.
 */
import {
  nestingTypesInView,
  type ProjectSnapshot,
  type ViewComparison,
  type ViewItemState,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { boundsOf, type Point, type Rect } from '../geometry';
import {
  buildScene,
  relationLinesOf,
  shownBy,
  standsFor,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
  type Scene,
} from '../scene';

/** Which of the three drawings of a view: the older version, the newer one, or both together. */
export type ComparisonDrawing = 'before' | 'after' | 'comparison';

export const COMPARISON_DRAWINGS: readonly ComparisonDrawing[] = ['before', 'after', 'comparison'];

/** The four marks of a comparison, one for each state but unchanged. */
export type ChangeMark = 'added' | 'removed' | 'changed' | 'moved';

export const CHANGE_MARKS: readonly ChangeMark[] = ['added', 'removed', 'changed', 'moved'];

/** Which marks each drawing draws: before cannot show what was added, nor after what was removed. */
export const MARKS_DRAWN: Readonly<Record<ComparisonDrawing, readonly ChangeMark[]>> = {
  before: ['removed', 'changed', 'moved'],
  after: ['added', 'changed', 'moved'],
  comparison: CHANGE_MARKS,
};

/** A shape, a line or a free shape drawn with a mark, which `]` and `[` go to. */
export interface MarkedTarget {
  kind: 'element' | 'relation' | 'free-shape';
  /** The element's, the relation's or the free shape's id; an aggregated line's first relation. */
  id: Id;
  /** The key the scene draws it by: the shape's key, the line's key or the free shape's id. */
  key: string;
  mark: ChangeMark;
  /** Where it is drawn, to order the targets and to bring each into view. */
  rect: Rect;
}

/** A moved shape's older place and where it is now, in the comparison drawing. */
export interface MovedPlace {
  /** The key the scene draws the shape by now. */
  key: string;
  /** Its older place: its rectangle, or for an arrow the box around its ends. */
  was: Rect;
  /** Where it is now, as `was`. */
  is: Rect;
  /** For an arrow: its ends at its older place, which the dashed outline follows. */
  line?: readonly [Point, Point];
}

/** One view of a comparison as one of its drawings shows it. */
export interface ComparisonScene {
  drawing: ComparisonDrawing;
  view: Id;
  /** What the canvas draws: one version's scene, and in the comparison what was removed with it. */
  scene: Scene;
  /** The mark of each element shape that has one, by its key. */
  shapes: ReadonlyMap<string, ChangeMark>;
  /** The mark of each line that has one, by its key: a relation's id, or an aggregated line's key. */
  lines: ReadonlyMap<string, ChangeMark>;
  /** The mark of each free shape that has one, by its id. */
  free: ReadonlyMap<Id, ChangeMark>;
  /** What is drawn faintly because it is unchanged, by the keys the emphasis names things by. */
  unchanged: ReadonlySet<string>;
  /** What is drawn at its older place because it was removed, by the same keys: always faint. */
  removed: ReadonlySet<string>;
  /** The keys of the lines of removed relations, which are drawn dashed. */
  dashed: ReadonlySet<string>;
  /** In the comparison drawing, each moved shape's older place. */
  moves: readonly MovedPlace[];
  /** How many changes each collapsed container hides, by its shape's key. */
  hidden: ReadonlyMap<string, number>;
  /** How many of the view's elements, relations and free shapes are in each state. */
  counts: Record<ChangeMark, number>;
  /** What is drawn marked, in reading order: top to bottom, then left to right. */
  targets: readonly MarkedTarget[];
}

/** What the canvas has built already, so that the comparison draws what it draws. */
export interface ComparisonSceneOptions {
  /** The collapsed containers the canvas shows expanded as it zooms into them (ADR 0055). */
  expanded?: ReadonlySet<Id>;
  /** The scenes of the view in each version, when the caller has them already. */
  older?: Scene;
  newer?: Scene;
}

const EMPTY_SCENE: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };

/**
 * The scene of a view of a comparison in one of its three drawings, with what each shape, line and
 * free shape it draws did, from the view's states (`compareView`). A version without the view draws
 * nothing of it.
 */
export function comparisonScene(
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  view: Id,
  viewComparison: ViewComparison,
  drawing: ComparisonDrawing,
  options: ComparisonSceneOptions = {},
): ComparisonScene {
  const sceneOf = (project: ProjectSnapshot, given: Scene | undefined): Scene =>
    given ??
    (project.views.some((each) => each.id === view)
      ? buildScene(project, view, options.expanded)
      : EMPTY_SCENE);
  const states = withoutContainment(viewComparison.states, [older, newer], view);
  const counts = countsOf(states);
  const olderScene = drawing === 'after' ? EMPTY_SCENE : sceneOf(older, options.older);
  const newerScene = drawing === 'before' ? EMPTY_SCENE : sceneOf(newer, options.newer);
  const base = drawing === 'before' ? olderScene : newerScene;
  const marking = new Marking(states, MARKS_DRAWN[drawing]);
  marking.markScene(base, false);
  if (drawing === 'comparison') {
    const ghosts = ghostsOf(olderScene, states, base);
    const scene = withGhosts(base, ghosts);
    marking.markGhosts(ghosts);
    marking.countHidden(base, newer, scene);
    marking.countHidden(olderScene, older, scene);
    return marking.finish(drawing, view, scene, movesOf(olderScene, base, states), counts);
  }
  marking.countHidden(base, drawing === 'before' ? older : newer, base);
  return marking.finish(drawing, view, base, [], counts);
}

/** The mark of a state, if it has one. */
export function markOf(state: ViewItemState | undefined): ChangeMark | undefined {
  return state === undefined || state.status === 'unchanged' ? undefined : state.status;
}

/**
 * The states of what a view draws as shapes and lines: without the relations that nest in it, in
 * either version, which it draws as containment, and which go with the element they place.
 */
function withoutContainment(
  states: ReadonlyMap<string, ViewItemState>,
  versions: readonly ProjectSnapshot[],
  view: Id,
): ReadonlyMap<string, ViewItemState> {
  const nesting = new Set<string>();
  for (const version of versions) {
    const file = version.views.find((each) => each.id === view);
    if (!file) continue;
    const types = new Set(nestingTypesInView(version, file));
    if (types.size === 0) continue;
    for (const relation of version.model.relations) {
      if (types.has(relation.relationType)) nesting.add(`relation:${relation.id}`);
    }
  }
  if (nesting.size === 0) return states;
  return new Map([...states].filter(([key]) => !nesting.has(key)));
}

/** How many of a view's elements, relations and free shapes are in each state; changed comes first. */
export function countsOf(states: ReadonlyMap<string, ViewItemState>): Record<ChangeMark, number> {
  const counts: Record<ChangeMark, number> = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const state of states.values()) {
    const mark = markOf(state);
    if (mark !== undefined) counts[mark] += 1;
  }
  return counts;
}

/**
 * The mark of a line: that of its relation; for an aggregated line, the one mark the relations it
 * stands for share among those that have one, or changed when they differ.
 */
export function lineMarkOf(
  line: RelationLine,
  states: ReadonlyMap<string, ViewItemState>,
): ChangeMark | undefined {
  let found: ChangeMark | undefined;
  for (const relation of standsFor(line)) {
    const mark = markOf(states.get(`relation:${relation}`));
    if (mark === undefined) continue;
    if (found !== undefined && found !== mark) return 'changed';
    found = mark;
  }
  return found;
}

/** What one drawing marks, gathered as its shapes, lines and free shapes are read. */
class Marking {
  readonly shapes = new Map<string, ChangeMark>();
  readonly lines = new Map<string, ChangeMark>();
  readonly free = new Map<Id, ChangeMark>();
  readonly unchanged = new Set<string>();
  readonly removed = new Set<string>();
  readonly dashed = new Set<string>();
  readonly hidden = new Map<string, number>();
  readonly targets: MarkedTarget[] = [];
  /** What the hidden counts counted already, so that the two versions never count one thing twice. */
  private readonly counted = new Set<string>();

  constructor(
    private readonly states: ReadonlyMap<string, ViewItemState>,
    private readonly drawn: readonly ChangeMark[],
  ) {}

  /** The mark a drawing gives a state: none for one it cannot show. */
  private markFor(state: ViewItemState | undefined): ChangeMark | undefined {
    const mark = markOf(state);
    return mark !== undefined && this.drawn.includes(mark) ? mark : undefined;
  }

  markScene(scene: Scene, ghosts: boolean): void {
    for (const shape of scene.shapes) this.markShape(shape, ghosts);
    for (const line of scene.relations) this.markLine(line, ghosts);
    for (const note of scene.notes) this.markFree(note.id, note.rect, ghosts);
    for (const arrow of scene.arrows) this.markFree(arrow.id, arrowBox(arrow), ghosts);
  }

  markGhosts(ghosts: Ghosts): void {
    this.markScene(
      {
        shapes: ghosts.shapes,
        relations: ghosts.relations,
        notes: ghosts.notes,
        arrows: ghosts.arrows,
        bounds: undefined,
      },
      true,
    );
  }

  private markShape(shape: ElementShape, ghost: boolean): void {
    const mark = this.markFor(this.states.get(`element:${shape.element}`));
    this.place(shape.key, mark, ghost, 'element', shape.element, shape.rect, this.shapes);
  }

  private markLine(line: RelationLine, ghost: boolean): void {
    const mark = lineMarkOf(line, this.states);
    const drawnMark = mark !== undefined && this.drawn.includes(mark) ? mark : undefined;
    const first = standsFor(line)[0] ?? line.relation;
    const rect = boundsOf([], line.route) ?? { x: line.middle.x, y: line.middle.y, width: 0, height: 0 };
    this.place(line.relation, drawnMark, ghost, 'relation', first, rect, this.lines);
    if (drawnMark === 'removed') this.dashed.add(line.relation);
  }

  private markFree(id: Id, rect: Rect, ghost: boolean): void {
    const mark = this.markFor(this.states.get(`free-shape:${id}`));
    this.place(id, mark, ghost, 'free-shape', id, rect, this.free);
  }

  private place(
    key: string,
    mark: ChangeMark | undefined,
    ghost: boolean,
    kind: MarkedTarget['kind'],
    id: Id,
    rect: Rect,
    marks: Map<string, ChangeMark>,
  ): void {
    if (mark === undefined) {
      this.unchanged.add(key);
      return;
    }
    marks.set(key, mark);
    if (ghost) this.removed.add(key);
    this.targets.push({ kind, id, key, mark, rect });
  }

  /**
   * Counts on each collapsed container of `drawn` the marked elements and relations that `hiding`, a
   * scene of `project`, hides in a collapsed container with the same key: what neither draws of its
   * own. A relation hides where its `from` end does.
   */
  countHidden(hiding: Scene, project: ProjectSnapshot, drawn: Scene): void {
    if (!drawn.shapes.some((shape) => shape.collapsed !== undefined)) return;
    const drawnKeys = new Set(drawn.shapes.map((shape) => shape.key));
    const collapsedKeys = new Set(
      drawn.shapes.filter((shape) => shape.collapsed !== undefined).map((shape) => shape.key),
    );
    const own = new Set(hiding.shapes.map((shape) => shape.element));
    const lines = relationLinesOf(hiding);
    const count = (item: string, holder: ElementShape | undefined) => {
      if (holder === undefined || !collapsedKeys.has(holder.key) || !drawnKeys.has(holder.key)) {
        return;
      }
      if (this.counted.has(item)) return;
      this.counted.add(item);
      this.hidden.set(holder.key, (this.hidden.get(holder.key) ?? 0) + 1);
    };
    for (const [item, state] of this.states) {
      if (this.markFor(state) === undefined) continue;
      if (item.startsWith('element:')) {
        const element = item.slice('element:'.length);
        if (own.has(element)) continue;
        count(item, shownBy(hiding, element));
      } else if (item.startsWith('relation:')) {
        const relation = item.slice('relation:'.length);
        if (lines.has(relation)) continue;
        const from = startsOf(project).get(relation);
        if (from !== undefined) count(item, shownBy(hiding, from));
      }
    }
  }

  finish(
    drawing: ComparisonDrawing,
    view: Id,
    scene: Scene,
    moves: readonly MovedPlace[],
    counts: Record<ChangeMark, number>,
  ): ComparisonScene {
    const targets = this.targets.sort(
      (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || compareText(a.key, b.key),
    );
    return {
      drawing,
      view,
      scene,
      shapes: this.shapes,
      lines: this.lines,
      free: this.free,
      unchanged: this.unchanged,
      removed: this.removed,
      dashed: this.dashed,
      moves,
      hidden: this.hidden,
      counts,
      targets,
    };
  }
}

/** Where each relation of a model starts, by its id. */
const relationStarts = new WeakMap<readonly { id: Id; from: Id }[], ReadonlyMap<Id, Id>>();

function startsOf(project: ProjectSnapshot): ReadonlyMap<Id, Id> {
  const relations = project.model.relations;
  let starts = relationStarts.get(relations);
  if (!starts) {
    starts = new Map(relations.map((relation) => [relation.id, relation.from]));
    relationStarts.set(relations, starts);
  }
  return starts;
}

/** What the comparison drawing takes from the older version: what was removed, at its older place. */
interface Ghosts {
  shapes: ElementShape[];
  relations: RelationLine[];
  notes: NoteShape[];
  arrows: ArrowShape[];
}

function ghostsOf(
  older: Scene,
  states: ReadonlyMap<string, ViewItemState>,
  newer: Scene,
): Ghosts {
  const removed = (key: string) => markOf(states.get(key)) === 'removed';
  const kept = new Set<string>();
  const newerKeys = new Set(newer.shapes.map((shape) => shape.key));
  const order = older.drawing ?? older.shapes.map((_shape, at) => at);
  const shapes: ElementShape[] = [];
  for (const at of order) {
    const shape = older.shapes[at];
    if (!shape || !removed(`element:${shape.element}`) || newerKeys.has(shape.key)) continue;
    kept.add(shape.key);
    shapes.push(ghostShape(shape, kept));
  }
  const newerLines = new Set(newer.relations.map((line) => line.relation));
  const relations = older.relations
    .filter(
      (line) =>
        !newerLines.has(line.relation) &&
        standsFor(line).every((relation) => removed(`relation:${relation}`)),
    )
    .map(ghostLine);
  const notes = older.notes.filter((note) => removed(`free-shape:${note.id}`));
  const arrows = older.arrows.filter((arrow) => removed(`free-shape:${arrow.id}`));
  return { shapes, relations, notes, arrows };
}

/**
 * A removed shape drawn at its older place: inside its container when that is drawn removed too, and
 * otherwise on its own, as a shape directly in World, since what held it may be drawn elsewhere now.
 */
function ghostShape(shape: ElementShape, ghosts: ReadonlySet<string>): ElementShape {
  if (shape.containerShape !== undefined && ghosts.has(shape.containerShape)) return shape;
  const {
    container: _container,
    containerShape: _containerShape,
    row: _row,
    rowCount: _rowCount,
    ...alone
  } = shape;
  return { ...alone, offset: { x: shape.rect.x, y: shape.rect.y } };
}

/** A removed relation's line at its older route, drawn to no shape, since its ends may be gone. */
function ghostLine(line: RelationLine): RelationLine {
  const { ends: _ends, ...alone } = line;
  return alone;
}

/** The newer scene with what was removed drawn over it, faintly, at its older places. */
function withGhosts(scene: Scene, ghosts: Ghosts): Scene {
  if (
    ghosts.shapes.length === 0 &&
    ghosts.relations.length === 0 &&
    ghosts.notes.length === 0 &&
    ghosts.arrows.length === 0
  ) {
    return scene;
  }
  const order = scene.drawing ?? scene.shapes.map((_shape, at) => at);
  const shapes = [...scene.shapes, ...ghosts.shapes];
  const drawing = [...order, ...ghosts.shapes.map((_shape, at) => scene.shapes.length + at)];
  const notes = [...scene.notes, ...ghosts.notes];
  const arrows = [...scene.arrows, ...ghosts.arrows];
  const bounds = boundsOf(
    [
      ...(scene.bounds ? [scene.bounds] : []),
      ...ghosts.shapes.map((shape) => shape.extent),
      ...ghosts.notes.map((note) => note.rect),
      ...ghosts.arrows.map(arrowBox),
    ],
    ghosts.relations.flatMap((line) => line.route),
  );
  return { shapes, drawing, relations: [...scene.relations, ...ghosts.relations], notes, arrows, bounds };
}

/**
 * The older place of each moved shape the newer scene draws, and of each moved free shape: paired by
 * key, or else with the element's shapes in the older scene that no key pairs, in order. A shape
 * whose older place is where it is now, in whole canvas units, has none to show.
 */
function movesOf(
  older: Scene,
  newer: Scene,
  states: ReadonlyMap<string, ViewItemState>,
): MovedPlace[] {
  const moved = (key: string) => {
    const state = states.get(key);
    return state?.status === 'moved' || (state?.status === 'changed' && state.moved === true);
  };
  const olderByKey = new Map(older.shapes.map((shape) => [shape.key, shape]));
  const newerKeys = new Set(newer.shapes.map((shape) => shape.key));
  const unpaired = new Map<Id, ElementShape[]>();
  for (const shape of older.shapes) {
    if (newerKeys.has(shape.key) || !moved(`element:${shape.element}`)) continue;
    const list = unpaired.get(shape.element);
    if (list) list.push(shape);
    else unpaired.set(shape.element, [shape]);
  }
  const moves: MovedPlace[] = [];
  for (const shape of newer.shapes) {
    if (!moved(`element:${shape.element}`)) continue;
    const was = olderByKey.get(shape.key) ?? unpaired.get(shape.element)?.shift();
    if (was && !sameRect(was.rect, shape.rect)) {
      moves.push({ key: shape.key, was: was.rect, is: shape.rect });
    }
  }
  const olderNotes = new Map(older.notes.map((note) => [note.id, note]));
  for (const note of newer.notes) {
    const was = olderNotes.get(note.id);
    if (was && moved(`free-shape:${note.id}`) && !sameRect(was.rect, note.rect)) {
      moves.push({ key: note.id, was: was.rect, is: note.rect });
    }
  }
  const olderArrows = new Map(older.arrows.map((arrow) => [arrow.id, arrow]));
  for (const arrow of newer.arrows) {
    const was = olderArrows.get(arrow.id);
    if (!was || !moved(`free-shape:${arrow.id}`)) continue;
    if (samePoint(was.from, arrow.from) && samePoint(was.to, arrow.to)) continue;
    moves.push({ key: arrow.id, was: arrowBox(was), is: arrowBox(arrow), line: [was.from, was.to] });
  }
  return moves;
}

/** The box around an arrow's ends. */
export function arrowBox(arrow: { from: Point; to: Point }): Rect {
  const x = Math.min(arrow.from.x, arrow.to.x);
  const y = Math.min(arrow.from.y, arrow.to.y);
  return {
    x,
    y,
    width: Math.max(arrow.from.x, arrow.to.x) - x,
    height: Math.max(arrow.from.y, arrow.to.y) - y,
  };
}

/** Whether two rectangles are the same in whole canvas units, as a comparison reads places. */
function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

function samePoint(a: Point, b: Point): boolean {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
