/**
 * Live and computed values on the canvas (ADR 0057, ADR 0063, ADR 0055): the canvas writes an
 * attribute as the lookup reads it, with its mark, so that a value from outside is never taken for a
 * stored one, and the view's overlays color, size, mark and fade shapes by the values the lookup
 * reads. A live value is marked "●" while fresh; once stale it keeps "○" and says how old it is,
 * "○ 95 ms (3 min)"; a computed value is marked "ƒ", and a simulated one "∿" (ADR 0085).
 *
 * The scene the view builds stays as it is: this makes, for the canvas only, the scene with the
 * shapes and lines that read otherwise, each a new object in the same place, but for what an
 * overlay's size moves, and every other one the same object, so that the renderer draws again only
 * those (`sceneWithValues`). Each shape's detail is worked out again only when what it reads changed.
 */
import {
  componentOrEssence,
  detailParts,
  detailText,
  faceInputOf,
  liveAge,
  startedTypesByElement,
  type AttributeReading,
  type Definitions,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { modelIndexOf } from '@visual-anything/core';
import type { DetailPart, EmphasisRun } from '@visual-anything/core';
import { detailRunsOf } from '../text/detail';
import type { Element, Id, Relation } from '@visual-anything/schema';
import { fitHeader, fitRow } from '../canvas/fit';
import { showsPicture } from '../canvas/shape-images';
import type { ShapeFace } from '../canvas/faces';
import { sceneWithValues, type ElementShape, type Scene, type SceneValues } from '../canvas/scene';
import type { Translator } from '../i18n';
import type { AttributeLookup } from './lookup';
import { shortAge } from './words';

/** The marks the canvas writes before a value from outside the model. */
export const LIVE_MARK = '●';
export const STALE_MARK = '○';
export const COMPUTED_MARK = 'ƒ';
/** The mark of a value a simulation run shown worked out at its tick shown (ADR 0085). */
export const SIMULATED_MARK = '∿';

/** What a shape's live detail was worked out from, so that it is worked out again only when that changes. */
interface Worked {
  element: Element;
  live: ReadonlyMap<string, LiveValue> | undefined;
  computed: unknown;
  simulated: unknown;
  definitions: Definitions;
  translator: Translator;
  /** How each live value reads by the clock: fresh, or the age a stale one says. */
  ages: string;
  detail: string;
  /** Its runs, when a value in it takes text emphasis (ADR 0082). */
  runs: EmphasisRun[] | undefined;
}

/** The detail last worked out for each element. */
const worked = new Map<Id, Worked>();
/** The most details kept before they are all let go. */
const MOST_WORKED = 50_000;
/** The shape last made from each shape of a scene, by its detail. */
const made = new WeakMap<
  ElementShape,
  { detail: string; runs: EmphasisRun[] | undefined; shape: ElementShape }
>();
const startedMaps = new WeakMap<readonly Relation[], Map<Id, Set<Id>>>();
const NO_TYPES: ReadonlySet<Id> = new Set();

/**
 * The scene as the canvas draws it with the lookup's values in details and in overlays: the same
 * scene while nothing reads otherwise.
 */
export function liveSceneOf(
  scene: Scene,
  project: ProjectSnapshot,
  definitions: Definitions,
  lookup: AttributeLookup,
  t: Translator,
): Scene {
  const index = modelIndexOf(project);
  let started = startedMaps.get(project.model.relations);
  if (started === undefined) {
    started = startedTypesByElement(project.model.relations);
    startedMaps.set(project.model.relations, started);
  }
  const values: LiveSceneValues = {
    lookup,
    definitions,
    translator: t,
    overlays: lookup,
    detailed: (shape) => {
      if (!lookup.overrides(shape.element)) return shape;
      const element = index.element(shape.element);
      if (element === undefined) return shape;
      const { detail, runs } = detailOf(
        element,
        definitions,
        lookup,
        t,
        started.get(element.id) ?? NO_TYPES,
      );
      const drawn = shapeWith(shape, detail, runs);
      // A face reads the same values (ADR 0083).
      return shape.face
        ? withFaceValues(drawn, shape.face, element, definitions, lookup, started.get(element.id))
        : drawn;
    },
    // What may read otherwise: what the lookup says changed, while the words and definitions are
    // the same; otherwise everything.
    changedSince: (before) => {
      const last = before as Partial<LiveSceneValues>;
      if (last.lookup === undefined || last.translator !== t || last.definitions !== definitions) {
        return undefined;
      }
      return lookup.changedSince(last.lookup);
    },
  };
  return sceneWithValues(scene, project, values);
}

/** The values the canvas's scene is made with, and what they come from. */
interface LiveSceneValues extends SceneValues {
  lookup: AttributeLookup;
  definitions: Definitions;
  translator: Translator;
}

/** An element's detail as the lookup reads its attributes, with the marks of what comes from outside. */
function detailOf(
  element: Element,
  definitions: Definitions,
  lookup: AttributeLookup,
  t: Translator,
  started: ReadonlySet<Id>,
): { detail: string; runs: EmphasisRun[] | undefined } {
  const live = lookup.liveOf(element.id);
  const computed = lookup.computed.get(element.id);
  const simulated = lookup.simulatedOf(element.id);
  const ages = agesOf(live, lookup.now, t);
  const known = worked.get(element.id);
  if (
    known !== undefined &&
    known.element === element &&
    known.live === live &&
    known.computed === computed &&
    known.simulated === simulated &&
    known.definitions === definitions &&
    known.translator === t &&
    known.ages === ages
  ) {
    return known;
  }
  const item = { kind: 'element', element } as const;
  // Each attribute is read once, for the parts and for their marks.
  const names: string[] = [];
  const readings: (AttributeReading | undefined)[] = [];
  const readingOf = (name: string): AttributeReading | undefined => {
    const at = names.indexOf(name);
    if (at >= 0) return readings[at];
    const reading = lookup.read(item, name, definitions);
    names.push(name);
    readings.push(reading);
    return reading;
  };
  const parts = detailParts(element, definitions, started, (name) => readingOf(name)?.value);
  const marked = parts.map((part): DetailPart => {
    if (part.kind === 'component-name') {
      return { ...part, text: t.definition(element.component, part.text) };
    }
    if (part.kind !== 'attribute') return part;
    return { ...part, text: markedText(t, readingOf(part.attribute), part.text, lookup.now) };
  });
  const detail = detailText(marked);
  const attributes = componentOrEssence(definitions, element.component).attributes;
  // A value that takes text emphasis is drawn with it, after its mark (ADR 0082).
  const runs = detailRunsOf(
    marked,
    (name) => attributes.find((each) => each.name === name)?.format === 'emphasis',
  );
  if (worked.size >= MOST_WORKED) worked.clear();
  worked.set(element.id, {
    element,
    live,
    computed,
    simulated,
    definitions,
    translator: t,
    ages,
    detail,
    runs,
  });
  return { detail, runs };
}

/**
 * A value's text with the mark of where it comes from, as the canvas and the element list write it:
 * "∿ 42" when a simulation run shown worked it out, "● 95 ms" while live and fresh, "○ 95 ms (3 min)"
 * once stale, "ƒ gold" when computed, and as it is when stored.
 */
export function markedText(
  t: Translator,
  reading: AttributeReading | undefined,
  text: string,
  now: number,
): string {
  if (reading?.origin === 'simulated') return `${SIMULATED_MARK} ${text}`;
  if (reading?.origin === 'computed') return `${COMPUTED_MARK} ${text}`;
  if (reading?.origin !== 'live' || reading.live === undefined) return text;
  const age = liveAge(reading.live, now);
  return age.stale ? `${STALE_MARK} ${text} (${shortAge(t, age.age)})` : `${LIVE_MARK} ${text}`;
}

/** How each of a target's live values reads by the clock: nothing while fresh, its age once stale. */
function agesOf(
  live: ReadonlyMap<string, LiveValue> | undefined,
  now: number,
  t: Translator,
): string {
  if (live === undefined) return '';
  let ages = '';
  for (const value of live.values()) {
    const age = liveAge(value, now);
    ages += age.stale ? `${shortAge(t, age.age)};` : ';';
  }
  return ages;
}

/** The faces made with the lookup's values, by the scene's face: kept while they read alike. */
const valuedFaces = new WeakMap<ShapeFace, { text: string; face: ShapeFace }>();

/**
 * A shape whose face is filled with the values the lookup reads, live and computed over stored ones
 * (ADR 0083): itself when they read as the scene's. They change what the face writes, never the size
 * the scene gave its shape before layout.
 */
function withFaceValues(
  shape: ElementShape,
  face: ShapeFace,
  element: Element,
  definitions: Definitions,
  lookup: AttributeLookup,
  started: ReadonlySet<Id> | undefined,
): ElementShape {
  const item = { kind: 'element', element } as const;
  const input = faceInputOf(element, definitions, {
    readValue: (name) => lookup.read(item, name, definitions)?.value,
    startedTypes: started ?? NO_TYPES,
    ...(face.input.count === undefined ? {} : { count: face.input.count }),
  });
  const filled = { ...input, component: face.input.component };
  const text = JSON.stringify(filled);
  if (text === JSON.stringify(face.input)) return shape;
  const known = valuedFaces.get(face);
  const valued = known?.text === text ? known.face : { compiled: face.compiled, input: filled };
  valuedFaces.set(face, { text, face: valued });
  return { ...shape, face: valued };
}

/** A shape that writes this detail: itself when it does already. */
function shapeWith(
  shape: ElementShape,
  detail: string,
  runs: EmphasisRun[] | undefined,
): ElementShape {
  if ((shape.detail ?? '') === detail) return shape;
  const before = made.get(shape);
  if (before?.detail === detail) return before.shape;
  const drawnRuns = withRuns(shape, runs);
  let drawn: ElementShape;
  if (shape.row !== undefined) {
    drawn = {
      ...drawnRuns,
      detail,
      fitted: fitRow(shape.name, detail, shape.rect.width, { icon: showsPicture(shape) }),
    };
    // A live detail is written on the row's one line, out of its table's columns.
    delete drawn.columns;
  } else if (shape.rowCount !== undefined) {
    // A collapsed header also says what it holds, which only the scene knows: it keeps its detail.
    if (shape.collapsed !== undefined) return shape;
    drawn = {
      ...drawnRuns,
      detail,
      fitted: fitHeader(shape.name, detail, shape.rect.width, {
        toggle: shape.holdsContents,
        icon: showsPicture(shape),
      }),
    };
  } else {
    drawn = { ...drawnRuns, detail };
  }
  made.set(shape, { detail, runs, shape: drawn });
  return drawn;
}

/** A shape with these runs for its detail, or with none. */
function withRuns(shape: ElementShape, runs: EmphasisRun[] | undefined): ElementShape {
  if (runs) return { ...shape, detailRuns: runs };
  if (!shape.detailRuns) return shape;
  const copy = { ...shape };
  delete copy.detailRuns;
  return copy;
}
