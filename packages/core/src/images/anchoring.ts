/**
 * Anchor parts… (ADR 0067): matching the named parts of a drawing with parts to the drawing's
 * contents, and the one action that anchors them. The inspector's dialog and Claude's `anchor_parts`
 * both plan here and send the command built here, so that they match alike.
 *
 * - **The parts of a drawing** are its picture's named parts, in document order, each with the
 *   content drawn as it now: the first content in the model's order whose appearance names the part,
 *   with this image or with none, as the canvas places it.
 * - **Matching** pairs each part that no content is drawn as with a content that is not drawn as one
 *   of the picture's parts: by name, the part's id and the content's name read alike whatever their
 *   case, accents and separators (`left_ventricle`, `LeftVentricle` and "Left ventricle"); by id, the
 *   part's id and the element's id exactly; or by an external identifier (ADR 0056), the part's id
 *   read in a scheme, as it is or with its first `_` read as `:` (`UBERON_0002084` as
 *   `UBERON:0002084`), translated through the crosswalks of the packages in use. Parts go in document
 *   order and each takes the first content in the model's order that it matches and no part before
 *   it took, so that a part and a content are paired at most once.
 * - **Creating** an element for each part that matches nothing, when asked: of the component chosen,
 *   named after the part, inside the drawing through the nesting relation type the core chooses for
 *   the two, with the identifier the part reads as in the scheme matched by.
 * - **The action** is one batch, labelled `Anchor 12 parts of "Heart"`: each content matched is drawn
 *   as its part by its own appearance, which names the part without its image, so that it follows the
 *   picture its drawing shows, replaced or not.
 */
import type { Element, ExternalId, Id, IdScheme, ViewFile } from '@visual-anything/schema';
import type { BatchCommand, Command } from '../commands/types';
import { nestingTypeFor, nestingTypesInView, type NestingChoice } from '../containers';
import { appearanceOf, componentOrEssence } from '../definitions';
import { isExternalId, isScheme } from '../external-ids';
import { completedIds, crosswalksOf, type CrosswalkTable } from '../import/crosswalks';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { imageShownBy, imagesIn } from './catalog';
import type { CleanedImage } from './cleaned';
import { partsOf, type NamedPart } from './parts';

/** How Anchor parts… matches parts to contents. */
export type AnchorMatching =
  | { readonly by: 'name' }
  | { readonly by: 'id' }
  | { readonly by: 'external'; readonly scheme: IdScheme };

/** What the dialog and Claude ask Anchor parts… to do. */
export interface AnchorRequest {
  /** The drawing with parts: an element whose shapes show their image with its parts. */
  readonly drawing: Id;
  readonly matching: AnchorMatching;
  /**
   * The view whose nesting relation types say what the drawing holds, and which a created element
   * is made in; absent, every nesting relation type holds, and elements are made as the first view
   * that draws the drawing arranges them.
   */
  readonly view?: Id;
  /** Creates, for each part that matches nothing, an element of this component inside the drawing. */
  readonly create?: { readonly component: Id };
  /** Only these parts, by id; absent, every part the picture lists. */
  readonly parts?: readonly string[];
}

/** A content of a drawing, by its id and name. */
export interface AnchorContent {
  readonly id: Id;
  readonly name: string;
}

/** What a part is drawn as, now or once the plan is applied. */
export type PartAnchor =
  /** A content is drawn as it already. */
  | { readonly kind: 'kept'; readonly element: AnchorContent }
  /** The plan anchors this content to it. */
  | { readonly kind: 'matched'; readonly element: AnchorContent }
  /** The plan creates an element, named so, of this component, drawn as it. */
  | {
      readonly kind: 'created';
      readonly name: string;
      readonly component: Id;
      readonly identifier?: { readonly scheme: IdScheme; readonly id: ExternalId };
    }
  /** Nothing is drawn as it, and nothing matched it. */
  | { readonly kind: 'unmatched' };

/** A part of the picture, with what it is drawn as. */
export interface PlannedPart {
  readonly part: NamedPart;
  readonly anchor: PartAnchor;
}

/** The parts of a drawing with parts and the contents each is drawn as: the inspector's list. */
export interface DrawingParts {
  readonly drawing: AnchorContent;
  readonly image: { readonly id: Id; readonly name: string; readonly cleaned: CleanedImage };
  /** The picture's named parts, in document order, each `kept` or `unmatched`. */
  readonly parts: readonly PlannedPart[];
  /** The drawing's contents, in the model's order. */
  readonly contents: readonly AnchorContent[];
  /**
   * The contents that name a part another content is drawn as, which are placed as ordinary
   * contents, by the part they name.
   */
  readonly twins: ReadonlyMap<Id, string>;
}

/** What Anchor parts… would do, which the dialog shows before it applies. */
export interface AnchorPlan extends DrawingParts {
  readonly matching: AnchorMatching;
  /** How many parts the plan anchors: those it matches and those it creates. */
  readonly anchors: number;
  /** The view created elements are made in, if any. */
  readonly view?: Id;
  /** How a created element goes inside the drawing; present when the plan creates any. */
  readonly nesting?: NestingChoice;
  /**
   * The nesting relation types the view is arranged by once it nests by `nesting`'s too, when it
   * does not yet: the same action makes it.
   */
  readonly viewNesting?: readonly Id[];
}

/** A plan, or why there can be none. */
export type AnchorPlanning =
  | { readonly ok: true; readonly plan: AnchorPlan }
  | { readonly ok: false; readonly problem: Problem };

/**
 * The parts of a drawing with parts, each with the content drawn as it now, and its contents, through
 * the view's nesting relation types or, without one, every one. `undefined` when the element is not
 * one, or does not show an SVG image with its parts that is drawn.
 */
export function drawingPartsOf(
  state: ProjectSnapshot,
  drawing: Id,
  view?: ViewFile,
): DrawingParts | undefined {
  const index = modelIndexOf(state);
  const element = index.element(drawing);
  if (!element || element.id === state.model.world.id) return undefined;
  const definitions = definitionsIn(state);
  const shown = imageShownBy(element, definitions);
  if (shown?.placement !== 'parts') return undefined;
  const catalog = imagesIn(state);
  const cleaned = catalog.shown(shown.image);
  if (!cleaned || cleaned.kind !== 'svg') return undefined;
  const contents = contentsOf(state, drawing, view);
  const listed = partsOf(cleaned);
  const byId = new Map(listed.map((part) => [part.id, part]));
  const drawnAs = new Map<string, AnchorContent>();
  const twins = new Map<Id, string>();
  for (const content of contents) {
    const reference = appearanceOf(content, definitions).part;
    if (!reference || (reference.image !== undefined && reference.image !== shown.image)) continue;
    if (!byId.has(reference.part)) continue;
    if (drawnAs.has(reference.part)) twins.set(content.id, reference.part);
    else drawnAs.set(reference.part, { id: content.id, name: content.name });
  }
  return {
    drawing: { id: element.id, name: element.name },
    image: {
      id: shown.image,
      name: catalog.image(shown.image)?.definition.name ?? shown.image,
      cleaned,
    },
    parts: listed.map((part): PlannedPart => {
      const element = drawnAs.get(part.id);
      return { part, anchor: element ? { kind: 'kept', element } : { kind: 'unmatched' } };
    }),
    contents: contents.map((each) => ({ id: each.id, name: each.name })),
    twins,
  };
}

/**
 * Plans Anchor parts…: which content each part of the drawing's picture is matched to, and which
 * parts get an element of their own, as {@link anchoringCommand} then does in one action.
 */
export function planAnchoring(state: ProjectSnapshot, request: AnchorRequest): AnchorPlanning {
  return planDrawnParts(state, request, {
    drawn: (element, view) => drawingPartsOf(state, element.id, view),
    notDrawing: (element) =>
      `The element "${element.name}" is no drawing with parts: it does not show an SVG image with its parts.`,
    noPart: (element, id) => `The picture of "${element.name}" has no part "${id}".`,
  });
}

/** The parts a plan pairs: any drawing's, an SVG image's or a solid's, by their ids. */
export interface PartsToPlan<P extends { readonly id: string }> {
  readonly drawing: AnchorContent;
  readonly parts: readonly { readonly part: P; readonly anchor: PartAnchor }[];
  readonly contents: readonly AnchorContent[];
}

/** What a plan of any drawing's parts adds to the parts it pairs. */
export interface PlannedParts {
  readonly matching: AnchorMatching;
  readonly anchors: number;
  readonly view?: Id;
  readonly nesting?: NestingChoice;
  readonly viewNesting?: readonly Id[];
}

/**
 * Plans Anchor parts… over the parts of a drawing, whatever draws them: an SVG image's here, a
 * solid's in `solids/anchoring.ts` (ADR 0075), so that both match alike.
 */
export function planDrawnParts<D extends PartsToPlan<{ readonly id: string }>>(
  state: ProjectSnapshot,
  request: AnchorRequest,
  reading: {
    drawn: (element: Element, view: ViewFile | undefined) => D | undefined;
    notDrawing: (element: Element) => string;
    noPart: (element: Element, id: string) => string;
  },
):
  | { readonly ok: true; readonly plan: D & PlannedParts }
  | { readonly ok: false; readonly problem: Problem } {
  const refuse = (code: Problem['code'], message: string, ids: Id[] = []) => ({
    ok: false as const,
    problem: problem(code, message, ids),
  });
  const index = modelIndexOf(state);
  const element = index.element(request.drawing);
  if (!element) {
    return refuse('unknown-element', `There is no element "${request.drawing}".`, [
      request.drawing,
    ]);
  }
  let view: ViewFile | undefined;
  if (request.view !== undefined) {
    view = state.views.find((each) => each.id === request.view);
    if (!view) return refuse('unknown-view', `There is no view "${request.view}".`, [request.view]);
  }
  const drawn = reading.drawn(element, view);
  if (!drawn) return refuse('invalid-command', reading.notDrawing(element), [element.id]);
  const { matching } = request;
  if (matching.by === 'external' && !isScheme(matching.scheme)) {
    return refuse(
      'invalid-external-id',
      `Parts are matched by an external identifier in a scheme, a short lowercase name such as "uberon"; "${String(matching.scheme)}" is not one.`,
    );
  }
  const asked = request.parts === undefined ? undefined : new Set(request.parts);
  for (const id of asked ?? []) {
    if (!drawn.parts.some((each) => each.part.id === id)) {
      return refuse('unknown-part', reading.noPart(element, String(id)), [element.id]);
    }
  }
  const definitions = definitionsIn(state);
  let nesting: NestingChoice | undefined;
  let madeIn: Id | undefined;
  let placing: ViewFile | undefined;
  const create = request.create;
  if (create) {
    if (!definitions.component(create.component)) {
      return refuse(
        'unknown-component',
        `No package in use defines the component "${create.component}".`,
        [create.component],
      );
    }
    placing = view ?? firstViewDrawing(state, element.id);
    madeIn = placing?.id;
    nesting =
      placing === undefined
        ? nestingOfContents(state, element.id)
        : nestingTypeFor(state, placing, create.component, element.id);
  }

  // Contents drawn as a part of the picture keep it; the others may be matched.
  const kept = new Set(
    drawn.parts.flatMap((each) => (each.anchor.kind === 'kept' ? [each.anchor.element.id] : [])),
  );
  const candidates = drawn.contents
    .filter((content) => !kept.has(content.id))
    .map((content) => index.element(content.id) as Element);
  const matcher = matcherFor(matching, crosswalksOf(state));
  const keys = candidates.map((content) => matcher.contentKeys(content));
  const taken = new Set<Id>();
  let anchors = 0;
  type Planned = D['parts'][number];
  const parts = drawn.parts.map((planned): Planned => {
    if (planned.anchor.kind === 'kept') return planned;
    if (asked && !asked.has(planned.part.id)) return planned;
    const wanted = matcher.partKeys(planned.part.id);
    const at = candidates.findIndex(
      (content, position) =>
        !taken.has(content.id) && meets(wanted, keys[position] as ReadonlySet<string>),
    );
    if (at !== -1) {
      const content = candidates[at] as Element;
      taken.add(content.id);
      anchors += 1;
      return { part: planned.part, anchor: { kind: 'matched', element: content } };
    }
    if (create && nesting) {
      anchors += 1;
      const identifier =
        matching.by === 'external'
          ? { scheme: matching.scheme, id: identifierOf(planned.part.id) }
          : undefined;
      return {
        part: planned.part,
        anchor: {
          kind: 'created',
          name: partName(planned.part.id),
          component: create.component,
          ...(identifier && isExternalId(identifier.id) ? { identifier } : {}),
        },
      };
    }
    return planned;
  });
  if (create && !nesting && parts.some((each) => each.anchor.kind === 'unmatched')) {
    return refuse(
      'not-nesting',
      `No nesting relation type can hold a new element of "${componentOrEssence(definitions, create.component).name}" inside "${element.name}".`,
      [element.id, create.component],
    );
  }
  const creates = nesting !== undefined && parts.some((each) => each.anchor.kind === 'created');
  return {
    ok: true,
    plan: {
      ...drawn,
      parts,
      matching,
      anchors,
      ...(madeIn === undefined || !creates ? {} : { view: madeIn }),
      ...(creates ? { nesting } : {}),
      ...(creates && nesting?.addToView && placing
        ? { viewNesting: [...nestingTypesInView(state, placing), nesting.relationType] }
        : {}),
    },
  };
}

/**
 * The one action that applies a plan: each content matched drawn as its part, each element planned
 * made inside the drawing, drawn as its part, all labelled `Anchor 12 parts of "Heart"`. `undefined`
 * when the plan anchors nothing.
 */
export function anchoringCommand(
  plan: PlannedParts & PartsToPlan<{ readonly id: string }>,
): BatchCommand | undefined {
  if (plan.anchors === 0) return undefined;
  const commands: Command[] = [];
  const { nesting, view, viewNesting } = plan;
  if (view !== undefined && viewNesting !== undefined) {
    commands.push({
      type: 'update-view',
      id: view,
      changes: { nestingRelationTypes: [...viewNesting] },
    });
  }
  for (const { part, anchor } of plan.parts) {
    if (anchor.kind === 'matched') {
      commands.push({
        type: 'update-element',
        id: anchor.element.id,
        changes: { appearanceTraits: { part: { part: part.id } } },
      });
    } else if (anchor.kind === 'created' && nesting) {
      commands.push({
        type: 'create-element',
        element: {
          component: anchor.component,
          name: anchor.name,
          appearance: { part: { part: part.id } },
          ...(anchor.identifier
            ? { ids: { [anchor.identifier.scheme]: anchor.identifier.id } }
            : {}),
        },
        containers: [{ container: plan.drawing.id, relationType: nesting.relationType }],
        ...(view === undefined ? {} : { inView: view }),
      });
    }
  }
  return { type: 'batch', label: anchoringLabel(plan.anchors, plan.drawing.name), commands };
}

/** How the undo history names Anchor parts…: `Anchor 12 parts of "Heart"`. */
export function anchoringLabel(count: number, drawing: string): string {
  return count === 1
    ? `Anchor 1 part of "${drawing}"`
    : `Anchor ${count.toLocaleString('en')} parts of "${drawing}"`;
}

/**
 * A name made from a part's id, for an element created for it: its words, split at separators and
 * where a lowercase letter meets a capital, the first capitalized, as `left_ventricle` and
 * `leftVentricle` give "Left ventricle" and `UBERON_0002084` gives "UBERON 0002084".
 */
export function partName(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.-]+/)
    .filter((word) => word !== '');
  if (words.length === 0) return id;
  return words
    .map((word, at) => {
      if (word.toUpperCase() === word) return word;
      return at === 0 ? word[0]?.toUpperCase() + word.slice(1) : word.toLowerCase();
    })
    .join(' ');
}

/**
 * How a part's id and a content's name read alike: lowercase, without accents, its words split at
 * separators and where a lowercase letter meets a capital, one space between them.
 */
export function nameKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .split(/[\s_.\-:/]+/u)
    .filter((word) => word !== '')
    .join(' ')
    .toLowerCase();
}

/**
 * The identifiers a part's id reads as: the id itself and, when it has a `_`, the id with its first
 * `_` read as `:`, as `UBERON_0002084` reads as `UBERON:0002084`; SVG ids cannot hold a colon.
 */
export function identifiersOf(id: string): string[] {
  const at = id.indexOf('_');
  if (at <= 0 || id.includes(':')) return [id];
  return [id, `${id.slice(0, at)}:${id.slice(at + 1)}`];
}

/** The identifier an element created for a part is given: its id read as a compact identifier. */
function identifierOf(id: string): string {
  return /^[A-Za-z]+_\d/.test(id) ? (identifiersOf(id)[1] as string) : id;
}

/** How a way of matching reads parts and contents: as sets of keys that match when they meet. */
interface Matcher {
  partKeys(id: string): ReadonlySet<string>;
  contentKeys(content: Element): ReadonlySet<string>;
}

function matcherFor(matching: AnchorMatching, tables: readonly CrosswalkTable[]): Matcher {
  if (matching.by === 'name') {
    return {
      partKeys: (id) => new Set([nameKey(id)].filter((key) => key !== '')),
      contentKeys: (content) => new Set([nameKey(content.name)].filter((key) => key !== '')),
    };
  }
  if (matching.by === 'id') {
    return { partKeys: (id) => new Set([id]), contentKeys: (content) => new Set([content.id]) };
  }
  const { scheme } = matching;
  // Every identifier an element or a part reads as, in every scheme the crosswalks reach.
  const keysOf = (ids: Readonly<Record<string, string>> | undefined) => {
    const completed = completedIds(ids, tables) ?? {};
    return Object.entries(completed).map(([each, identifier]) => `${each} ${identifier}`);
  };
  return {
    partKeys: (id) =>
      new Set(
        identifiersOf(id)
          .filter(isExternalId)
          .flatMap((identifier) => keysOf({ [scheme]: identifier })),
      ),
    contentKeys: (content) => new Set(keysOf(content.ids)),
  };
}

function meets(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const key of a) if (b.has(key)) return true;
  return false;
}

/**
 * The contents of a drawing, in the model's order: the `from` ends of the nesting relations that end
 * on it, of the view's nesting relation types, or of any without a view.
 */
export function contentsOf(
  state: ProjectSnapshot,
  drawing: Id,
  view: ViewFile | undefined,
): Element[] {
  const index = modelIndexOf(state);
  const types = view === undefined ? undefined : new Set(nestingTypesInView(state, view));
  const ids = new Set<Id>();
  if (types === undefined) {
    for (const id of index.contentsOf(drawing)) ids.add(id);
  } else {
    for (const relation of index.relationsOn(drawing)) {
      if (relation.to === drawing && types.has(relation.relationType)) ids.add(relation.from);
    }
  }
  ids.delete(drawing);
  if (ids.size === 0) return [];
  return state.model.elements.filter((element) => ids.has(element.id));
}

/** The first view that stores where an element's shapes sit, or else the project's first view. */
function firstViewDrawing(state: ProjectSnapshot, element: Id): ViewFile | undefined {
  return (
    state.views.find((view) => view.positions.some((position) => position.element === element)) ??
    state.views[0]
  );
}

/** Without a view, a new content goes inside a drawing as its other contents do. */
function nestingOfContents(state: ProjectSnapshot, drawing: Id): NestingChoice | undefined {
  const nesting = definitionsIn(state).nestingRelationTypes;
  const relation = modelIndexOf(state)
    .relationsOn(drawing)
    .find((each) => each.to === drawing && nesting.has(each.relationType));
  return relation ? { relationType: relation.relationType, addToView: false } : undefined;
}
