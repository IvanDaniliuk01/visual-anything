/**
 * Live and computed values in the detail shapes write (ADR 0057, ADR 0063): the canvas writes an
 * attribute as the lookup reads it, with its mark, so that a value from outside is never taken for a
 * stored one. A live value is marked "●" while fresh; once stale it fades to "○" and says how old it
 * is, "○ 95 ms (3 min)"; a computed value is marked "ƒ".
 *
 * The scene the view builds stays as it is: this makes, for the canvas only, the scene with the
 * shapes whose detail reads otherwise, each a new shape in the same place, and every other shape the
 * same object, so that the renderer draws again only those. Each shape's detail is worked out again
 * only when what it reads changed.
 */
import {
  detailParts,
  liveAge,
  startedTypesByElement,
  type Definitions,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { modelIndexOf } from '@visual-anything/core';
import type { Element, Id, Relation } from '@visual-anything/schema';
import { fitHeader, fitRow } from '../canvas/fit';
import { withSameShapes, type ElementShape, type Scene } from '../canvas/scene';
import type { Translator } from '../i18n';
import type { AttributeLookup } from './lookup';
import { shortAge } from './words';

/** The marks the canvas writes before a value from outside the model. */
export const LIVE_MARK = '●';
export const STALE_MARK = '○';
export const COMPUTED_MARK = 'ƒ';

/** What a shape's live detail was worked out from, so that it is worked out again only when that changes. */
interface Worked {
  element: Element;
  live: ReadonlyMap<string, LiveValue> | undefined;
  computed: unknown;
  definitions: Definitions;
  translator: Translator;
  /** How each live value reads by the clock: fresh, or the age a stale one says. */
  ages: string;
  detail: string;
}

/** The detail last worked out for each element. */
const worked = new Map<Id, Worked>();
/** The most details kept before they are all let go. */
const MOST_WORKED = 50_000;
/** The shape last made from each shape of a scene, by its detail. */
const made = new WeakMap<ElementShape, { detail: string; shape: ElementShape }>();
/** The scene last made from each scene, by the shapes it holds. */
const madeScenes = new WeakMap<Scene, { shapes: readonly ElementShape[]; scene: Scene }>();
const startedMaps = new WeakMap<readonly Relation[], Map<Id, Set<Id>>>();
const NO_TYPES: ReadonlySet<Id> = new Set();

/**
 * The scene as the canvas draws it with the lookup's values in details: the same scene while no shape
 * reads otherwise.
 */
export function withLiveDetails(
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
  let shapes: ElementShape[] | undefined;
  scene.shapes.forEach((shape, at) => {
    if (!lookup.overrides(shape.element)) return;
    const element = index.element(shape.element);
    if (element === undefined) return;
    const detail = detailOf(element, definitions, lookup, t, started.get(element.id) ?? NO_TYPES);
    const drawn = shapeWith(shape, detail);
    if (drawn === shape) return;
    shapes ??= [...scene.shapes];
    shapes[at] = drawn;
  });
  if (shapes === undefined) return scene;
  const before = madeScenes.get(scene);
  if (before !== undefined && sameShapes(before.shapes, shapes)) return before.scene;
  const live = withSameShapes(scene, shapes);
  madeScenes.set(scene, { shapes, scene: live });
  return live;
}

/** An element's detail as the lookup reads its attributes, with the marks of what comes from outside. */
function detailOf(
  element: Element,
  definitions: Definitions,
  lookup: AttributeLookup,
  t: Translator,
  started: ReadonlySet<Id>,
): string {
  const live = lookup.liveOf(element.id);
  const computed = lookup.computed.get(element.id);
  const ages = agesOf(live, lookup.now, t);
  const known = worked.get(element.id);
  if (
    known !== undefined &&
    known.element === element &&
    known.live === live &&
    known.computed === computed &&
    known.definitions === definitions &&
    known.translator === t &&
    known.ages === ages
  ) {
    return known.detail;
  }
  const item = { kind: 'element', element } as const;
  const parts = detailParts(element, definitions, started, (name) =>
    lookup.value(item, name, definitions),
  );
  const detail = parts
    .map((part) => {
      if (part.kind === 'component-name') return t.definition(element.component, part.text);
      if (part.kind !== 'attribute') return part.text;
      const reading = lookup.read(item, part.attribute, definitions);
      if (reading?.origin === 'computed') return `${COMPUTED_MARK} ${part.text}`;
      if (reading?.origin !== 'live' || reading.live === undefined) return part.text;
      const age = liveAge(reading.live, lookup.now);
      return age.stale
        ? `${STALE_MARK} ${part.text} (${shortAge(t, age.age)})`
        : `${LIVE_MARK} ${part.text}`;
    })
    .join(' · ');
  if (worked.size >= MOST_WORKED) worked.clear();
  worked.set(element.id, { element, live, computed, definitions, translator: t, ages, detail });
  return detail;
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

/** A shape that writes this detail: itself when it does already. */
function shapeWith(shape: ElementShape, detail: string): ElementShape {
  if ((shape.detail ?? '') === detail) return shape;
  const before = made.get(shape);
  if (before?.detail === detail) return before.shape;
  let drawn: ElementShape;
  if (shape.row !== undefined) {
    drawn = {
      ...shape,
      detail,
      fitted: fitRow(shape.name, detail, shape.rect.width, { icon: shape.image !== undefined }),
    };
  } else if (shape.rowCount !== undefined) {
    // A collapsed header also says what it holds, which only the scene knows: it keeps its detail.
    if (shape.collapsed !== undefined) return shape;
    drawn = {
      ...shape,
      detail,
      fitted: fitHeader(shape.name, detail, shape.rect.width, {
        toggle: shape.holdsContents,
        icon: shape.image !== undefined,
      }),
    };
  } else {
    drawn = { ...shape, detail };
  }
  made.set(shape, { detail, shape: drawn });
  return drawn;
}

function sameShapes(a: readonly ElementShape[], b: readonly ElementShape[]): boolean {
  return a.length === b.length && a.every((shape, at) => shape === b[at]);
}
