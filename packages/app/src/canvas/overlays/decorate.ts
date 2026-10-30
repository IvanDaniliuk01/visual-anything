/**
 * What a view's overlays and its appearances' levels of detail make of the scene's shapes and lines
 * (ADR 0055), worked out after the shapes are placed and before relations are routed.
 *
 * - **Colors.** A fill or a stroke from an overlay is drawn as a stored color is, in both themes;
 *   beside a built-in fill, a stroke under 3:1 on the dark canvas keeps the fill's light value, as
 *   ADR 0033 says of stored strokes.
 * - **Opacity** fades a shape's colors toward what it is drawn on, its container's fill or the canvas,
 *   in each theme, rather than drawing it translucent: the renderer draws it as any shape, a change of
 *   it is a recolor, and its name keeps the color that reads on its fill. A line fades toward the
 *   canvas.
 * - **Size** scales a shape around its middle, or a line's width. Only a shape that shows no contents
 *   and is neither a row nor a shape that draws rows takes it. The shape keeps the rectangle layout
 *   gave it as `laidOut`, which layout, drops and snapping read, so that an overlay never moves
 *   anything; what holds it grows its extent to hold it.
 * - **Badges** are written in the shape's detail, after its own, or after a line's name.
 * - **Levels** go on each shape as its appearance declares them; a row takes its container's, whose
 *   `contents` level says when rows write their texts.
 *
 * Each shape and line equal to one made before is that same object, so that what draws, indexes and
 * lists the scene tells what changed by identity; without overlays or levels it is the shape itself.
 *
 * The view's own scene reads attributes as stored. The canvas's reads them through the app's
 * attribute lookup (`values`, ADR 0057): live and computed values over stored ones. Its caches are
 * kept apart, and keyed by the values the overlays read, so that a live value changes a shape or a
 * line only when an overlay reads it and what it reads changed; a shape whose overlays read what is
 * stored is the view scene's own object.
 */
import {
  CANVAS_BACKGROUNDS,
  MINIMUM_MARK_CONTRAST,
  appearanceOf,
  attributeValue,
  contrastRatio,
  fadedColor,
  overlayApplies,
  overlayLookOf,
  overlayValue,
  overlaysApply,
  relationTypeOrRelatesTo,
  type Definitions,
  type OverlayLook,
} from '@visual-anything/core';
import type {
  Color,
  Element,
  Id,
  JsonValue,
  LevelOfDetail,
  Overlay,
  Relation,
} from '@visual-anything/schema';
import { ESSENCE_ID } from '@visual-anything/schema';
import type { Attributed } from '../../live-values/lookup';
import { fitHeader, fitRow } from '../fit';
import { arrowheadAt, bodyOf, type Point, type Rect } from '../geometry';
import { outlineIn } from '../outlines';
import type { ElementShape, RelationLine } from '../scene';
import { imageLookOf, placeImage, sameShapeImage } from '../shape-images';
import { runsWithPart } from '../../text/detail';

/** The rectangle layout gave a shape: the one an overlay of size leaves it, or its own. */
export function laidOutRect(shape: { rect: Rect; laidOut?: Rect }): Rect {
  return shape.laidOut ?? shape.rect;
}

/**
 * How overlays read attributes when not as stored: the app's attribute lookup (ADR 0057), live
 * values over computed ones over stored ones.
 */
export interface OverlayValues {
  /** Whether a target has values from outside the model; when not, overlays read what is stored. */
  overrides(target: Id): boolean;
  /** A target's live values now: the same object while they do not change. */
  liveOf(target: Id): unknown;
  /** What package code answered for a target now: the same object while it does not change. */
  answersOf(target: Id): unknown;
  /** How an attribute of an element or a relation reads. */
  value(item: Attributed, name: string, definitions: Definitions): JsonValue | undefined;
}

/** What the pass reads besides the shapes: the view's overlays, the definitions and the model. */
export interface DecorationInputs {
  overlays: readonly Overlay[] | undefined;
  definitions: Definitions;
  elements: ReadonlyMap<Id, Element>;
  /** Every element, to tell whether any declares levels of its own. */
  allElements: readonly Element[];
  /** How overlays read attributes; absent, as stored. */
  values?: OverlayValues | undefined;
}

/** The shapes after the pass, and which of them it moved or grew, by their indexes. */
export interface DecoratedShapes {
  shapes: ElementShape[];
  /** The shapes as decorated, before what holds a sized shape grows: `shapes` itself while none is. */
  pre: ElementShape[];
  /** Whether an overlay sizes some shape. */
  sized: boolean;
  /** The shapes whose rectangle the pass gives differs from the one `before` gave, at one index. */
  moved: number[];
  /** Whether some extent differs from the one `before` gave. */
  extentChanged: boolean;
}

/** What the pass does: whether overlays set something on elements, and whether it decorates at all. */
export function passOf(inputs: DecorationInputs): { overlaid: boolean; decorates: boolean } {
  const overlaid = overlaysApply(inputs.overlays, 'elements');
  return {
    overlaid,
    decorates: overlaid || declaresLevels(inputs.definitions, inputs.allElements),
  };
}

const holderLists = new WeakMap<readonly ElementShape[], Int32Array>();

/**
 * The index of the shape each shape sits in, -1 for none, by the keys: worked out once for a list of
 * shapes, and the same for any list with the same keys at the same indexes.
 */
export function holdersOf(shapes: readonly ElementShape[]): Int32Array {
  let holders = holderLists.get(shapes);
  if (holders === undefined) {
    holders = new Int32Array(shapes.length);
    const byKey = new Map<string, number>();
    shapes.forEach((shape, at) => {
      byKey.set(shape.key, at);
      const holderAt =
        shape.containerShape === undefined ? undefined : byKey.get(shape.containerShape);
      (holders as Int32Array)[at] = holderAt ?? -1;
    });
    holderLists.set(shapes, holders);
  }
  return holders;
}

/**
 * The shapes as the view's overlays and the levels of detail make them. With `before`, the decorated
 * shapes of the last build, whose shapes keep their indexes, it says which ones moved. `holders`
 * says what each shape sits in, when it is known already.
 */
export function decorateShapes(
  base: readonly ElementShape[],
  inputs: DecorationInputs,
  before: readonly ElementShape[] | undefined,
  holders: Int32Array = holdersOf(base),
): DecoratedShapes {
  const { overlaid, decorates } = passOf(inputs);
  if (!decorates) {
    const shapes = base as ElementShape[];
    return { shapes, pre: shapes, sized: false, ...changesFrom(base, before) };
  }
  const out: ElementShape[] = new Array<ElementShape>(base.length);
  let sized = false;
  base.forEach((shape, at) => {
    const holderAt = holders[at] ?? -1;
    const holder = holderAt < 0 ? undefined : out[holderAt];
    const decorated = decorateShape(shape, holder, inputs, overlaid);
    if (decorated.laidOut !== undefined) sized = true;
    out[at] = decorated;
  });
  if (!sized) return { shapes: out, pre: out, sized, ...changesFrom(out, before) };
  const shapes = [...out];
  growExtents(shapes, holders, inputs.values !== undefined);
  return { shapes, pre: out, sized, ...changesFrom(shapes, before) };
}

/** Which shapes moved, and whether an extent changed, between two lists of shapes of one length. */
function changesFrom(
  shapes: readonly ElementShape[],
  before: readonly ElementShape[] | undefined,
): { moved: number[]; extentChanged: boolean } {
  const moved: number[] = [];
  let extentChanged = false;
  if (!before || before.length !== shapes.length) return { moved, extentChanged };
  shapes.forEach((shape, at) => {
    const was = before[at] as ElementShape;
    if (was === shape) return;
    if (!sameRect(was.rect, shape.rect)) moved.push(at);
    else if (!sameRect(was.extent, shape.extent)) extentChanged = true;
  });
  return { moved, extentChanged };
}

/**
 * What one shape was decorated from, to give the same object for the same inputs: of what holds it,
 * only what the pass reads, its colors and its levels, so that a container whose extent alone grew
 * leaves its contents as they were; and the look its overlays gave it.
 */
interface ShapeMade {
  overlays: readonly Overlay[] | undefined;
  definitions: Definitions;
  element: Element | undefined;
  look: OverlayLook | undefined;
  holderFill: Color | undefined;
  holderDark: Color | undefined;
  holderLevels: readonly LevelOfDetail[] | undefined;
  shape: ElementShape;
}

/** The shapes the view's own scene decorated, as stored. */
const madeShapes = new WeakMap<ElementShape, ShapeMade>();
/** The shapes the canvas's scene decorated through the lookup, where they differ. */
const liveShapes = new WeakMap<ElementShape, ShapeMade>();

function madeFrom(
  known: ShapeMade | undefined,
  inputs: DecorationInputs,
  element: Element | undefined,
  look: OverlayLook | undefined,
  holder: ElementShape | undefined,
): boolean {
  return (
    known !== undefined &&
    known.overlays === inputs.overlays &&
    known.definitions === inputs.definitions &&
    known.element === element &&
    sameLook(known.look, look) &&
    known.holderFill === holder?.fill &&
    known.holderDark === holder?.dark?.fill &&
    known.holderLevels === holder?.levels
  );
}

export function decorateShape(
  shape: ElementShape,
  holder: ElementShape | undefined,
  inputs: DecorationInputs,
  overlaid: boolean,
): ElementShape {
  const element = inputs.elements.get(shape.element);
  const look = overlaid && element ? lookOfElement(element, inputs) : undefined;
  // What reads as stored is drawn as the view's own scene draws it, the same object.
  const stored = madeShapes.get(shape);
  if (stored && madeFrom(stored, inputs, element, look, holder)) return looked(stored.shape, look);
  const cache = inputs.values === undefined ? madeShapes : liveShapes;
  const known = cache === madeShapes ? stored : cache.get(shape);
  if (known && madeFrom(known, inputs, element, look, holder)) return looked(known.shape, look);
  // A row, and an anchored part, takes the levels of what holds it (ADR 0055, ADR 0067).
  const levels =
    shape.row !== undefined || shape.part?.inDrawing === true
      ? holder?.levels
      : element
        ? levelsOf(element, inputs.definitions)
        : undefined;
  const made = withLook(shape, look, levels, holder, element, inputs.definitions);
  // Made again for other inputs, as after a change of definitions, it is the same if it draws alike.
  const decorated =
    stored && sameDecoration(stored.shape, made)
      ? stored.shape
      : known && sameDecoration(known.shape, made)
        ? known.shape
        : made;
  cache.set(shape, {
    overlays: inputs.overlays,
    definitions: inputs.definitions,
    element,
    look,
    holderFill: holder?.fill,
    holderDark: holder?.dark?.fill,
    holderLevels: holder?.levels,
    shape: decorated,
  });
  return looked(decorated, look);
}

/** The look overlays gave each anchored part, as decorated, which the part layer draws over its place. */
const partLooks = new WeakMap<ElementShape, OverlayLook>();

/** Notes the look an anchored part was decorated with, for {@link overlayLookOfPart}. */
function looked(shape: ElementShape, look: OverlayLook | undefined): ElementShape {
  if (shape.part?.inDrawing === true) {
    if (look) partLooks.set(shape, look);
    else partLooks.delete(shape);
  }
  return shape;
}

/**
 * The look the view's overlays give an anchored part (ADR 0067): its fill, stroke, opacity and badge,
 * which the part layer draws over the part's place, since the part itself is its drawing's picture.
 */
export function overlayLookOfPart(shape: ElementShape): OverlayLook | undefined {
  return partLooks.get(shape);
}

/** Whether two looks set the same channels to the same values. */
function sameLook(a: OverlayLook | undefined, b: OverlayLook | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.fill === b.fill &&
    a.stroke === b.stroke &&
    a.size === b.size &&
    a.badge === b.badge &&
    a.opacity === b.opacity
  );
}

/** Whether two decorations of one shape are alike in everything the pass changes. */
function sameDecoration(a: ElementShape, b: ElementShape): boolean {
  if (a === b) return true;
  return (
    a.fill === b.fill &&
    a.stroke === b.stroke &&
    a.dark?.fill === b.dark?.fill &&
    a.dark?.stroke === b.dark?.stroke &&
    a.detail === b.detail &&
    a.fitted?.name === b.fitted?.name &&
    a.fitted?.detail === b.fitted?.detail &&
    a.levels === b.levels &&
    sameRect(a.rect, b.rect) &&
    sameRect(a.extent, b.extent) &&
    sameOptionalRect(a.laidOut, b.laidOut) &&
    sameOptionalRect(a.plate, b.plate) &&
    sameShapeImage(a.image, b.image)
  );
}

function sameOptionalRect(a: Rect | undefined, b: Rect | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && sameRect(a, b));
}

/** What an element's own value for an attribute is, or the default its component gives. */
export function elementAttribute(
  element: Element,
  name: string,
  definitions: Definitions,
): JsonValue | undefined {
  return attributeValue(element, name, definitions);
}

/** What a relation's own value for an attribute is, or the default its relation type gives. */
export function relationAttribute(
  relation: Relation,
  name: string,
  definitions: Definitions,
): JsonValue | undefined {
  const own = relation.attributes;
  if (own !== undefined && Object.hasOwn(own, name)) return own[name];
  return relationTypeOrRelatesTo(definitions, relation.relationType).attributes.find(
    (attribute) => attribute.name === name,
  )?.default;
}

const elementLooks = new WeakMap<
  Element,
  {
    overlays: readonly Overlay[] | undefined;
    definitions: Definitions;
    look: OverlayLook | undefined;
  }
>();

function elementLookOf(
  element: Element,
  overlays: readonly Overlay[] | undefined,
  definitions: Definitions,
): OverlayLook | undefined {
  const known = elementLooks.get(element);
  if (known && known.overlays === overlays && known.definitions === definitions) return known.look;
  const look = overlayLookOf(overlays, 'elements', (name) =>
    elementAttribute(element, name, definitions),
  );
  elementLooks.set(element, { overlays, definitions, look });
  return look;
}

/** The look an element's overlays give it: as stored, or through the lookup when it has values from outside. */
function lookOfElement(element: Element, inputs: DecorationInputs): OverlayLook | undefined {
  const stored = elementLookOf(element, inputs.overlays, inputs.definitions);
  const { values } = inputs;
  if (values === undefined || !values.overrides(element.id)) return stored;
  return liveLookOf(
    liveElementLooks,
    element,
    element.id,
    { kind: 'element', element },
    'elements',
    inputs.overlays,
    inputs.definitions,
    values,
    stored,
  );
}

/**
 * The look a target's overlays give it through the lookup, and what it was worked out from: the
 * target's live values and computed answers, by identity, and the values the overlays read, by
 * `key`. A target whose values from outside changed is read again; its look is worked out again
 * only when what its overlays read changed.
 */
interface LiveLook {
  overlays: readonly Overlay[] | undefined;
  definitions: Definitions;
  live: unknown;
  answers: unknown;
  key: string;
  look: OverlayLook | undefined;
}

const liveElementLooks = new WeakMap<Element, LiveLook>();
const liveRelationLooks = new WeakMap<Relation, LiveLook>();

function liveLookOf<T extends object>(
  cache: WeakMap<T, LiveLook>,
  target: T,
  id: Id,
  item: Attributed,
  of: 'elements' | 'relations',
  overlays: readonly Overlay[] | undefined,
  definitions: Definitions,
  values: OverlayValues,
  stored: OverlayLook | undefined,
): OverlayLook | undefined {
  const live = values.liveOf(id);
  const answers = values.answersOf(id);
  const known = cache.get(target);
  const sameInputs =
    known !== undefined && known.overlays === overlays && known.definitions === definitions;
  if (sameInputs && known.live === live && known.answers === answers) return known.look;
  // Each attribute an overlay reads is read once, for the key and for the look.
  const read = valuesRead(overlays, of, (name) => values.value(item, name, definitions));
  const key = keyOf(read);
  let look: OverlayLook | undefined;
  if (sameInputs && known.key === key) look = known.look;
  else {
    look = lookByValues(overlays, of, key, read);
    // What reads as stored is the stored look itself, so that its shape is the view scene's own.
    if (sameLook(look, stored)) look = stored;
  }
  cache.set(target, { overlays, definitions, live, answers, key, look });
  return look;
}

/** The looks the canvas's overlays gave values, by the key of the values, for each list of overlays. */
const looksByValues = new WeakMap<readonly Overlay[], Map<string, OverlayLook | null>>();
/** The most looks kept for one list of overlays before they are all let go. */
const MOST_LOOKS = 10_000;

/** The look overlays give these values: the same object for the same values, which recur. */
function lookByValues(
  overlays: readonly Overlay[] | undefined,
  of: 'elements' | 'relations',
  key: string,
  read: readonly (JsonValue | undefined)[],
): OverlayLook | undefined {
  if (overlays === undefined) return undefined;
  let looks = looksByValues.get(overlays);
  if (looks === undefined) {
    looks = new Map();
    looksByValues.set(overlays, looks);
  }
  const named = `${of}:${key}`;
  const known = looks.get(named);
  if (known !== undefined) return known ?? undefined;
  const look = lookFrom(overlays, of, read);
  if (looks.size >= MOST_LOOKS) looks.clear();
  looks.set(named, look ?? null);
  return look;
}

/** The values the overlays that apply to things of a kind read, in their order. */
function valuesRead(
  overlays: readonly Overlay[] | undefined,
  of: 'elements' | 'relations',
  read: (name: string) => JsonValue | undefined,
): (JsonValue | undefined)[] {
  const found: (JsonValue | undefined)[] = [];
  const names: string[] = [];
  for (const overlay of overlays ?? []) {
    if (!overlayApplies(overlay, of)) continue;
    // Overlays of one attribute read it once.
    const before = names.indexOf(overlay.attribute);
    found.push(before < 0 ? read(overlay.attribute) : found[before]);
    names.push(overlay.attribute);
  }
  return found;
}

/** The values overlays read, as one text: the same text for the same values. */
function keyOf(values: readonly (JsonValue | undefined)[]): string {
  let key = '';
  for (const value of values) {
    switch (typeof value) {
      case 'undefined':
        key += 'u;';
        break;
      case 'number':
        key += `n${value};`;
        break;
      case 'string':
        key += `s${value.length}:${value};`;
        break;
      case 'boolean':
        key += value ? 't;' : 'f;';
        break;
      default:
        key += `j${JSON.stringify(value)};`;
    }
  }
  return key;
}

/**
 * What the overlays that apply set, from the values they read in their order (`valuesRead`): each
 * channel by the first that sets it, as the core's `overlayLookOf` gives it.
 */
function lookFrom(
  overlays: readonly Overlay[] | undefined,
  of: 'elements' | 'relations',
  values: readonly (JsonValue | undefined)[],
): OverlayLook | undefined {
  let look: OverlayLook | undefined;
  let at = 0;
  for (const overlay of overlays ?? []) {
    if (!overlayApplies(overlay, of)) continue;
    const value = values[at];
    at += 1;
    if (look !== undefined && look[overlay.channel] !== undefined) continue;
    const set = overlayValue(overlay, value);
    if (set === undefined) continue;
    look ??= {};
    (look as Record<string, unknown>)[overlay.channel] = set;
  }
  return look;
}

const elementLevels = new WeakMap<
  Element,
  { definitions: Definitions; levels: readonly LevelOfDetail[] | undefined }
>();

/** The levels of detail an element's shapes follow, as its appearance works them out; none for the canvas's own. */
function levelsOf(
  element: Element,
  definitions: Definitions,
): readonly LevelOfDetail[] | undefined {
  const known = elementLevels.get(element);
  if (known && known.definitions === definitions) return known.levels;
  const levels = appearanceOf(element, definitions).levels;
  elementLevels.set(element, { definitions, levels });
  return levels;
}

const declaringDefinitions = new WeakMap<Definitions, boolean>();
const declaringElements = new WeakMap<readonly Element[], boolean>();

/**
 * Whether any definition in use, or any element, declares levels of detail: without any, the pass
 * leaves the shapes as they are, and costs nothing.
 */
function declaresLevels(definitions: Definitions, elements: readonly Element[]): boolean {
  let byDefinitions = declaringDefinitions.get(definitions);
  if (byDefinitions === undefined) {
    byDefinitions = definitions.component(ESSENCE_ID)?.appearance.levels !== undefined;
    for (const id of definitions.components.keys()) {
      if (byDefinitions) break;
      byDefinitions = definitions.component(id)?.appearance.levels !== undefined;
    }
    declaringDefinitions.set(definitions, byDefinitions);
  }
  if (byDefinitions) return true;
  let byElements = declaringElements.get(elements);
  if (byElements === undefined) {
    byElements = elements.some((element) => element.appearance?.levels !== undefined);
    declaringElements.set(elements, byElements);
  }
  return byElements;
}

/** The colors a shape is drawn on, in each theme: its container's, or the canvas's. */
function backdropOf(holder: ElementShape | undefined): { light: Color; dark: Color } {
  if (!holder) return CANVAS_BACKGROUNDS;
  return { light: holder.fill, dark: holder.dark?.fill ?? holder.fill };
}

/** A shape with what an overlay's look and its levels say; the shape itself when they say nothing. */
function withLook(
  shape: ElementShape,
  look: OverlayLook | undefined,
  levels: readonly LevelOfDetail[] | undefined,
  holder: ElementShape | undefined,
  element: Element | undefined,
  definitions: Definitions,
): ElementShape {
  if (look === undefined && levels === shape.levels) return shape;
  const next: ElementShape = { ...shape };
  if (levels === undefined) delete next.levels;
  else next.levels = levels;
  if (look === undefined) return next;
  paint(next, look, backdropOf(holder));
  if (look.badge !== undefined) badge(next, look.badge);
  if (look.size !== undefined && look.size !== 1 && sizable(shape)) {
    resize(next, shape, look.size, element, definitions);
  }
  return next;
}

/** Gives a shape the colors an overlay's look says, faded as its opacity says. */
function paint(shape: ElementShape, look: OverlayLook, backdrop: { light: Color; dark: Color }) {
  let fill = look.fill ?? shape.fill;
  let stroke = look.stroke ?? shape.stroke;
  let darkFill = look.fill ?? shape.dark?.fill ?? shape.fill;
  const darkStroke = look.stroke ?? shape.dark?.stroke ?? shape.stroke;
  // A built-in fill keeps its light value beside a stroke that the dark canvas would swallow.
  if (
    look.fill === undefined &&
    look.stroke !== undefined &&
    contrastRatio(look.stroke, CANVAS_BACKGROUNDS.dark) < MINIMUM_MARK_CONTRAST
  ) {
    darkFill = shape.fill;
  }
  let dark = { fill: darkFill, stroke: darkStroke };
  const opacity = look.opacity;
  if (opacity !== undefined && opacity < 1) {
    fill = fadedColor(fill, backdrop.light, opacity);
    stroke = fadedColor(stroke, backdrop.light, opacity);
    dark = {
      fill: fadedColor(dark.fill, backdrop.dark, opacity),
      stroke: fadedColor(dark.stroke, backdrop.dark, opacity),
    };
  }
  shape.fill = fill;
  shape.stroke = stroke;
  if (dark.fill !== fill || dark.stroke !== stroke) shape.dark = dark;
  else delete shape.dark;
}

/** Writes an overlay's badge after the shape's detail, on its fitted line too when it has one. */
function badge(shape: ElementShape, text: string): void {
  const detail = shape.detail ?? shape.componentName;
  shape.detail = joined(detail, text);
  // A detail drawn with text emphasis draws the badge after its runs, as written (ADR 0082).
  if (shape.detailRuns) shape.detailRuns = runsWithPart(shape.detailRuns, text);
  const fitted = shape.fitted;
  if (!fitted) return;
  const icon = shape.image !== undefined;
  if (shape.row !== undefined) {
    shape.fitted = fitRow(shape.name, shape.detail, shape.rect.width, { icon });
    return;
  }
  // What a header already cut shows no more of its detail.
  if (fitted.detail.endsWith('…')) return;
  shape.fitted = fitHeader(shape.name, joined(fitted.detail, text), shape.rect.width, {
    toggle: shape.holdsContents || shape.collapsed !== undefined,
    icon,
  });
}

function joined(detail: string, text: string): string {
  return detail === '' ? text : `${detail} · ${text}`;
}

/**
 * Whether a shape takes an overlay's size: it shows no contents and is neither a row nor a table, a
 * drawing with parts nor one of its anchored parts, whose size is their part's (ADR 0067).
 */
function sizable(shape: ElementShape): boolean {
  return (
    !shape.holdsContents &&
    shape.row === undefined &&
    shape.rowCount === undefined &&
    shape.picture === undefined &&
    shape.part?.inDrawing !== true
  );
}

/** Scales a shape around its middle, keeping the rectangle layout gave it, and its picture with it. */
function resize(
  next: ElementShape,
  shape: ElementShape,
  factor: number,
  element: Element | undefined,
  definitions: Definitions,
): void {
  const { rect } = shape;
  const width = rect.width * factor;
  const height = rect.height * factor;
  const scaled = {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
  next.laidOut = rect;
  next.rect = scaled;
  next.extent = scaled;
  // Its own outline is fitted again to the size it takes (ADR 0066).
  if (shape.outline) {
    const body = bodyOf({ rect: scaled, collapsed: shape.collapsed });
    next.outline = outlineIn(shape.outline.source, body.width, body.height);
  }
  delete next.image;
  delete next.plate;
  if (shape.image && element) {
    const placed = placeImage(
      imageLookOf(element, definitions),
      {
        kind: shape.kind,
        rect: scaled,
        holdsContents: false,
        ...(shape.collapsed === undefined ? {} : { collapsed: true }),
        rows: false,
        ...(next.outline ? { outline: next.outline } : {}),
      },
      (next.detail ?? '') !== '',
    );
    if (placed) next.image = placed.image;
    if (placed?.plate) next.plate = placed.plate;
  }
}

/** The shapes grown in the view's own scene, and in the canvas's, by the shape each was grown from. */
const grownShapes = new WeakMap<ElementShape, ElementShape>();
const liveGrownShapes = new WeakMap<ElementShape, ElementShape>();

/**
 * Grows the extent of every shape that holds one an overlay sized beyond it, so that what holds a
 * shape still holds all of it, as hit testing and the bands of drawing need. Contents come after what
 * holds them, so one pass from the last shape to the first carries each reach up; a shape grown as
 * before is the same object, the view's own where the view's scene grew it alike. `live` is on for
 * the canvas's scene, which reads values through the lookup.
 */
export function growExtents(out: ElementShape[], holders: Int32Array, live: boolean): void {
  const cache = live ? liveGrownShapes : grownShapes;
  const reaches = new Map<number, Rect>();
  for (let at = out.length - 1; at >= 0; at--) {
    let shape = out[at] as ElementShape;
    const reached = reaches.get(at);
    if (reached !== undefined && !within(reached, shape.extent)) {
      const extent = union(shape.extent, reached);
      const stored = grownShapes.get(shape);
      let grown: ElementShape;
      if (stored && sameRect(stored.extent, extent)) grown = stored;
      else {
        const known = cache.get(shape);
        grown = known && sameRect(known.extent, extent) ? known : { ...shape, extent };
        cache.set(shape, grown);
      }
      out[at] = grown;
      shape = grown;
    }
    if (shape.laidOut === undefined && reached === undefined) continue;
    const holderAt = holders[at] ?? -1;
    if (holderAt < 0) continue;
    const holder = out[holderAt] as ElementShape;
    if (within(shape.extent, holder.extent)) continue;
    const before = reaches.get(holderAt);
    reaches.set(holderAt, before === undefined ? shape.extent : union(before, shape.extent));
  }
}

function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a === b || (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

// Relations' lines ---------------------------------------------------------------------------------

/** What the pass reads of the model's relations. */
export interface LineInputs {
  overlays: readonly Overlay[] | undefined;
  definitions: Definitions;
  relations: ReadonlyMap<Id, Relation>;
  /** How overlays read attributes; absent, as stored. */
  values?: OverlayValues | undefined;
}

interface LineMade {
  overlays: readonly Overlay[] | undefined;
  definitions: Definitions;
  relation: Relation | undefined;
  look: OverlayLook | undefined;
  line: RelationLine;
}

/** The lines the view's own scene decorated, and those the canvas's decorated otherwise. */
const madeLines = new WeakMap<RelationLine, LineMade>();
const liveLines = new WeakMap<RelationLine, LineMade>();

function lineMadeFrom(
  known: LineMade | undefined,
  inputs: LineInputs,
  relation: Relation | undefined,
  look: OverlayLook | undefined,
): boolean {
  return (
    known !== undefined &&
    known.overlays === inputs.overlays &&
    known.definitions === inputs.definitions &&
    known.relation === relation &&
    sameLook(known.look, look)
  );
}

const relationLooks = new WeakMap<
  Relation,
  {
    overlays: readonly Overlay[] | undefined;
    definitions: Definitions;
    look: OverlayLook | undefined;
  }
>();

/** The look a relation's overlays give its line: as stored, or through the lookup. */
function lookOfRelation(relation: Relation, inputs: LineInputs): OverlayLook | undefined {
  const { overlays, definitions, values } = inputs;
  let known = relationLooks.get(relation);
  if (!known || known.overlays !== overlays || known.definitions !== definitions) {
    const look = overlayLookOf(overlays, 'relations', (name) =>
      relationAttribute(relation, name, definitions),
    );
    known = { overlays, definitions, look };
    relationLooks.set(relation, known);
  }
  if (values === undefined || !values.overrides(relation.id)) return known.look;
  return liveLookOf(
    liveRelationLooks,
    relation,
    relation.id,
    { kind: 'relation', relation },
    'relations',
    overlays,
    definitions,
    values,
    known.look,
  );
}

/**
 * The lines as the view's overlays of relations make them: an aggregated relation stands for many
 * relations and takes none. The list itself when no overlay reads relations.
 */
export function decorateLines(lines: readonly RelationLine[], inputs: LineInputs): RelationLine[] {
  if (!overlaysApply(inputs.overlays, 'relations')) return lines as RelationLine[];
  let changed = false;
  const out = lines.map((line) => {
    const decorated = decorateLine(line, inputs);
    if (decorated !== line) changed = true;
    return decorated;
  });
  return changed ? out : (lines as RelationLine[]);
}

export function decorateLine(line: RelationLine, inputs: LineInputs): RelationLine {
  if (line.aggregate) return line;
  const relation = inputs.relations.get(line.relation);
  const look = relation ? lookOfRelation(relation, inputs) : undefined;
  // What reads as stored is drawn as the view's own scene draws it, the same object.
  const stored = madeLines.get(line);
  if (stored && lineMadeFrom(stored, inputs, relation, look)) return stored.line;
  const cache = inputs.values === undefined ? madeLines : liveLines;
  const known = cache === madeLines ? stored : cache.get(line);
  if (known && lineMadeFrom(known, inputs, relation, look)) return known.line;
  const made = look === undefined ? line : lineWithLook(line, look, relation?.name);
  const decorated =
    stored && sameLine(stored.line, made)
      ? stored.line
      : known && sameLine(known.line, made)
        ? known.line
        : made;
  cache.set(line, {
    overlays: inputs.overlays,
    definitions: inputs.definitions,
    relation,
    look,
    line: decorated,
  });
  return decorated;
}

/** Whether two decorations of one line are alike in everything the pass changes. */
function sameLine(a: RelationLine, b: RelationLine): boolean {
  return (
    a === b ||
    (a.stroke === b.stroke &&
      a.darkStroke === b.darkStroke &&
      a.width === b.width &&
      a.label === b.label &&
      a.arrowhead?.tip.x === b.arrowhead?.tip.x &&
      a.arrowhead?.tip.y === b.arrowhead?.tip.y &&
      a.arrowhead?.left.x === b.arrowhead?.left.x &&
      a.arrowhead?.left.y === b.arrowhead?.left.y &&
      a.arrowhead?.right.x === b.arrowhead?.right.x &&
      a.arrowhead?.right.y === b.arrowhead?.right.y)
  );
}

function lineWithLook(
  line: RelationLine,
  look: OverlayLook,
  name: string | undefined,
): RelationLine {
  const next: RelationLine = { ...line };
  let stroke = look.stroke ?? line.stroke;
  let darkStroke = look.stroke ?? line.darkStroke ?? line.stroke;
  if (look.opacity !== undefined && look.opacity < 1) {
    stroke = fadedColor(stroke, CANVAS_BACKGROUNDS.light, look.opacity);
    darkStroke = fadedColor(darkStroke, CANVAS_BACKGROUNDS.dark, look.opacity);
  }
  next.stroke = stroke;
  if (darkStroke !== stroke) next.darkStroke = darkStroke;
  else delete next.darkStroke;
  if (look.size !== undefined && look.size !== 1) {
    next.width = line.width * look.size;
    const end = line.route.at(-1) as Point;
    const beforeEnd = line.route.at(-2) as Point;
    if (line.arrowhead) next.arrowhead = arrowheadAt(beforeEnd, end, next.width);
  }
  if (look.badge !== undefined)
    next.label = name === undefined ? look.badge : `${name} · ${look.badge}`;
  return next;
}
