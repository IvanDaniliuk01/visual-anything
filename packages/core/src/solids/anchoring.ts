/**
 * Anchor parts… for solids (ADR 0075): a drawing with parts that shows a solid, its named parts and
 * the contents drawn as them, matching them to its contents as ADR 0067 matches an SVG image's (by
 * name, by id, or by an external identifier through crosswalks), and the one action that anchors
 * them. The inspector's dialog and Claude's `anchor_parts` both plan here.
 *
 * - **The parts of a drawing** are its solid's named parts, in depth-first order, each with the
 *   content drawn as it now: the first content in the model's order whose appearance names the part
 *   with this solid, or with neither a solid nor an image, as the scene places it.
 * - **The action** draws each content matched as its part by its own appearance, naming the part and
 *   the solid, `{ "part": "elbow", "solid": "robotics.arm-k3f9q2" }`. Naming the solid keeps the
 *   anchor through a replacement, which keeps the solid's id, makes the solid `in-use` while a part
 *   of it is anchored, and lets a replacement say which anchors it loses.
 * - **Lost parts** (`solidPartsLostByReplacing`). Replacing a solid loses the anchored parts its new
 *   file lacks: those of elements whose part names the solid, and of those whose part names neither
 *   and that sit in a drawing that shows the solid with its parts.
 */
import type {
  Element,
  Id,
  PartReference,
  SolidDefinition,
  SolidPart,
  ViewFile,
} from '@visual-anything/schema';
import type { BatchCommand } from '../commands/types';
import { appearanceOf, componentOrEssence } from '../definitions';
import {
  anchoringDrawing,
  drawingContentsOf,
  matchDrawingParts,
  matchedPartsCommand,
  type AnchorContent,
  type AnchorRequest,
  type MatchedParts,
  type PartAnchor,
} from '../images/anchoring';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { solidShownBy, solidsIn } from './catalog';

/** A named part of a solid, with its index among the solid's parts, in depth-first order. */
export interface IndexedSolidPart extends SolidPart {
  readonly index: number;
}

/** A part of a solid, with what it is drawn as, now or once a plan is applied. */
export interface PlannedSolidPart {
  readonly part: IndexedSolidPart;
  readonly anchor: PartAnchor;
}

/** The parts of a drawing that shows a solid with its parts, and the contents each is drawn as. */
export interface SolidDrawingParts {
  readonly drawing: AnchorContent;
  readonly solid: { readonly id: Id; readonly name: string; readonly definition: SolidDefinition };
  /** The solid's named parts, in depth-first order, each `kept` or `unmatched`. */
  readonly parts: readonly PlannedSolidPart[];
  /** The drawing's contents, in the model's order. */
  readonly contents: readonly AnchorContent[];
  /** The contents that name a part another content is drawn as, by the part they name. */
  readonly twins: ReadonlyMap<Id, string>;
}

/** What Anchor parts… would do with a solid's parts, which the dialog shows before it applies. */
export interface SolidAnchorPlan extends SolidDrawingParts, MatchedParts<IndexedSolidPart> {
  readonly parts: readonly PlannedSolidPart[];
}

/** A plan for a solid's parts, or why there can be none. */
export type SolidAnchorPlanning =
  | { readonly ok: true; readonly plan: SolidAnchorPlan }
  | { readonly ok: false; readonly problem: Problem };

/** Whether a part reference can name a part of this solid: it names the solid, or neither. */
function namesSolidOrNeither(reference: PartReference, solidId: Id): boolean {
  return (
    reference.image === undefined && (reference.solid === undefined || reference.solid === solidId)
  );
}

/** The solid an element shows with its parts, defined by a package in use; otherwise undefined. */
export function solidDrawnWithParts(
  state: ProjectSnapshot,
  element: { component: Id; appearance?: Element['appearance'] },
): SolidDefinition | undefined {
  const shown = solidShownBy(element, definitionsIn(state));
  if (shown?.placement !== 'parts') return undefined;
  return solidsIn(state).solid(shown.solid)?.definition;
}

/**
 * The parts of a drawing that shows a solid with its parts, each with the content drawn as it now,
 * and its contents, through the view's nesting relation types or, without one, every one. `undefined`
 * when the element shows no solid with its parts, or one no package in use defines.
 */
export function solidDrawingPartsOf(
  state: ProjectSnapshot,
  drawing: Id,
  view?: ViewFile,
): SolidDrawingParts | undefined {
  const element = modelIndexOf(state).element(drawing);
  if (!element || element.id === state.model.world.id) return undefined;
  const solid = solidDrawnWithParts(state, element);
  if (!solid) return undefined;
  const definitions = definitionsIn(state);
  const contents = drawingContentsOf(state, drawing, view);
  const names = new Set(solid.parts.map((part) => part.name));
  const drawnAs = new Map<string, AnchorContent>();
  const twins = new Map<Id, string>();
  for (const content of contents) {
    const reference = appearanceOf(content, definitions).part;
    if (!reference || !namesSolidOrNeither(reference, solid.id)) continue;
    if (!names.has(reference.part)) continue;
    if (drawnAs.has(reference.part)) twins.set(content.id, reference.part);
    else drawnAs.set(reference.part, { id: content.id, name: content.name });
  }
  return {
    drawing: { id: element.id, name: element.name },
    solid: { id: solid.id, name: solid.name, definition: solid },
    parts: solid.parts.map((part, index): PlannedSolidPart => {
      const content = drawnAs.get(part.name);
      return {
        part: { ...part, index },
        anchor: content ? { kind: 'kept', element: content } : { kind: 'unmatched' },
      };
    }),
    contents: contents.map((each) => ({ id: each.id, name: each.name })),
    twins,
  };
}

/**
 * Plans Anchor parts… for a drawing that shows a solid with its parts: which content each of the
 * solid's parts is matched to, and which parts get an element of their own, as
 * {@link solidAnchoringCommand} then does in one action.
 */
export function planSolidAnchoring(
  state: ProjectSnapshot,
  request: AnchorRequest,
): SolidAnchorPlanning {
  const found = anchoringDrawing(state, request);
  if (!found.ok) return found;
  const { element, view } = found;
  const drawn = solidDrawingPartsOf(state, element.id, view);
  if (!drawn) {
    return {
      ok: false,
      problem: problem(
        'invalid-command',
        `The element "${element.name}" is no drawing with parts of a solid: it does not show a solid with its parts.`,
        [element.id],
      ),
    };
  }
  const matched = matchDrawingParts(state, request, element, view, drawn, {
    idOf: (part) => part.name,
    holder: 'solid',
  });
  if (!matched.ok) return matched;
  return { ok: true, plan: { ...drawn, ...matched.matched } };
}

/**
 * The one action that applies a plan for a solid's parts: each content matched drawn as its part,
 * each element planned made inside the drawing, drawn as its part, all labelled
 * `Anchor 6 parts of "Arm"`. `undefined` when the plan anchors nothing.
 */
export function solidAnchoringCommand(plan: SolidAnchorPlan): BatchCommand | undefined {
  return matchedPartsCommand(plan, plan.drawing, (part) => ({
    part: part.name,
    solid: plan.solid.id,
  }));
}

/** An element whose shapes are drawn as a named part of a solid. */
export interface SolidAnchoredElement {
  readonly element: Element;
  readonly part: PartReference;
  /** Whether the part comes from its component rather than its own appearance. */
  readonly inherited: boolean;
  /** The solids it names its part in: the part's own, or those its containers show with their parts. */
  readonly solids: readonly Id[];
}

/**
 * The elements drawn as named parts of solids, in model order: those whose part names a solid, and
 * those whose part names neither a solid nor an image and that sit in a drawing showing a solid with
 * its parts, under every nesting relation type.
 */
export function solidAnchoredElements(state: ProjectSnapshot): SolidAnchoredElement[] {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const anySolid = solidsIn(state).solids.size > 0;
  const componentParts = new Map<Id, PartReference | undefined>();
  const componentPart = (id: Id) => {
    if (!componentParts.has(id)) {
      componentParts.set(id, componentOrEssence(definitions, id).appearance.part);
    }
    return componentParts.get(id);
  };
  const anchored: SolidAnchoredElement[] = [];
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    const own = element.appearance?.part;
    if (own === 'none') continue;
    const part = own ?? componentPart(element.component);
    if (part === undefined || part.image !== undefined) continue;
    let solids: Id[];
    if (part.solid !== undefined) solids = [part.solid];
    else if (!anySolid) continue;
    else {
      const around = new Set<Id>();
      for (const container of index.containersOf(element.id)) {
        const holder = index.element(container);
        const solid = holder && solidDrawnWithParts(state, holder);
        if (solid) around.add(solid.id);
      }
      solids = [...around];
    }
    if (solids.length === 0) continue;
    anchored.push({ element, part, inherited: own === undefined, solids });
  }
  return anchored;
}

/**
 * The parts a solid's anchored elements are drawn as that a replacement would lose (ADR 0075): the
 * parts the solid lists now that `newParts` lacks and that an element is drawn as, each with those
 * elements, in the model's order. The elements are those whose part names the solid, and those whose
 * part names neither and that sit in a drawing showing the solid with its parts (Seam 1's
 * clarification left those for Anchor parts…). The replace dialog and `replace_solid` say them before
 * the replacement applies; after it they warn `unknown-part`, and an undo brings them back.
 */
export function solidPartsLostByReplacing(
  state: ProjectSnapshot,
  solidId: Id,
  newParts: readonly Pick<SolidPart, 'name'>[],
): { part: string; elements: Id[] }[] {
  const now = new Set(
    solidsIn(state)
      .solid(solidId)
      ?.definition.parts.map((part) => part.name),
  );
  const kept = new Set(newParts.map((part) => part.name));
  const lost = new Map<string, Id[]>();
  for (const { element, part, solids } of solidAnchoredElements(state)) {
    if (!solids.includes(solidId) || kept.has(part.part) || !now.has(part.part)) continue;
    lost.set(part.part, [...(lost.get(part.part) ?? []), element.id]);
  }
  return [...lost].map(([part, elements]) => ({ part, elements }));
}
